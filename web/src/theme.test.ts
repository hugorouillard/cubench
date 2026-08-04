import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, THEME_OPTIONS } from './theme'

describe('themes', () => {
  it('keeps Catppuccin Mocha as the default', () => {
    expect(DEFAULT_THEME).toBe('catppuccin-mocha')
  })

  it('offers Serika Dark as an optional theme', () => {
    expect(THEME_OPTIONS.some((theme) => theme.id === 'serika-dark')).toBe(true)
  })
})
