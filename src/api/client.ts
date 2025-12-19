// src/api/client.ts
import axios, { AxiosError } from "axios";

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
  (response) => response,
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

