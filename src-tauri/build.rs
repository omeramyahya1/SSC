fn main() {
    let build_mode = std::env::var("SSC_MODE")
        .ok()
        .filter(|value| matches!(value.as_str(), "dev" | "beta" | "prod"))
        .unwrap_or_else(|| "prod".to_string());

    println!("cargo:rustc-env=SSC_BUILD_MODE={}", build_mode);
    println!("cargo:rerun-if-env-changed=SSC_MODE");

    // Only rerun if .env exists, don't fail if it doesn't
    let env_path = std::path::Path::new("../.env");
    if env_path.exists() {
        println!("cargo:rerun-if-changed=../.env");
    }

    tauri_build::build()
}