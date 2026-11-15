import { test, expect } from '@playwright/test'
import { stat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

for (const { id, quality, label, minimumDuration } of [
  { id: 'jNQXAC9IVRw', quality: '360', label: '360p Baja', minimumDuration: 18 },
  { id: 'bDugoccFDAc', quality: '1080', label: '1080p Full HD', minimumDuration: 520 },
]) test(`descarga YouTube ${id} completo con video y audio`, async ({ page }) => {
  test.skip(!process.env.E2E_LIVE_API, 'Configura E2E_LIVE_API con tu instancia de Cobalt.')
  test.setTimeout(300_000)
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Enlace del video' }).fill(`https://www.youtube.com/watch?v=${id}`)
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('button', { name: label }).click()
  const pending = page.waitForEvent('download', { timeout: 270_000 })
  await page.getByRole('button', { name: `Descargar ${quality}p` }).click()
  const download = await pending
  expect(await download.failure()).toBeNull()
  const path = await download.path()
  expect((await stat(path)).size).toBeGreaterThan(10_000)
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8' }))
  expect(info.streams.some(stream => stream.codec_type === 'video')).toBe(true)
  expect(info.streams.some(stream => stream.codec_type === 'audio')).toBe(true)
  expect(Number(info.format.duration)).toBeGreaterThan(minimumDuration)
  if (quality === '1080') expect(info.streams.find(stream => stream.codec_type === 'video').height).toBe(1080)
  expect(page.context().pages()).toHaveLength(1)
  await expect(page.getByRole('link', { name: 'Guardar video' })).toBeVisible()
  console.log(JSON.stringify({ filename: download.suggestedFilename(), bytes: info.format.size, duration: info.format.duration, streams: info.streams.map(stream => stream.codec_type + ':' + stream.codec_name) }))
})
