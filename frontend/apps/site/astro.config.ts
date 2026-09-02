import react from "@astrojs/react";
import { defineConfig } from "astro/config";

const backendProxy = { changeOrigin: false, target: "http://127.0.0.1:3000" };

export default defineConfig({
  integrations: [react()],
  output: "static",
  site: "https://tokenboat.com",
  vite: {
    preview: {
      proxy: {
        "/api": backendProxy,
      },
    },
    server: {
      proxy: {
        "/api": backendProxy,
      },
    },
  },
});
