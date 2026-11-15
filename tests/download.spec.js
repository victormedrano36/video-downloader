import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const api = 'https://cobalt.test/'
const signedUrl = `${api}tunnel?id=clip&exp=1999999999999&sig=a%2Bb%2Fc%3D&sec=secret&iv=nonce`
// Deterministic binary fixture; real playable files are checked separately in test:live.
const video = Buffer.from('000000206674797069736f6d0000020069736f6d69736f32617663316d7034310000', 'hex')
const cors = { 'access-control-allow-origin': '*' }

async function mockApi(page, result = { status: 'tunnel', url: signedUrl, filename: 'Mi video.mp4' }, status = 200) {
  const posts = []
  await page.route(api, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { cobalt: { version: '11.7.1' } }, headers: cors })
    } else {
      posts.push(route.request().postDataJSON())
      await route.fulfill({ status, json: result, headers: cors })
    }
  })
  return posts
}

async function search(page, url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw') {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Enlace del video' }).fill(url)
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Descargar 1080p' })).toBeVisible()
}

for (const [platform, url] of [
  ['YouTube', 'https://www.youtube.com/watch?v=jNQXAC9IVRw&t=1'],
  ['TikTok', 'https://vm.tiktok.com/AbCdEf/'],
  ['Instagram', 'https://www.instagram.com/reel/Example/?igsh=abc'],
  ['Facebook', 'https://www.facebook.com/watch/?v=12345'],
  ['X', 'https://x.com/example/status/12345'],
]) {
  test(`${platform}: conserva la firma y guarda bytes sin abrir otra página`, async ({ page, context }) => {
    const posts = await mockApi(page)
    const mediaRequests = []
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route(`${api}tunnel**`, async route => {
      mediaRequests.push(route.request().url())
      await route.fulfill({ contentType: 'video/mp4', body: video, headers: cors })
    })
    await search(page, url)
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Descargar 1080p' }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe('Mi video.mp4')
    expect(await readFile(await download.path())).toEqual(video)
    expect(mediaRequests).toEqual([signedUrl])
    expect(posts).toEqual([expect.objectContaining({ url, videoQuality: '1080', alwaysProxy: true, localProcessing: 'disabled', youtubeVideoContainer: 'mp4' })])
    await expect(page.getByRole('link', { name: 'Guardar video' })).toHaveAttribute('href', /^blob:/)
    expect(page.url()).toBe('http://127.0.0.1:5174/')
    expect(context.pages()).toHaveLength(1)
    expect(errors).toEqual([])
    // The explicit save action reuses the local file; no expired tunnel request.
    const second = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Guardar video' }).click()
    expect(await (await second).failure()).toBeNull()
    expect(mediaRequests).toHaveLength(1)
  })
}

test('muestra los errores estructurados de Cobalt sin romper React', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await mockApi(page, { status: 'error', error: { code: 'error.api.content.unavailable', context: { service: 'instagram' } } }, 400)
  await search(page)
  await page.getByRole('button', { name: 'Descargar 1080p' }).click()
  await expect(page.getByRole('alert')).toContainText('El video no está disponible')
  await expect(page.getByRole('button', { name: 'Descargar 1080p' })).toBeVisible()
  expect(errors).toEqual([])
})

for (const [name, response, message] of [
  ['archivo vacío', { contentType: 'video/mp4', body: '' }, 'archivo vacío'],
  ['página HTML', { contentType: 'text/html', body: '<html>Bad URL</html>' }, 'error en lugar de un video'],
  ['imagen en lugar de video', { contentType: 'image/jpeg', body: 'imagen' }, 'no devolvió un video'],
  ['JSON con MIME incorrecto', { contentType: 'video/mp4', body: '{"error":"Bad URL"}' }, 'error en lugar de un video'],
  ['enlace vencido', { status: 403, body: 'Bad URL' }, 'caducó o fue rechazado'],
]) {
  test(`no descarga ni redirige cuando recibe ${name}`, async ({ page, context }) => {
    await mockApi(page)
    const downloads = []
    page.on('download', download => downloads.push(download))
    await page.route(`${api}tunnel**`, route => route.fulfill({ ...response, headers: cors }))
    await search(page)
    await page.getByRole('button', { name: 'Descargar 1080p' }).click()
    await expect(page.getByRole('alert')).toContainText(message)
    expect(downloads).toHaveLength(0)
    expect(context.pages()).toHaveLength(1)
    expect(page.url()).toBe('http://127.0.0.1:5174/')
  })
}

test('los fallos de red permanecen en la página y se pueden reintentar', async ({ page }) => {
  await mockApi(page)
  await page.route(`${api}tunnel**`, route => route.abort('failed'))
  await search(page)
  await page.getByRole('button', { name: 'Descargar 1080p' }).click()
  await expect(page.getByRole('alert')).toContainText('Comprueba tu conexión')
  await expect(page.getByRole('button', { name: 'Descargar 1080p' })).toBeVisible()
})

test('permite elegir videos en una publicación con varios archivos', async ({ page }) => {
  await mockApi(page, { status: 'picker', picker: [
    { type: 'photo', url: `${api}photo.jpg` },
    { type: 'video', url: signedUrl },
    { type: 'video', url: signedUrl + '&item=2' },
  ] })
  await page.route(`${api}tunnel**`, route => route.fulfill({ contentType: 'video/mp4', body: video, headers: cors }))
  await search(page)
  await page.getByRole('button', { name: 'Descargar 1080p' }).click()
  await expect(page.getByRole('heading', { name: 'Elige el video de la publicación' })).toBeVisible()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar video 2', exact: true }).click()
  expect((await pending).suggestedFilename()).toBe('video-2.mp4')
})

test('cancelar interrumpe una transferencia sin mostrar éxito', async ({ page }) => {
  await mockApi(page)
  let started
  const requested = new Promise(resolve => { started = resolve })
  await page.route(`${api}tunnel**`, () => { started() })
  await search(page)
  await page.getByRole('button', { name: 'Descargar 1080p' }).click()
  await requested
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByRole('alert')).toHaveText(/Descarga cancelada/)
  await expect(page.getByRole('link', { name: 'Guardar video' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Descargar 1080p' })).toBeVisible()
})

test('normaliza enlaces sin https y descarta el resultado al editar el enlace', async ({ page }) => {
  await mockApi(page)
  await search(page, 'youtu.be/jNQXAC9IVRw')
  await expect(page.getByRole('textbox')).toHaveValue('https://youtu.be/jNQXAC9IVRw')
  await page.getByRole('textbox').fill('https://x.com/example/status/123')
  await expect(page.getByRole('button', { name: 'Descargar 1080p' })).toHaveCount(0)
})

test('rechaza protocolos no web antes de contactar al servicio', async ({ page }) => {
  const posts = await mockApi(page)
  await page.goto('/')
  await page.getByRole('textbox').fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('HTTP o HTTPS')
  expect(posts).toEqual([])
})

test('un servicio mal configurado muestra un error y no ofrece descargar', async ({ page }) => {
  await page.route(api, route => route.fulfill({ contentType: 'text/html', body: '<html>App</html>', headers: cors }))
  await page.goto('/')
  await page.getByRole('textbox').fill('https://youtu.be/jNQXAC9IVRw')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('página en lugar de datos')
  await expect(page.getByRole('button', { name: 'Descargar 1080p' })).toHaveCount(0)
})
