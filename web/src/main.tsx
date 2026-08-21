import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
import '@fontsource/lexend-deca/latin-400.css'
import '@fontsource/roboto-mono/latin-400.css'
import './index.css'
import App from './App.tsx'
import { applyTheme, getStoredTheme } from './theme.ts'

config.autoAddCss = false

const initialTheme = getStoredTheme()
applyTheme(initialTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initialTheme={initialTheme} />
  </StrictMode>,
)
