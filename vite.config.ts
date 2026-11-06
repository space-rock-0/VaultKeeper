import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const clientId = env.VITE_GOOGLE_CLIENT_ID?.trim();
  if (clientId && !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    throw new Error("VITE_GOOGLE_CLIENT_ID must be a public Google Web client ID ending in .apps.googleusercontent.com. Do not use a client secret.");
  }
  if (clientId && env.GOOGLE_CLIENT_ID?.trim() && clientId !== env.GOOGLE_CLIENT_ID.trim()) {
    throw new Error("GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID must contain the same public Google Web client ID.");
  }
  return {
    plugins: [react()],
    server: { headers: { "Cross-Origin-Opener-Policy": "same-origin-allow-popups" } },
  };
});
