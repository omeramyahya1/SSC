#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State, WindowEvent};

use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

enum PythonProcess {
    Child(Child),
    Sidecar(CommandChild),
}

struct AppState {
    python_process: Mutex<Option<PythonProcess>>,
    backend_port: u16,
}

const SIDECAR_GRACE_SECONDS_ENV: &str = "SIDECAR_GRACE_SECONDS";
const DEFAULT_GRACE_SECONDS: u64 = 5;

fn python_shutdown_grace_duration() -> Duration {
    let secs = std::env::var(SIDECAR_GRACE_SECONDS_ENV)
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(DEFAULT_GRACE_SECONDS);
    Duration::from_secs(secs)
}

/* -------- Splash → Main transition -------- */
#[tauri::command]
fn splash_screen(app: AppHandle) -> Result<(), String> {
    // Close the splash window
    if let Some(splash) = app.get_webview_window("splash") {
        splash.close().map_err(|e| e.to_string())?;
    } else {
        return Err("splash window not found".into());
    }

    // Show the main window
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|e| e.to_string())?;
    } else {
        return Err("main window not found".into());
    }

    Ok(())
}

#[tauri::command]
fn prepare_for_update(state: State<AppState>) -> Result<(), String> {
    if let Some(process) = state.python_process.lock().unwrap().take() {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(2))
            .build();

        // Best-effort graceful shutdown via API
        if let Ok(client) = client {
            let url = format!("http://127.0.0.1:{}/shutdown", state.backend_port);
            let _ = client.post(url).send();
        }

        match process {
            PythonProcess::Child(mut child) => {
                let deadline = Instant::now() + python_shutdown_grace_duration();
                while Instant::now() < deadline {
                    if matches!(child.try_wait(), Ok(Some(_))) {
                        return Ok(());
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                let _ = child.kill();
                let _ = child.wait();
            }
            PythonProcess::Sidecar(child) => {
                std::thread::sleep(python_shutdown_grace_duration());
                let _ = child.kill();
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn backend_base_url(state: State<AppState>) -> String {
    format!("http://127.0.0.1:{}/", state.backend_port)
}

fn choose_backend_port() -> u16 {
    std::net::TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .expect("failed to choose a random open port for the backend")
}

fn load_env_from_file(path: std::path::PathBuf) -> Vec<(String, String)> {
    let mut variables = Vec::new();
    if let Ok(content) = std::fs::read_to_string(path) {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, value)) = line.split_once('=') {
                let value = value.trim().trim_matches('"').trim_matches('\'');
                variables.push((key.trim().to_string(), value.to_string()));
            }
        }
    }
    variables
}

fn valid_backend_mode(value: &str) -> bool {
    matches!(value, "dev" | "beta" | "prod")
}

fn resolve_backend_mode() -> String {
    std::env::var("SSC_MODE")
        .ok()
        .filter(|value| valid_backend_mode(value))
        .or_else(|| {
            let build_mode = option_env!("SSC_BUILD_MODE").unwrap_or("");
            valid_backend_mode(build_mode).then(|| build_mode.to_string())
        })
        .unwrap_or_else(|| {
            (if cfg!(debug_assertions) {
                "dev"
            } else {
                "prod"
            })
            .to_string()
        })
}

fn find_env_resource(
    filename: &str,
    res_dir: Option<&std::path::PathBuf>,
) -> Option<std::path::PathBuf> {
    if let Some(path) = res_dir {
        for candidate in [
            path.join(filename),
            path.join("resources").join(filename),
            path.join("src-python").join(filename),
        ] {
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        let mut curr = exe_path.parent();
        for _ in 0..6 {
            if let Some(path) = curr {
                let candidate = path.join(filename);
                if candidate.exists() {
                    return Some(candidate);
                }
                curr = path.parent();
            } else {
                break;
            }
        }
    }

    None
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            splash_screen,
            backend_base_url,
            prepare_for_update
        ])
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_local_data_dir()
                .expect("failed to get app data dir");

            // Ensure the directory exists
            std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");

            let db_dir_str = app_data_dir.to_string_lossy().to_string();
            let backend_port = choose_backend_port();
            let backend_port_str = backend_port.to_string();
            let backend_mode = resolve_backend_mode();
            let app_version = app.package_info().version.to_string();

            let state = AppState {
                python_process: Mutex::new(None),
                backend_port,
            };
            app.manage(state);

            #[cfg(debug_assertions)]
            {
                let mut app_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
                app_dir.pop(); // Move up from src-tauri to the project root

                // Build Python Executable Path (relative to app_dir)
                let mut python_exe = app_dir.clone();
                python_exe.push("src-python");
                python_exe.push(".venv");
                if cfg!(target_os = "windows") {
                    python_exe.push("Scripts");
                    python_exe.push("python.exe");
                } else {
                    python_exe.push("bin");
                    python_exe.push("python");
                }

                // Build Script Path (relative to app_dir)
                let mut script_path = app_dir.clone();
                script_path.push("src-python");
                script_path.push("main.py");

                println!("App Dir detected as: {:?}", app_dir);
                println!("Searching for python at: {:?}", python_exe);
                println!("Running script at: {:?}", script_path);
                println!("Backend will listen on: 127.0.0.1:{}", backend_port);

                let python_process = Command::new(&python_exe)
                    .env("SSC_DB_DIR", &db_dir_str)
                    .env("SSC_APP_VERSION", &app_version)
                    .env("PYTHONIOENCODING", "utf-8")
                    .arg(&script_path)
                    .arg("--port")
                    .arg(&backend_port_str)
                    .arg("--mode")
                    .arg(&backend_mode)
                    .spawn()
                    .expect("failed to start python backend - verify virtual environment exists");

                let state: State<AppState> = app.handle().state();
                *state.python_process.lock().unwrap() = Some(PythonProcess::Child(python_process));
            }

            #[cfg(not(debug_assertions))]
            {
                use std::io::Write;
                use tauri_plugin_shell::process::CommandEvent;

                // Create a persistent log file in the app data dir
                let mut log_path = app
                    .path()
                    .app_local_data_dir()
                    .expect("failed to get app data dir");
                log_path.push("sidecar_debug.log");
                let mut log_file = std::fs::File::create(log_path).ok();

                if let Some(ref mut f) = log_file {
                    let _ = writeln!(f, "--- Sidecar Launch Log ---");
                }

                // 1. Locate the .env resource using the official Resource Dir
                let res_dir = app.path().resource_dir().ok();

                let env_files = match backend_mode.as_str() {
                    "beta" => vec!["src-python/.env", ".env", ".env.beta"],
                    "prod" => vec!["src-python/.env", ".env", ".env.production"],
                    _ => vec!["src-python/.env", ".env"],
                };

                let mut env_sources: Vec<std::path::PathBuf> = Vec::new();
                let mut env_vars: std::collections::BTreeMap<String, String> =
                    std::collections::BTreeMap::new();

                for filename in &env_files {
                    if let Some(path) = find_env_resource(filename, res_dir.as_ref()) {
                        for (key, value) in load_env_from_file(path.clone()) {
                            env_vars.insert(key, value);
                        }
                        env_sources.push(path);
                    }
                }

                if let Some(ref mut f) = log_file {
                    let _ = writeln!(f, "RUST: Mode is: {}", backend_mode);
                    let _ = writeln!(f, "RUST: Env files loaded: {:?}", env_sources);
                    let _ = writeln!(f, "RUST: Resource Dir is: {:?}", res_dir);
                    let _ = writeln!(
                        f,
                        "RUST: Loaded {} merged variables from .env files",
                        env_vars.len()
                    );
                };

                // In production, we use the sidecar
                let mut sidecar_cmd = app
                    .shell()
                    .sidecar("python-sidecar")
                    .expect("failed to find sidecar 'python-sidecar'")
                    .env("SSC_DB_DIR", &db_dir_str)
                    .env("SSC_APP_VERSION", &app_version)
                    .env("PYTHONIOENCODING", "utf-8")
                    .env("PYTHONUNBUFFERED", "1")
                    .args(["--port", &backend_port_str, "--mode", &backend_mode]);

                // 2. Inject .env variables
                for (key, val) in env_vars {
                    sidecar_cmd = sidecar_cmd.env(key, val);
                }

                let (mut rx, child) = sidecar_cmd.spawn().expect("failed to spawn python sidecar");

                // Drain the sidecar's output to prevent pipe-clogging and log errors
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                let text = String::from_utf8_lossy(&line);
                                if let Some(mut f) = log_file.as_ref() {
                                    let _ = writeln!(f, "STDOUT: {}", text);
                                }
                            }
                            CommandEvent::Stderr(line) => {
                                let text = String::from_utf8_lossy(&line);
                                if let Some(mut f) = log_file.as_ref() {
                                    let _ = writeln!(f, "STDERR: {}", text);
                                }
                            }
                            _ => {}
                        }
                    }
                });

                let state: State<AppState> = app.handle().state();
                *state.python_process.lock().unwrap() = Some(PythonProcess::Sidecar(child));
            }
            Ok(())
        })
        /* -------- Graceful shutdown on close -------- */
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();

                    // Clone AppHandle (owned, 'static)
                    let app = window.app_handle().clone();

                    std::thread::spawn(move || {
                        // Get State INSIDE the thread
                        let state: State<AppState> = app.state();

                        if let Some(process) = state.python_process.lock().unwrap().take() {
                            let client = reqwest::blocking::Client::builder()
                                .timeout(Duration::from_secs(2))
                                .build();

                            // Best-effort graceful shutdown via API
                            if let Ok(client) = client {
                                let url =
                                    format!("http://127.0.0.1:{}/shutdown", state.backend_port);
                                let _ = client.post(url).send();
                            }

                            match process {
                                PythonProcess::Child(mut child) => {
                                    // Wait briefly for Python to exit, then force cleanup.
                                    let deadline =
                                        Instant::now() + python_shutdown_grace_duration();
                                    loop {
                                        if matches!(child.try_wait(), Ok(Some(_))) {
                                            break;
                                        }
                                        if Instant::now() >= deadline {
                                            let _ = child.kill();
                                            let _ = child.wait();
                                            break;
                                        }
                                        std::thread::sleep(Duration::from_millis(100));
                                    }
                                }
                                PythonProcess::Sidecar(child) => {
                                    std::thread::sleep(python_shutdown_grace_duration());
                                    let _ = child.kill();
                                }
                            }
                        }

                        // Exit Tauri cleanly
                        app.exit(0);
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
