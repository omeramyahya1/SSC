#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State, WindowEvent, AppHandle};

struct AppState {
    python_process: Mutex<Option<Child>>,
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
    /* -------- Start Python backend (dev only) -------- */
    #[cfg(debug_assertions)]
    let python_process_handle = {
        let child = Command::new(
            "/mnt/726A655027961F23/Software Projects/Solar System Calculator (SaaS)/Dev/SSC/src-python/.venv/bin/python",
        )
        .current_dir("..")
        .arg("src-python/main.py")
        .spawn()
        .expect("failed to start python backend");
        Some(child)
    };

    #[cfg(not(debug_assertions))]
    let python_process_handle = None;

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![splash_screen])
        .manage(AppState {
            python_process: Mutex::new(python_process_handle),
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

                    if let Some(mut child) = state.python_process.lock().unwrap().take() {
                        let client = reqwest::blocking::Client::new();

                        // Best-effort graceful shutdown
                        let _ = client.post("http://localhost:5000/shutdown").send();

                        // Wait for Python to exit
                        let _ = child.wait();
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
