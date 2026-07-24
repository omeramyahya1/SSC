fn main() {
    let build_mode = std::env::var("SSC_MODE")
        .ok()
        .filter(|value| matches!(value.as_str(), "dev" | "beta" | "prod"))
        .unwrap_or_else(|| "prod".to_string());

    println!("cargo:rustc-env=SSC_BUILD_MODE={}", build_mode);
    println!("cargo:rerun-if-env-changed=SSC_MODE");

    // Ensure all bundled resource .env files exist so tauri_build::build()
    // never fails with "resource path doesn't exist".
    // Real values are populated by CI workflow steps or local dev setup;
    // this only creates empty stubs as a safety net.
    let resource_env_files = [
        "../.env",
        "../.env.beta",
        "../.env.production",
        "../src-python/.env",
    ];

    for rel_path in &resource_env_files {
        let path = std::path::Path::new(rel_path);
        if !path.exists() {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(path, "");
            println!("cargo:warning=Created empty stub for missing resource: {}", rel_path);
        }
        println!("cargo:rerun-if-changed={}", rel_path);
    }

    tauri_build::build()
}
