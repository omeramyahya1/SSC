#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use std::process::Command;

fn main() {
  #[cfg(debug_assertions)]
  {
    Command::new("/mnt/726A655027961F23/Software Projects/Solar System Calculator (SaaS)/Dev/SSC/src-python/.venv/bin/python")
      .current_dir("..")
      .arg("src-python/main.py")
      .spawn()
      .expect("failed to start python backend");
  }

  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
