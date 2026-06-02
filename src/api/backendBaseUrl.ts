import { invoke } from "@tauri-apps/api/core";

let cached: string | null = null;

export async function getBackendBaseUrl(): Promise<string> {
  if (cached) return cached;
  try {
    const url = await invoke<string>("backend_base_url");
    cached = url;
    return url;
  } catch {
    return "http://127.0.0.1:5000/";
  }
}

