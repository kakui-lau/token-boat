import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_CONSOLE_");
  const proxyTarget =
    process.env.VITE_CONSOLE_API_PROXY_TARGET ?? env.VITE_CONSOLE_API_PROXY_TARGET;
  const legacyProxyTarget =
    process.env.VITE_CONSOLE_LEGACY_PROXY_TARGET ?? env.VITE_CONSOLE_LEGACY_PROXY_TARGET;
  const proxy = proxyTarget
    ? {
        // Preserve the browser-facing Host for origin-bound authentication
        // ceremonies such as SIWE. The backend still receives the request
        // through the local proxy, but can compare Host and Origin exactly.
        "/api": { changeOrigin: false, target: proxyTarget },
        "/mj": { changeOrigin: true, target: proxyTarget },
        "/pg": { changeOrigin: true, target: proxyTarget },
        "/v1": { changeOrigin: true, target: proxyTarget },
        ...(legacyProxyTarget
          ? {
              "^/(?!api(?:/|$)|mj(?:/|$)|pg(?:/|$)|v1(?:/|$)|console(?:/|$))": {
                changeOrigin: true,
                target: legacyProxyTarget,
                ws: true,
              },
            }
          : {}),
      }
    : undefined;

  return {
    base: "/console/",
    plugins: [
      {
        name: "console-base-redirect",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            const requestUrl = request.url ?? "";
            const queryIndex = requestUrl.indexOf("?");
            const pathname = queryIndex >= 0 ? requestUrl.slice(0, queryIndex) : requestUrl;
            if (pathname !== "/console") {
              next();
              return;
            }

            const query = queryIndex >= 0 ? requestUrl.slice(queryIndex) : "";
            response.statusCode = 308;
            response.setHeader("Location", `/console/${query}`);
            response.end();
          });
        },
      },
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: proxy ? { proxy } : undefined,
    build: {
      outDir: "dist",
      emptyOutDir: true,
      chunkSizeWarningLimit: 800,
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
                name: "wallet-auth",
                test: /node_modules[\\/](wagmi|viem|@wagmi|@walletconnect|@metamask|@noble|@scure|abitype)[\\/]/,
                includeDependenciesRecursively: false,
                maxSize: 400 * 1024,
              },
              // CopilotKit's packages contain circular runtime initializers. Let Rolldown
              // keep that lazy feature graph together; forcing package-level groups here
              // can evaluate an imported initializer before it has been assigned.
            ],
          },
        },
      },
    },
  };
});
