import { test, expect } from '@playwright/test'
import { stat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

test('descarga un MP4 real con video y audio desde YouTube', async ({ page }) => {
  test.skip(!process.env.E2E_LIVE_API, 'Configura E2E_LIVE_API con tu instancia de Cobalt.')
  test.setTimeout(180_000)
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Enlace del video' }).fill('https://www.youtube.com/watch?v=jNQXAC9IVRw')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('button', { name: '360p Baja' }).click()
  const pending = page.waitForEvent('download', { timeout: 150_000 })
  await page.getByRole('button', { name: 'Descargar 360p' }).click()
  const download = await pending
  expect(await download.failure()).toBeNull()
  const path = await download.path()
  expect((await stat(path)).size).toBeGreaterThan(10_000)
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8' }))
  expect(info.streams.some(stream => stream.codec_type === 'video')).toBe(true)
  expect(info.streams.some(stream => stream.codec_type === 'audio')).toBe(true)
  expect(Number(info.format.duration)).toBeGreaterThan(10)
  expect(page.context().pages()).toHaveLength(1)
  await expect(page.getByRole('link', { name: 'Guardar video' })).toBeVisible()
  console.log(JSON.stringify({ filename: download.suggestedFilename(), bytes: info.format.size, duration: info.format.duration, streams: info.streams.map(stream => stream.codec_type + ':' + stream.codec_name) }))
})
