import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkService, errorMessage, getApiUrl, normalizeVideoUrl,
  prepareDownload, receiveVideo, safeFilename, saveVideo,
} from '../src/download.js'

const signedUrl = 'https://cobalt.example/tunnel?id=clip&exp=1999999999&sig=a%2Bb%2Fc%3D&sec=secret&iv=nonce'
const mp4 = new Uint8Array([0, 0, 0, 12, 102, 116, 121, 112, 105, 115, 111, 109])
const api = 'https://cobalt.example/'

test('conserva parámetros de las URL de redes sociales y acepta enlaces sin esquema', () => {
  for (const url of [
    'https://youtube.com/watch?v=abc&t=3',
    'https://www.instagram.com/reel/Dfw5Eiku-W8/?utm_source=ig_web_copy_link&srtk=NTc4MTIwNjQ2YQ==',
    'https://vm.tiktok.com/123/',
    'https://www.facebook.com/watch/?v=123',
    'https://x.com/example/status/123?s=20',
  ]) assert.equal(normalizeVideoUrl(url), url)
  assert.equal(normalizeVideoUrl(' youtu.be/abc '), 'https://youtu.be/abc')
})

test('rechaza protocolos ejecutables, credenciales y texto que no sea URL', () => {
  for (const url of ['', 'javascript:alert(1)', 'file:///etc/passwd', 'https://user:password@example.com', 'no es un enlace']) {
    assert.throws(() => normalizeVideoUrl(url))
  }
  assert.throws(() => getApiUrl(''))
  assert.throws(() => getApiUrl('javascript:alert(1)'))
})

test('procesa el error de Cobalt como texto, incluso si es un objeto desconocido', () => {
  assert.match(errorMessage({ error: { code: 'error.api.content.unavailable' } }, 400), /no está disponible/)
  assert.equal(typeof errorMessage({ error: { context: { service: 'youtube' } } }, 500), 'string')
  assert.match(errorMessage({ error: { code: 'error.api.new.code' } }), /error.api.new.code/)
  assert.equal(errorMessage({ text: 'Error antiguo' }), 'Error antiguo')
  assert.match(errorMessage(null, 429), /Espera un minuto/)
})

test('solicita un MP4 con audio procesado en el servidor y conserva la firma exacta', async t => {
  let body
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, api)
    body = JSON.parse(options.body)
    return Response.json({ status: 'tunnel', url: signedUrl, filename: 'Mi video.mp4' })
  })
  const result = await prepareDownload(api, 'https://youtu.be/abc', '720', new AbortController().signal)
  assert.deepEqual(result, [{ url: signedUrl, filename: 'Mi video.mp4' }])
  assert.equal(body.alwaysProxy, true)
  assert.equal(body.localProcessing, 'disabled')
  assert.equal(body.videoQuality, '720')
  assert.equal(body.youtubeVideoContainer, 'mp4')
  assert.equal(body.downloadMode, 'auto')
})

test('no confunde una página HTML ni Flask con una instancia de Cobalt', async t => {
  const stub = t.mock.method(globalThis, 'fetch', async () => new Response('<html>App</html>', { headers: { 'content-type': 'text/html' } }))
  await assert.rejects(checkService(api), /página en lugar de datos/)
  stub.mock.mockImplementation(async () => Response.json({ message: 'OK' }))
  await assert.rejects(checkService(api), /no respondió correctamente/)
})

test('rechaza errores HTTP estructurados y respuestas sin archivo', async t => {
  const stub = t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'error', error: { code: 'error.api.content.unavailable' } }, { status: 400 }))
  await assert.rejects(prepareDownload(api, 'https://youtu.be/abc', '1080'), /no está disponible/)
  stub.mock.mockImplementation(async () => Response.json({ status: 'unknown' }))
  await assert.rejects(prepareDownload(api, 'https://youtu.be/abc', '1080'), /no devolvió un archivo/)
})

