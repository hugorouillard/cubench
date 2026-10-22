import { config } from "@fortawesome/fontawesome-svg-core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "@fontsource/lexend-deca/latin-400.css";
import "./index.css";
import App from "./app/App.tsx";
import { applyTheme, getStoredTheme } from "./app/theme.ts";

config.autoAddCss = false;

const initialTheme = getStoredTheme();
applyTheme(initialTheme);

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

createRoot(root).render(
    <StrictMode>
        <App initialTheme={initialTheme} />
    </StrictMode>,
);
