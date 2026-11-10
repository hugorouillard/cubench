import { config } from "@fortawesome/fontawesome-svg-core"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fortawesome/fontawesome-svg-core/styles.css"
import "@fontsource/lexend-deca/latin-400.css"
import "./index.css"
import { App } from "./app/index.tsx"

config.autoAddCss = false

const root = document.getElementById("root")
if (!root) throw new Error("Missing root element")

createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
