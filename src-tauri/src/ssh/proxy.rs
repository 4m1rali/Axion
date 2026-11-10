use std::net::IpAddr;

use base64::Engine as _;
use russh::client;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use super::handler::SshClientHandler;
use super::types::TransportProxy;
use crate::error::{AxionError, AxionResult};

impl TransportProxy {
    pub fn is_active(&self) -> bool {
        matches!(
            self.proxy_type.as_deref(),
            Some("http") | Some("socks4") | Some("socks5")
        ) && self
            .host
            .as_ref()
            .map(|h| !h.trim().is_empty())
            .unwrap_or(false)
            && self.port.unwrap_or(0) > 0
    }
}

pub async fn ssh_connect(
    config: std::sync::Arc<client::Config>,
    handler: SshClientHandler,
    target_host: &str,
    target_port: u16,
    proxy: Option<&TransportProxy>,
) -> AxionResult<client::Handle<SshClientHandler>> {
    let session = if proxy.filter(|p| p.is_active()).is_some() {
        let stream = tunnel_tcp(target_host, target_port, proxy.unwrap()).await?;
        client::connect_stream(config, stream, handler)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?
    } else {
        client::connect(config, (target_host, target_port), handler)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?
    };
    Ok(session)
}

pub async fn tunnel_tcp(target_host: &str, target_port: u16, proxy: &TransportProxy) -> AxionResult<TcpStream> {
    let proxy_host = proxy
        .host
        .as_ref()
        .ok_or_else(|| AxionError::from("proxy host missing"))?
        .trim()
        .to_string();
    let proxy_port = proxy.port.ok_or_else(|| AxionError::from("proxy port missing"))?;
    let kind = proxy.proxy_type.as_deref().unwrap_or("");
    match kind {
        "http" => http_connect(&proxy_host, proxy_port, target_host, target_port, proxy).await,
        "socks4" => socks4_connect(&proxy_host, proxy_port, target_host, target_port, proxy).await,
        "socks5" => socks5_connect(&proxy_host, proxy_port, target_host, target_port, proxy).await,
        _ => Err(AxionError::from("unsupported proxy type")),
    }
}

async fn http_connect(
    proxy_host: &str,
    proxy_port: u16,
    target_host: &str,
    target_port: u16,
    proxy: &TransportProxy,
) -> AxionResult<TcpStream> {
    let mut stream = TcpStream::connect((proxy_host, proxy_port))
        .await
        .map_err(|e| AxionError::from(format!("proxy tcp failed: {e}")))?;
    let target = format!("{target_host}:{target_port}");
    let mut req = format!("CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n");
    if let (Some(user), Some(pass)) = (&proxy.username, &proxy.password) {
        if !user.is_empty() {
            let token = base64::engine::general_purpose::STANDARD.encode(format!("{user}:{pass}"));
            req.push_str(&format!("Proxy-Authorization: Basic {token}\r\n"));
        }
    }
    req.push_str("\r\n");
    stream
        .write_all(req.as_bytes())
        .await
        .map_err(|e| AxionError::from(e.to_string()))?;
    let status = read_http_status(&mut stream).await?;
    if status != 200 {
        return Err(AxionError::from(format!("http proxy refused ({status})")));
    }
    Ok(stream)
}

async fn read_http_status(stream: &mut TcpStream) -> AxionResult<u16> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 1];
    loop {
        stream
            .read_exact(&mut chunk)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        buf.push(chunk[0]);
        if buf.len() >= 4 && buf[buf.len() - 4..] == [b'\r', b'\n', b'\r', b'\n'] {
            break;
        }
        if buf.len() > 16_384 {
            return Err(AxionError::from("http proxy response too large"));
        }
    }
    let head = String::from_utf8_lossy(&buf);
    let line = head.lines().next().unwrap_or("");
    let status = line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    Ok(status)
}

