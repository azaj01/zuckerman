import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@core": path.resolve(__dirname, "src/core"),
      "@main": path.resolve(__dirname, "src/main"),
      "@components": path.resolve(__dirname, "src/components"),
      "@hooks": path.resolve(__dirname, "src/hooks"),
      "@features": path.resolve(__dirname, "src/features"),
      "@lib": path.resolve(__dirname, "src/lib"),
      "@types": path.resolve(__dirname, "src/types"),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
});
