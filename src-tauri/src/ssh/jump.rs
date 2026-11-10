use std::sync::Arc;

use russh::client::{self, connect_stream};

use super::handler::{create_gate, SshClientHandler};
use super::proxy;
use super::types::{JumpHop, TransportProxy};
use crate::error::{AxionError, AxionResult};

pub async fn connect_via_jumps(
    config: Arc<client::Config>,
    hops: &[JumpHop],
    target_host: &str,
    target_port: u16,
    target_handler: SshClientHandler,
    transport_proxy: Option<&TransportProxy>,
) -> AxionResult<client::Handle<SshClientHandler>> {
    if hops.is_empty() {
        return Err(AxionError::from("jump chain is empty"));
    }
    let mut transport = connect_hop(config.clone(), &hops[0], transport_proxy).await?;
    for hop in hops.iter().skip(1) {
        let channel = transport
            .channel_open_direct_tcpip(hop.host.clone(), hop.port as u32, "127.0.0.1", 0)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        let (handler, _) = create_gate(hop.host.clone(), hop.port);
        transport = connect_stream(config.clone(), channel.into_stream(), handler)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        authenticate_hop(&mut transport, hop).await?;
    }
    let channel = transport
        .channel_open_direct_tcpip(target_host.to_string(), target_port as u32, "127.0.0.1", 0)
        .await
        .map_err(|e| AxionError::from(e.to_string()))?;
    client::connect_stream(config, channel.into_stream(), target_handler)
        .await
        .map_err(|e| AxionError::from(e.to_string()))
}

async fn connect_hop(
    config: Arc<client::Config>,
    hop: &JumpHop,
    transport_proxy: Option<&TransportProxy>,
) -> AxionResult<client::Handle<SshClientHandler>> {
    let (handler, _) = create_gate(hop.host.clone(), hop.port);
    let mut session = proxy::ssh_connect(config, handler, &hop.host, hop.port, transport_proxy).await?;
    authenticate_hop(&mut session, hop).await?;
    Ok(session)
}

async fn authenticate_hop(session: &mut client::Handle<SshClientHandler>, hop: &JumpHop) -> AxionResult<()> {
    if let Some(password) = &hop.password {
        let result = session
            .authenticate_password(&hop.username, password)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        if result.success() {
            return Ok(());
        }
    }
    if let Some(key_ref) = &hop.key_ref {
        let key = crate::keys::key_for_auth(key_ref)?;
        let result = session
            .authenticate_publickey(&hop.username, key)
            .await
            .map_err(|e| AxionError::from(e.to_string()))?;
        if result.success() {
            return Ok(());
        }
    }
    Err(AxionError::AuthFailed)
}

pub fn parse_proxy_jump(value: &str, default_user: &str) -> Vec<JumpHop> {
    value
        .split(',')
        .filter(|part| !part.trim().is_empty())
        .map(|part| parse_jump_segment(part.trim(), default_user))
        .collect()
}

fn parse_jump_segment(part: &str, default_user: &str) -> JumpHop {
    let (user_host, port) = if let Some((host, port)) = part.rsplit_once(':') {
        if let Ok(p) = port.parse::<u16>() {
            (host, p)
        } else {
            (part, 22)
        }
    } else {
        (part, 22)
    };
    let (username, host) = if let Some((user, host)) = user_host.split_once('@') {
        (user.to_string(), host.to_string())
    } else {
        (default_user.to_string(), user_host.to_string())
    };
    JumpHop {
        host,
        port,
        username,
        password: None,
        key_ref: None,
    }
}
