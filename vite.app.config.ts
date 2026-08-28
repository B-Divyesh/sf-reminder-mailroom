import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "app"),
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: resolve(__dirname, "dist/app"),
    emptyOutDir: true,
    target: "es2022"
  },
  server: { port: 1420, strictPort: true }
});