async fn socks4_connect(
    proxy_host: &str,
    proxy_port: u16,
    target_host: &str,
    target_port: u16,
    proxy: &TransportProxy,
) -> AxionResult<TcpStream> {
    let mut stream = TcpStream::connect((proxy_host, proxy_port))
        .await
        .map_err(|e| AxionError::from(format!("proxy tcp failed: {e}")))?;
    let mut req = vec![0x04, 0x01];
    req.extend_from_slice(&target_port.to_be_bytes());
    let ipv4 = parse_ipv4(target_host);
    if let Some(octets) = ipv4 {
        req.extend_from_slice(&octets);
        let user = proxy.username.as_deref().unwrap_or("");
        req.extend_from_slice(user.as_bytes());
        req.push(0);
    } else {
        req.extend_from_slice(&[0, 0, 0, 1]);
        let user = proxy.username.as_deref().unwrap_or("");
        req.extend_from_slice(user.as_bytes());
        req.push(0);
        req.extend_from_slice(target_host.as_bytes());
        req.push(0);
    }
    stream
        .write_all(&req)
        .await
        .map_err(|e| AxionError::from(e.to_string()))?;
    let mut resp = [0u8; 8];
    stream
        .read_exact(&mut resp)
        .await
        .map_err(|e| AxionError::from(e.to_string()))?;
    if resp[1] != 0x5a {
        return Err(AxionError::from(format!("socks4 rejected ({:02x})", resp[1])));
    }
    Ok(stream)
}

async fn socks5_connect(
    proxy_host: &str,
    proxy_port: u16,
    target_host: &str,
    target_port: u16,
    proxy: &TransportProxy,
) -> AxionResult<TcpStream> {
    let mut stream = TcpStream::connect((proxy_host, proxy_port))
        .await
        .map_err(|e| AxionError::from(format!("proxy tcp failed: {e}")))?;
    let user = proxy.username.as_deref().unwrap_or("");
    let pass = proxy.password.as_deref().unwrap_or("");
    let needs_auth = !user.is_empty();
    if needs_auth {
        stream
            .write_all(&[0x05, 0x02, 0x00, 0x02])
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
    } else {
        stream
            .write_all(&[0x05, 0x01, 0x00])
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
    }
    let mut method = [0u8; 2];
    stream
        .read_exact(&mut method)
        .await
        .map_err(|e| AxionError::from(e.to_string()))?;
    if method[0] != 0x05 {
        return Err(AxionError::from("invalid socks5 greeting"));
    }
    if method[1] == 0x02 {
        let u = user.as_bytes();
        let p = pass.as_bytes();
        if u.len() > 255 || p.len() > 255 {
            return Err(AxionError::from("socks5 credentials too long"));
        }
        let mut auth = vec![0x01, u.len() as u8];
        auth.extend_from_slice(u);
        auth.push(p.len() as u8);
        auth.extend_from_slice(p);
        stream
            .write_all(&auth)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        let mut auth_resp = [0u8; 2];
        stream
            .read_exact(&mut auth_resp)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        if auth_resp[1] != 0x00 {
            return Err(AxionError::from("socks5 auth failed"));
        }
    } else if method[1] != 0x00 {
        return Err(AxionError::from("socks5 method not accepted"));
    }
    let mut connect = vec![0x05, 0x01, 0x00];
    if let Ok(ip) = target_host.parse::<IpAddr>() {
        match ip {
            IpAddr::V4(v4) => {
                connect.push(0x01);
                connect.extend_from_slice(&v4.octets());
            }
            IpAddr::V6(v6) => {
                connect.push(0x04);
                connect.extend_from_slice(&v6.octets());
            }
        }
    } else {
        let host = target_host.as_bytes();
        if host.len() > 255 {
            return Err(AxionError::from("target host name too long"));
        }
        connect.push(0x03);
        connect.push(host.len() as u8);
        connect.extend_from_slice(host);
    }
    connect.extend_from_slice(&target_port.to_be_bytes());
    stream
        .write_all(&connect)
        .await
        .map_err(|e| AxionError::from(e.to_string()))?;
    let mut head = [0u8; 4];
    stream
        .read_exact(&mut head)
        .await
        .map_err(|e| AxionError::from(e.to_string()))?;
    if head[1] != 0x00 {
        return Err(AxionError::from(format!("socks5 connect failed ({:02x})", head[1])));
    }
    let atyp = head[3];
    let skip = match atyp {
        0x01 => 4 + 2,
        0x04 => 16 + 2,
        0x03 => {
            let mut len = [0u8; 1];
            stream
                .read_exact(&mut len)
                .await
                .map_err(|e| AxionError::from(e.to_string()))?;
            usize::from(len[0]) + 2
        }
        _ => 0,
    };
    if skip > 0 {
        let mut buf = vec![0u8; skip];
        stream
            .read_exact(&mut buf)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
    }
    Ok(stream)
}

fn parse_ipv4(host: &str) -> Option<[u8; 4]> {
    host.parse::<std::net::Ipv4Addr>().ok().map(|a| a.octets())
}
