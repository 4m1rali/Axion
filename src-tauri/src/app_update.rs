use std::path::Path;
use std::process::Command;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use tauri::AppHandle;

use crate::AxionResult;

/// Download a release asset from GitHub and launch the platform installer.
#[tauri::command]
pub async fn install_release_update(app: AppHandle, url: String) -> AxionResult<()> {
    if !url.starts_with("https://github.com/") && !url.starts_with("https://objects.githubusercontent.com/") {
        return Err("Only GitHub release download URLs are allowed".into());
    }

    let client = reqwest::Client::builder()
        .user_agent("Axion")
        .build()
        .map_err(|e| e.to_string())?;

    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let name = url
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("axion-update");
    let path = std::env::temp_dir().join(name);
    std::fs::write(&path, &bytes)?;

    launch_installer(&path).map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

fn launch_installer(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let file = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if file.ends_with(".appimage") {
            let mut perms = std::fs::metadata(path).map_err(|e| e.to_string())?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(path, perms).map_err(|e| e.to_string())?;
            Command::new(path)
                .spawn()
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
        if file.ends_with(".deb") {
            if let Ok(status) = Command::new("xdg-open").arg(path).status() {
                if status.success() {
                    return Ok(());
                }
            }
            return Err("Could not open .deb — install it with your package manager.".into());
        }
        return Err("Unsupported Linux update package (expected .AppImage or .deb).".into());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        let _ = path;
        Err("Updates are not supported on this OS.".into())
    }
}
