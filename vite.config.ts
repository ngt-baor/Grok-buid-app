import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

/**
 * Keep public/ brand assets mirrored from assets/ (repo-local only).
 * Never copy from machine-local Grok session folders.
 */
function copyBrandLogosPlugin(): Plugin {
  const names = ["logo-light.png", "logo-dark.png", "icon.svg", "icon.png"];

  const run = () => {
    const root = path.resolve(__dirname);
    const sourceDir = path.join(root, "assets");
    const destDir = path.join(root, "public");
    fs.mkdirSync(destDir, { recursive: true });
    for (const name of names) {
      const src = path.join(sourceDir, name);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(destDir, name);
      fs.copyFileSync(src, dest);
    }
  };

  return {
    name: "copy-brand-logos",
    buildStart() {
      run();
    },
    configureServer() {
      run();
    },
  };
}

export default defineConfig({
  plugins: [react(), copyBrandLogosPlugin()],
  root: ".",
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
