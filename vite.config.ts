import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Tauri sets TAURI_DEV_HOST for mobile/remote; default to loopback on Windows. */
const devHost = process.env.TAURI_DEV_HOST ?? "127.0.0.1";

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: devHost,
    origin: `http://${devHost}:1420`,
    hmr: {
      protocol: "ws",
      host: devHost,
      port: 1421,
    },
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
