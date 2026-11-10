use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::error::AxionResult;
use crate::persist::paths::identity_cache_path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemIdentity {
    pub username: String,
    pub computer_name: String,
    pub display_name: Option<String>,
    pub profile_image_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdentityCache {
    schema_version: u32,
    username: String,
    computer_name: String,
    display_name: Option<String>,
    profile_image_data_url: Option<String>,
    cached_at: String,
}

const CACHE_SCHEMA: u32 = 2;

fn current_keys() -> (String, String) {
  let username = std::env::var("USER")
    .or_else(|_| std::env::var("USERNAME"))
    .unwrap_or_else(|_| "user".into());
  let computer_name = resolve_computer_name();
  (username, computer_name)
}

fn resolve_computer_name() -> String {
  #[cfg(windows)]
  {
    return std::env::var("COMPUTERNAME")
      .or_else(|_| std::env::var("HOSTNAME"))
      .unwrap_or_else(|_| "This PC".into());
  }
  #[cfg(not(windows))]
  {
    if let Ok(h) = std::fs::read_to_string("/etc/hostname") {
      let h = h.trim();
      if !h.is_empty() {
        return h.to_string();
      }
    }
    std::env::var("HOSTNAME")
      .unwrap_or_else(|_| "localhost".into())
  }
}

fn load_cache(username: &str, computer_name: &str) -> AxionResult<Option<SystemIdentity>> {
    let path = identity_cache_path()?;
    if !path.is_file() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path)?;
    let cache: IdentityCache = serde_json::from_str(&raw)?;
    if cache.schema_version != CACHE_SCHEMA {
        return Ok(None);
    }
    if cache.username != username || cache.computer_name != computer_name {
        return Ok(None);
    }
    if !cache_is_usable(&cache) {
        return Ok(None);
    }
    Ok(Some(SystemIdentity {
        username: cache.username,
        computer_name: cache.computer_name,
        display_name: cache.display_name,
        profile_image_data_url: cache.profile_image_data_url,
    }))
}

fn cache_is_usable(cache: &IdentityCache) -> bool {
  #[cfg(windows)]
  {
    return cache.profile_image_data_url.is_some()
      && cache
        .display_name
        .as_ref()
        .is_some_and(|n| !n.trim().is_empty());
  }
  #[cfg(not(windows))]
  {
    // Linux/macOS: account photo and GECOS are optional; trust cache when user/host match.
    let _ = cache;
    true
  }
}

fn save_cache(identity: &SystemIdentity) -> AxionResult<()> {
    let path = identity_cache_path()?;
    let cache = IdentityCache {
        schema_version: CACHE_SCHEMA,
        username: identity.username.clone(),
        computer_name: identity.computer_name.clone(),
        display_name: identity.display_name.clone(),
        profile_image_data_url: identity.profile_image_data_url.clone(),
        cached_at: Utc::now().to_rfc3339(),
    };
    let json = serde_json::to_string(&cache)?;
    std::fs::write(&path, json)?;
    mark_cache_hidden(&path);
    Ok(())
}

#[cfg(windows)]
fn mark_cache_hidden(path: &Path) {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{SetFileAttributesW, FILE_ATTRIBUTE_HIDDEN};

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let _ = SetFileAttributesW(PCWSTR(wide.as_ptr()), FILE_ATTRIBUTE_HIDDEN);
    }
}

#[cfg(not(windows))]
fn mark_cache_hidden(_path: &Path) {}

pub fn resolve_system_identity() -> SystemIdentity {
    let (username, computer_name) = current_keys();

    if let Ok(Some(cached)) = load_cache(&username, &computer_name) {
        return cached;
    }

    let display_name = resolve_display_name(&username);
    let profile_image_data_url = resolve_profile_image();

    let identity = SystemIdentity {
        username: username.clone(),
        computer_name: computer_name.clone(),
        display_name,
        profile_image_data_url,
    };

    let _ = save_cache(&identity);
    identity
}

fn resolve_display_name(username: &str) -> Option<String> {
    #[cfg(windows)]
    {
        for name in [
            windows_display_name_netapi(username),
            windows_display_name_local_user(username),
        ] {
            if let Some(n) = name {
                let trimmed = n.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
        for name in [windows_display_name_api(), windows_display_name_cim(username)] {
            if let Some(n) = name {
                if let Some(picked) = pick_display_name(&n, username) {
                    return Some(picked);
                }
            }
        }
        return None;
    }
    #[cfg(not(windows))]
    {
        linux_display_name(username)
    }
}

fn pick_display_name(candidate: &str, username: &str) -> Option<String> {
    let name = candidate.trim();
    if name.is_empty() {
        return None;
    }
    if name.eq_ignore_ascii_case(username) {
        return None;
    }
    if name.len() < 2 {
        return None;
    }
    Some(name.to_string())
}

#[cfg(windows)]
fn windows_display_name_netapi(username: &str) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::NetworkManagement::NetManagement::{
        NetApiBufferFree, NetUserGetInfo, NERR_Success, USER_INFO_2,
    };

    let user: Vec<u16> = username
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    let mut buf: *mut u8 = std::ptr::null_mut();
    let status = unsafe {
        NetUserGetInfo(
            PCWSTR::null(),
            PCWSTR(user.as_ptr()),
            2,
            &mut buf as *mut *mut u8,
        )
    };
    if status != NERR_Success || buf.is_null() {
        return None;
    }
    let info = unsafe { &*(buf as *const USER_INFO_2) };
    let name = unsafe { info.usri2_full_name.to_string().ok() }?;
    unsafe {
        let _ = NetApiBufferFree(Some(buf as *const std::ffi::c_void));
    }
    let name = name.trim().to_string();
    if name.is_empty() { None } else { Some(name) }
}

#[cfg(windows)]
fn windows_display_name_local_user(username: &str) -> Option<String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let safe = username.replace('\'', "''");
    let script = format!("(Get-LocalUser -Name '{safe}' -ErrorAction SilentlyContinue).FullName");
    let out = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if name.is_empty() { None } else { Some(name) }
}

