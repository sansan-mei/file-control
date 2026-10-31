// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('installable public app metadata', () => {
  it('provides scoped standalone manifest, real PNG icons and HTML integration', () => {
    expect(existsSync('public/manifest.webmanifest')).toBe(true)
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))
    expect(manifest).toMatchObject({ id: '/', scope: '/', start_url: '/', display: 'standalone', theme_color: '#eef3ff', background_color: '#eef3ff' })
    for (const size of [192, 512]) {
      const icon = manifest.icons.find((icon: { sizes: string; purpose: string }) => icon.sizes === `${size}x${size}` && icon.purpose === 'any')
      const data = readFileSync(`public${icon.src}`)
      expect(data.subarray(1, 4).toString()).toBe('PNG')
      expect(data.readUInt32BE(16)).toBe(size)
      expect(data.readUInt32BE(20)).toBe(size)
    }
    expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(true)
    const html = readFileSync('index.html', 'utf8')
    expect(html).toContain('rel="manifest"')
    expect(html).toContain('name="theme-color"')
    expect(html).toContain('rel="apple-touch-icon"')
  })
})
