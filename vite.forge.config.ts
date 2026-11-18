import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "apps/forge",
  publicDir: "../../public",
  cacheDir: "../../node_modules/.vite-forge",
  plugins: [react()],
  build: { outDir: "../../dist-forge", emptyOutDir: true },
});
