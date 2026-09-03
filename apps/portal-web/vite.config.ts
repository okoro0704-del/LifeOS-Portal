/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { workspaceResolve } from "../vite-workspace";

export default defineConfig({
  plugins: [react()],
  resolve: workspaceResolve,
  server: {
    host: "127.0.0.1",
    port: 5176,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8792",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./test/setup.ts",
    pool: "threads",
    fileParallelism: false,
    maxWorkers: 1,
  },
});