#[cfg(windows)]
fn windows_display_name_api() -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::Security::Authentication::Identity::{GetUserNameExW, NameDisplay};

    let mut buf = vec![0u16; 512];
    let mut size = buf.len() as u32;
    let ok = unsafe { GetUserNameExW(NameDisplay, PWSTR(buf.as_mut_ptr()), &mut size) };
    if !ok.as_bool() {
        return None;
    }
    let len = size as usize;
    if len == 0 || len > buf.len() {
        return None;
    }
    let end = len.saturating_sub(1).min(buf.len());
    let name = String::from_utf16_lossy(&buf[..end]).trim().to_string();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

#[cfg(windows)]
fn windows_display_name_cim(username: &str) -> Option<String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let safe = username.replace('\'', "''");
    let script = format!(
        "(Get-CimInstance Win32_UserAccount -Filter \"Name='{safe}' AND LocalAccount=True\" -ErrorAction SilentlyContinue | Select-Object -First 1).FullName"
    );
    let out = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if name.is_empty() { None } else { Some(name) }
}

fn resolve_profile_image() -> Option<String> {
    #[cfg(windows)]
    {
        let mut roots: Vec<PathBuf> = Vec::new();
        if let Ok(home) = std::env::var("USERPROFILE") {
            let home = PathBuf::from(&home);
            roots.push(home.join(r"AppData\Roaming\Microsoft\Windows\AccountPictures"));
            roots.push(home.join(r"AppData\Local\Microsoft\Windows\AccountPictures"));
            roots.push(home.join(r"AppData\Local\Microsoft\Windows\WebCache"));
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            roots.push(
                PathBuf::from(local).join(r"Microsoft\Windows\Themes\CacheableAccountPictures"),
            );
        }
        roots.push(PathBuf::from(
            r"C:\ProgramData\Microsoft\User Account Pictures",
        ));

        let mut best: Option<(u64, PathBuf)> = None;
        for root in roots {
            scan_largest_image(&root, &mut best);
        }
        return path_to_data_url(best?.1);
    }
    #[cfg(not(windows))]
    {
        linux_profile_image()
    }
}

#[cfg(not(windows))]
fn linux_display_name(username: &str) -> Option<String> {
    if let Some(gecos) = linux_passwd_gecos(username) {
        if let Some(picked) = pick_display_name(&gecos, username) {
            return Some(picked);
        }
    }
    let out = match std::process::Command::new("getent")
        .args(["passwd", username])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return None,
    };
    let line = String::from_utf8_lossy(&out.stdout);
    let gecos = line.trim().split(':').nth(4)?;
    pick_display_name(gecos, username)
}

#[cfg(not(windows))]
fn linux_passwd_gecos(username: &str) -> Option<String> {
    let content = std::fs::read_to_string("/etc/passwd").ok()?;
    for line in content.lines() {
        let mut parts = line.split(':');
        let user = parts.next()?;
        if user != username {
            continue;
        }
        let _ = parts.next()?;
        let _ = parts.next()?;
        let _ = parts.next()?;
        let gecos = parts.next()?;
        let name = gecos.split(',').next().unwrap_or(gecos).trim();
        if !name.is_empty() {
            return Some(name.to_string());
        }
        return None;
    }
    None
}

#[cfg(not(windows))]
fn linux_profile_image() -> Option<String> {
    let username = std::env::var("USER").ok()?;
    let mut paths: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".face"));
        paths.push(home.join(".face.icon"));
        paths.push(home.join(".avatar"));
    }
    paths.push(PathBuf::from(format!(
        "/var/lib/AccountsService/icons/{username}"
    )));
    for path in paths {
        if path.is_file() {
            return path_to_data_url(path);
        }
    }
    None
}

#[cfg(windows)]
fn scan_largest_image(dir: &Path, best: &mut Option<(u64, PathBuf)>) {
    if !dir.is_dir() {
        return;
    }
    let read = match std::fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in read.flatten() {
        let path = entry.path();
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            scan_largest_image(&path, best);
            continue;
        }
        if !is_image_file(&path) {
            continue;
        }
        let len = meta.len();
        if len == 0 || len > 2_000_000 {
            continue;
        }
        if best.as_ref().map(|(s, _)| len > *s).unwrap_or(true) {
            *best = Some((len, path));
        }
    }
}

fn is_image_file(path: &Path) -> bool {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") | Some("jpg") | Some("jpeg") | Some("bmp") | Some("webp") => true,
        _ => false,
    }
}

fn path_to_data_url(path: PathBuf) -> Option<String> {
    let bytes = std::fs::read(&path).ok()?;
    if bytes.is_empty() || bytes.len() > 800_000 {
        return None;
    }
    let mime = match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("bmp") => "image/bmp",
        Some("webp") => "image/webp",
        _ => "image/jpeg",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:{mime};base64,{b64}"))
}
