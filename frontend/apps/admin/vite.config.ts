import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/admin/",
  plugins: [
    {
      name: "admin-base-redirect",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const requestUrl = request.url ?? "";
          const queryIndex = requestUrl.indexOf("?");
          const pathname = queryIndex >= 0 ? requestUrl.slice(0, queryIndex) : requestUrl;
          if (pathname !== "/admin") {
            next();
            return;
          }

          const query = queryIndex >= 0 ? requestUrl.slice(queryIndex) : "";
          response.statusCode = 308;
          response.setHeader("Location", `/admin/${query}`);
          response.end();
        });
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": { changeOrigin: false, target: "http://127.0.0.1:3000" },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-runtime",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              includeDependenciesRecursively: false,
              maxSize: 400 * 1024,
            },
            {
              name: "tanstack",
              test: /node_modules[\\/]@tanstack[\\/]/,
              includeDependenciesRecursively: false,
              maxSize: 400 * 1024,
            },
            {
              name: "base-ui",
              test: /node_modules[\\/]@base-ui[\\/]/,
              includeDependenciesRecursively: false,
              maxSize: 400 * 1024,
            },
          ],
        },
      },
    },
  },
});
