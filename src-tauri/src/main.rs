#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State, WindowEvent};

struct AppState {
    python_process: Mutex<Option<Child>>,
}

fn main() {
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
        .manage(AppState {
            python_process: Mutex::new(python_process_handle),
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                #[cfg(debug_assertions)]
                {
                    api.prevent_close();

                    let app_handle = window.app_handle();
                    let state: State<AppState> = app_handle.state();

                    if let Some(mut child) = state.python_process.lock().unwrap().take() {
                        let client = reqwest::blocking::Client::new();

                        if client
                            .post("http://localhost:5000/shutdown")
                            .send()
                            .is_err()
                        {
                            let _ = child.kill();
                        }

                        let _ = child.wait();
                    }

                    window.close().expect("failed to close window");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
