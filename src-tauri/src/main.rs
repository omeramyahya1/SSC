// src-tauri/src/main.rs

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::{Manager, RunEvent};
use tauri::api::process::{Command, CommandEvent, Child};
use std::sync::{Arc, Mutex};

// IMPORTANT: Define the port the Python server will run on
// This must match the port used in src-python/main.py
const PY_PORT: u16 = 5000; 

fn main() {
  // Create a shared state for the sidecar child process
  let python_process_handle: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
  let python_process_handle_setup = python_process_handle.clone();

  tauri::Builder::default()
    .setup(move |app| {
      let window = app.get_window("main").unwrap();

      // Launch the Python sidecar using a conditional expression
      let (mut rx, child) = if cfg!(debug_assertions) {
        // In development, run the script via the system's python interpreter
        Command::new("python3")
            .args(["src-python/main.py"]) // Path to your Flask startup file
            .spawn()
            .expect("Failed to spawn Python sidecar")
      } else {
        // In production, run the bundled PyInstaller executable
        Command::new_sidecar("python-sidecar")
            .expect("Failed to create sidecar command")
            .spawn()
            .expect("Failed to spawn Python sidecar")
      };
      
      // Store the child process handle in the shared state
      *python_process_handle_setup.lock().unwrap() = Some(child);

      // Check for errors/status from the sidecar
      tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
          match event {
            CommandEvent::Stdout(line) => {
              println!("[Python] {}", line);
            }
            CommandEvent::Stderr(line) => {
              eprintln!("[Python ERR] {}", line);
            }
            CommandEvent::Terminated(payload) => {
              eprintln!("[Python] Process terminated: {:?}", payload);
              // Handle critical termination, perhaps shut down the Tauri app
            }
            _ => {}
          }
        }
      });

      window.once_page_load(move |_| {
          // You might send an API call here to confirm the Python sidecar is ready
          println!("Tauri UI loaded. Attempting to start communication on port {}", PY_PORT);
      });

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while running tauri application")
    .run(move |_app_handle, event| match event {
        // Crucial: Kill the Python sidecar when the Tauri app closes
        RunEvent::ExitRequested { .. } => {
          println!("Tauri app exit requested. Attempting to shut down Python sidecar.");
          // Take the child process from the shared state and kill it
          if let Some(child) = python_process_handle.lock().unwrap().take() {
              if let Err(e) = child.kill() {
                  eprintln!("Failed to kill Python sidecar: {}", e);
              } else {
                  println!("Python sidecar terminated successfully.");
              }
          }
          // The app is now allowed to exit gracefully.
        }
        _ => {}
    });
}