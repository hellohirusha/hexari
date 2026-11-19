import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localCoachPlugin } from "./src/server/localCoachPlugin";
export default defineConfig({
  plugins: [react(), localCoachPlugin()],
  server: { watch: { ignored: ["**/dist-forge/**"] } },
});
