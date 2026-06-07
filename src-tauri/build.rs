fn main() {
    let build_mode = std::env::var("SSC_MODE")
        .ok()
        .filter(|value| matches!(value.as_str(), "dev" | "beta" | "prod"))
        .unwrap_or_else(|| "prod".to_string());

    println!("cargo:rustc-env=SSC_BUILD_MODE={}", build_mode);
    println!("cargo:rerun-if-env-changed=SSC_MODE");

    tauri_build::build()
}
