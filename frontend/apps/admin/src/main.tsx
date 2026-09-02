import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { router } from "@/app/router";
import "@/i18n";
import "@/styles/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Admin root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
