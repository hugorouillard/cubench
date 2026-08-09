export const THEME_OPTIONS = [
  {
    id: 'catppuccin-mocha',
    label: 'catppuccin / mocha',
    background: '#1e1e2e',
  },
  { id: 'original', label: 'original', background: '#161713' },
  { id: 'serika-dark', label: 'serika dark', background: '#323437' },
] as const

export type Theme = (typeof THEME_OPTIONS)[number]['id']

export const DEFAULT_THEME: Theme = 'catppuccin-mocha'

const STORAGE_KEY = 'cubebench-theme'

export function isTheme(value: string | null): value is Theme {
  return THEME_OPTIONS.some((theme) => theme.id === value)
}

export function getStoredTheme(): Theme {
  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY)
    return isTheme(storedTheme) ? storedTheme : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme

  const background = THEME_OPTIONS.find((option) => option.id === theme)?.background
  if (background) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // The selected theme still applies when browser storage is unavailable.
  }
}
