import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/lexend-deca/latin-400.css'
import '@fontsource/lexend-deca/latin-500.css'
import '@fontsource/roboto-mono/latin-400.css'
import '@fontsource/roboto-mono/latin-500.css'
import './index.css'
import App from './App.tsx'
import { applyTheme, getStoredTheme } from './theme.ts'

const initialTheme = getStoredTheme()
applyTheme(initialTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initialTheme={initialTheme} />
  </StrictMode>,
)
