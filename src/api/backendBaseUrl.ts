import { invoke } from "@tauri-apps/api/core";

let cached: string | null = null;

export async function getBackendBaseUrl(): Promise<string> {
  if (cached) return cached;
  
  // No hardcoded fallback here. If invoke fails, we want the caller to handle it.
  // In Tauri v2 production, this will fail if permissions are missing.
  const url = await invoke<string>("backend_base_url");
  cached = url;
  return url;
}

