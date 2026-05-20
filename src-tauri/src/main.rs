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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![splash_screen])
        .manage(AppState {
            python_process: Mutex::new(None),
        })
        .setup(|app| {
            let app_data_dir = app.path().app_local_data_dir().expect("failed to get app data dir");
            
            // Ensure the directory exists
            std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");

            let db_dir_str = app_data_dir.to_string_lossy().to_string();

            #[cfg(debug_assertions)]
            {
                let mut root_dir = std::env::current_dir().expect("failed to get current dir");
                
                // If we are inside src-tauri, go up one level to the project root
                if root_dir.ends_with("src-tauri") {
                    root_dir.pop();
                }
                
                // Build Python Executable Path
                let mut python_exe = root_dir.clone();
                python_exe.push("src-python");
                python_exe.push(".venv");
                if cfg!(target_os = "windows") {
                    python_exe.push("Scripts");
                    python_exe.push("python.exe");
                } else {
                    python_exe.push("bin");
                    python_exe.push("python");
                }

                // Build Script Path
                let mut script_path = root_dir.clone();
                script_path.push("src-python");
                script_path.push("main.py");

                println!("Project Root detected as: {:?}", root_dir);
                println!("Searching for python at: {:?}", python_exe);
                println!("Running script at: {:?}", script_path);

                let python_process = Command::new(&python_exe)
                    .env("SSC_DB_DIR", &db_dir_str)
                    .arg(&script_path)
                    .spawn()
                    .expect("failed to start python backend - verify virtual environment exists");
                
                let state: State<AppState> = app.handle().state();
                *state.python_process.lock().unwrap() = Some(PythonProcess::Child(python_process));
            }

            #[cfg(not(debug_assertions))]
            {
                // In production, we use the sidecar
                let (_rx, child) = app.shell()
                    .sidecar("python-sidecar")
                    .expect("failed to find sidecar 'python-sidecar'")
                    .env("SSC_DB_DIR", &db_dir_str)
                    .spawn()
                    .expect("failed to spawn python sidecar");
                
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
                                let _ = client.post("http://localhost:5000/shutdown").send();
                            }

                            match process {
                                PythonProcess::Child(mut child) => {
                                    // Wait briefly for Python to exit, then force cleanup.
                                    let deadline = Instant::now() + python_shutdown_grace_duration();
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
                                    // CommandChild doesn't have a public try_wait/wait in the same way,
                                    // but we can at least sleep briefly to allow graceful exit before 
                                    // Tauri's own cleanup or we can kill it.
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