test('solo ofrece videos en un carrusel y rechaza publicaciones de fotos', async t => {
  const stub = t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'picker', picker: [
    { type: 'photo', url: 'https://example.com/photo.jpg' },
    { type: 'video', url: signedUrl },
    { type: 'video', url: signedUrl + '&item=2' },
  ] }))
  const videos = await prepareDownload(api, 'https://instagram.com/p/abc', '1080')
  assert.equal(videos.length, 2)
  assert.equal(videos[1].filename, 'video-2.mp4')
  stub.mock.mockImplementation(async () => Response.json({ status: 'picker', picker: [{ type: 'photo' }] }))
  await assert.rejects(prepareDownload(api, 'https://instagram.com/p/abc', '1080'), /no videos/)
})

test('no acepta enlaces de descarga ejecutables', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'tunnel', url: 'javascript:alert(1)' }))
  await assert.rejects(prepareDownload(api, 'https://youtu.be/abc', '1080'), /enlace de descarga inválido/)
})

test('recibe bytes del enlace firmado sin alterarlo y calcula progreso real', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, signedUrl)
    assert.equal(options.mode, 'cors')
    return new Response(mp4, { headers: { 'content-type': 'video/mp4', 'content-length': String(mp4.length) } })
  })
  const progress = []
  const blob = await receiveVideo(signedUrl, { onProgress: value => progress.push(value) })
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), mp4)
  assert.equal(progress[0].received, mp4.length)
  assert.equal(progress[0].total, mp4.length)
  assert.equal(progress[0].percent, 99) // Only the UI declares completion after validation.
})

test('no exige que el tamaño estimado coincida con el archivo final', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(mp4, { headers: { 'content-type': 'video/mp4', 'estimated-content-length': '100' } }))
  assert.equal((await receiveVideo(signedUrl)).size, mp4.length)
})

test('sin tamaño conocido, muestra progreso indeterminado', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(mp4))
  const progress = []
  await receiveVideo(signedUrl, { onProgress: value => progress.push(value) })
  assert.equal(progress[0].percent, null)
})

for (const [label, body, headers, message] of [
  ['vacío', '', { 'content-type': 'video/mp4' }, /archivo vacío/],
  ['HTML', '<html>Bad URL</html>', { 'content-type': 'text/html' }, /error en lugar/],
  ['JSON disfrazado de video', '{"error":"bad url"}', { 'content-type': 'video/mp4' }, /error en lugar/],
  ['imagen', 'image', { 'content-type': 'image/jpeg' }, /no devolvió un video/],
  ['truncado', mp4, { 'content-type': 'video/mp4', 'content-length': '100' }, /incompleta/],
]) {
  test(`rechaza archivo ${label} sin ofrecerlo para guardar`, async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response(body, { headers }))
    await assert.rejects(receiveVideo(signedUrl), message)
  })
}

test('la cancelación interrumpe la solicitud y no se transforma en error de conexión', async t => {
  t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const controller = new AbortController()
  const pending = receiveVideo(signedUrl, { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
})

test('la espera del servidor tiene límite y limpia sus temporizadores', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const pending = checkService(api)
  t.mock.timers.tick(120_001)
  await assert.rejects(pending, /tardó demasiado/)
})

test('el guardado usa un enlace blob con nombre de archivo, nunca un formulario ni otra pestaña', t => {
  const events = []
  const link = { remove() { events.push('remove') }, click() { events.push('click') } }
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else delete globalThis.document
  })
  // Node has no DOM; only the download boundary is simulated.
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement(tag) { assert.equal(tag, 'a'); return link },
    body: { appendChild(element) { assert.equal(element, link); events.push('append') } },
  } })
  saveVideo('blob:https://example.com/local-file', 'video.mp4')
  assert.equal(link.href, 'blob:https://example.com/local-file')
  assert.equal(link.download, 'video.mp4')
  assert.equal(link.target, undefined)
  assert.deepEqual(events, ['append', 'click', 'remove'])
  assert.equal(safeFilename('../clip\n.mp4'), '.._clip_.mp4')
})
