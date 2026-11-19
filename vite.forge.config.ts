import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localCoachPlugin } from "./src/server/localCoachPlugin";

export default defineConfig({
  root: "apps/forge",
  envDir: "../..",
  publicDir: "../../public",
  cacheDir: "../../node_modules/.vite-forge",
  plugins: [react(), localCoachPlugin()],
  build: { outDir: "../../dist-forge", emptyOutDir: true },
});
