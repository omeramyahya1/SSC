// src/api/client.ts
import axios, { AxiosError } from "axios";
import { matchRefreshTargets } from "./refreshMap";
import { scheduleRefresh } from "./refreshQueue";
import { refreshStores } from "./storeRegistry";

const api = axios.create({
  baseURL: "http://127.0.0.1:5000/", // Flask backend
  timeout: 10000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);


api.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toUpperCase() || "";
    if (method && method !== "GET") {
      const rawUrl = response.config.url || "";
      const baseURL = response.config.baseURL || api.defaults.baseURL || "http://localhost";
      let path = "";

      try {
        path = new URL(rawUrl, baseURL).pathname;
      } catch {
        path = rawUrl.split("?")[0] || "";
      }

      if (path) {
        const targets = matchRefreshTargets(method, path);
        if (targets.length) {
          scheduleRefresh(targets, refreshStores);
        }
      }
    }

    return response;
  },
  (error: AxiosError) => {
    if (!error.response) {
      console.error("Network error or backend down");
    } else {
      const status = error.response.status;

      if (status === 401) {
        console.warn("Unauthorized — redirect to login");
        // Optional: logout logic here
      }

      if (status >= 500) {
        console.error("Server error:", error.response.data);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
