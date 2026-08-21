import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import "./styles.css";
import {
  applyTelegramStartParam,
  initializeTelegramBridge,
} from "./telegram/bridge.js";
import { initializeI18n } from "./i18n/index.js";

initializeTelegramBridge();
applyTelegramStartParam();
await initializeI18n();

const root = document.getElementById("root");
if (!root) throw new Error("Root element is missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
