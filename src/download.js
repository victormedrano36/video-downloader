// Keep signed media URLs intact: a GET form discards their query parameters.
const REQUEST_TIMEOUT = 120_000
const TRANSFER_IDLE_TIMEOUT = 60_000

export class DownloadError extends Error {
  constructor(message, code = '', status = 0) {
    super(message)
    this.name = 'DownloadError'
    this.code = code
    this.status = status
  }
}

export function normalizeVideoUrl(value) {
  const text = value.trim()
  let url
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    throw new DownloadError('Pega un enlace válido a un video.')
  }
  if (!text || /\s/.test(text) || !['http:', 'https:'].includes(url.protocol) ||
      url.username || url.password || !url.hostname.includes('.') ||
      (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^https?:\/\//i.test(text))) {
    throw new DownloadError('Pega un enlace HTTP o HTTPS válido a un video.')
  }
  return url.href
}

export function getApiUrl(value) {
  try {
    const url = new URL(value?.trim())
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href
  } catch { /* Report configuration problems without navigating away. */ }
  throw new DownloadError('El servicio de descarga no está configurado. Contacta al administrador.')
}

export function errorMessage(data, status = 0) {
  const code = typeof data?.error?.code === 'string' ? data.error.code : ''
  const messages = {
    'error.api.link.invalid': 'El enlace no es válido. Copia el enlace completo de la publicación.',
    'error.api.link.unsupported': 'Este enlace o plataforma no es compatible. Usa el enlace de un video individual.',
    'error.api.service.disabled': 'Esta plataforma no está habilitada en el servicio de descarga.',
    'error.api.content.unavailable': 'El video no está disponible. Puede ser privado, haberse eliminado o requerir iniciar sesión.',
    'error.api.content.age': 'Este video tiene restricciones de edad y no se puede descargar desde este servicio.',
    'error.api.content.too_long': 'El video supera la duración permitida por el servicio.',
    'error.api.content.live': 'Los videos que se están transmitiendo en vivo no se pueden descargar.',
    'error.api.youtube.login': 'YouTube está solicitando iniciar sesión. Prueba con otro video público.',
    'error.api.youtube.token': 'YouTube está rechazando al servicio de descarga. Intenta más tarde.',
    'error.api.fetch.fail': 'La plataforma no permitió obtener el video. Intenta de nuevo o prueba otro enlace público.',
    'error.api.fetch.empty': 'La plataforma no devolvió un video descargable. Puede requerir iniciar sesión o no estar disponible para este servicio.',
    'error.api.rate_exceeded': 'Se hicieron demasiadas solicitudes. Espera un minuto y vuelve a intentarlo.',
  }
  if (messages[code]) return messages[code]
  if (code.includes('auth') || status === 401) return 'El servicio de descarga requiere autorización del administrador.'
  if (status === 429) return messages['error.api.rate_exceeded']
  // Older Cobalt releases return text or a string error, newer ones return objects.
  if (typeof data?.text === 'string' && data.text) return data.text
  if (typeof data?.error === 'string' && data.error) return data.error
  return code
    ? `No se pudo procesar el video (${code}). Prueba otro enlace público o inténtalo más tarde.`
    : `El servicio no pudo procesar el video${status ? ` (HTTP ${status})` : ''}. Intenta de nuevo.`
}

function linkedController(signal, timeoutMs) {
  const controller = new AbortController()
  let timedOut = false
  let timer
  const abort = () => controller.abort(signal.reason)
  const resetTimeout = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
  }
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  resetTimeout()
  return {
    signal: controller.signal,
    resetTimeout,
    get timedOut() { return timedOut },
    dispose() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    },
  }
}

function networkError(error, request, signal) {
  if (signal?.aborted) return new DOMException('Cancelado', 'AbortError')
  if (request.timedOut) return new DownloadError('El servidor tardó demasiado en responder. Intenta de nuevo.', 'timeout')
  if (error instanceof DownloadError) return error
  return new DownloadError('No se pudo recibir el video. Comprueba tu conexión e inténtalo de nuevo.', 'network')
}

async function requestJson(url, options, signal) {
  const request = linkedController(signal, REQUEST_TIMEOUT)
  try {
    const response = await fetch(url, {
      ...options,
      signal: request.signal,
      headers: { Accept: 'application/json', ...options?.headers },
    })
    const isJson = response.headers.get('content-type')?.includes('application/json')
    const data = isJson ? await response.json() : null
    if (!response.ok || data?.status === 'error') {
      throw new DownloadError(errorMessage(data, response.status), data?.error?.code, response.status)
    }
    if (!data || typeof data !== 'object') {
      throw new DownloadError('El servicio respondió con una página en lugar de datos de descarga. Contacta al administrador.')
    }
    return data
  } catch (error) {
    throw networkError(error, request, signal)
  } finally {
    request.dispose()
  }
}

export async function checkService(apiUrl, signal) {
  const data = await requestJson(apiUrl, { method: 'GET' }, signal)
  if (!data.cobalt?.version) {
    throw new DownloadError('El servicio de descarga no respondió correctamente. Contacta al administrador.')
  }
  return data.cobalt
}

export async function prepareDownload(apiUrl, url, quality, signal) {
  const data = await requestJson(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      videoQuality: quality,
      downloadMode: 'auto',
      filenameStyle: 'pretty',
      // Avoid cross-origin CDN redirects that cannot be read by the browser.
      alwaysProxy: true,
      localProcessing: 'disabled',
      youtubeVideoCodec: 'h264',
      youtubeVideoContainer: 'mp4',
      convertGif: false,
    }),
  }, signal)

  if (['tunnel', 'redirect', 'stream'].includes(data.status) && data.url) {
    return [{ url: mediaUrl(data.url), filename: safeFilename(data.filename) }]
  }
  if (data.status === 'picker' && Array.isArray(data.picker)) {
    const videos = data.picker.filter(item => item.type === 'video').map((item, index) => ({
      url: mediaUrl(item.url),
      filename: safeFilename(item.filename || `video-${index + 1}.mp4`),
    }))
    if (videos.length) return videos
    throw new DownloadError('Esta publicación contiene imágenes, pero no videos descargables.')
  }
  if (data.status === 'local-processing') {
    throw new DownloadError('El servicio no pudo unir el audio y el video. Prueba otra calidad.')
  }
  throw new DownloadError('El servicio no devolvió un archivo de video. Intenta con otro enlace.')
}

function mediaUrl(value) {
  let url
  try { url = new URL(value) } catch { /* handled below */ }
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new DownloadError('El servicio devolvió un enlace de descarga inválido.')
  }
  // Do not decode, rebuild, or strip any parameters from this signed URL.
  return value
}

export function safeFilename(value) {
  // Filenames from an external service may contain path separators or controls.
  // eslint-disable-next-line no-control-regex
  const name = typeof value === 'string' ? value.replace(/[/\\<>:"|?*\u0000-\u001f\u007f]/g, '_').trim() : ''
  return name || 'video.mp4'
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

export async function receiveVideo(url, { signal, onProgress = () => {} } = {}) {
  const request = linkedController(signal, TRANSFER_IDLE_TIMEOUT)
  let reader
  try {
    const response = await fetch(mediaUrl(url), { signal: request.signal, mode: 'cors', credentials: 'omit' })
    if (!response.ok) {
      const message = [400, 401, 403, 404, 410].includes(response.status)
        ? 'El enlace de descarga caducó o fue rechazado. Pulsa Descargar de nuevo para generar otro.'
        : errorMessage(null, response.status)
      throw new DownloadError(message, 'transfer', response.status)
    }
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (type.startsWith('image/') || type.startsWith('audio/')) {
      throw new DownloadError('La publicación no devolvió un video. Comprueba que el enlace corresponda a un Reel o video público.')
    }
    if (/^(text\/|application\/(json|.*\+json|xml))/.test(type)) {
      throw new DownloadError('El servidor devolvió un error en lugar de un video. Intenta de nuevo.')
    }
    const exactSize = Number(response.headers.get('content-length')) || 0
    const estimatedSize = Number(response.headers.get('estimated-content-length')) || 0
    const total = exactSize || estimatedSize
    let received = 0
    let blob
    if (response.body) {
      reader = response.body.getReader()
      const chunks = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        request.resetTimeout()
        chunks.push(value)
        received += value.byteLength
        onProgress({ received, total, percent: total > 0 ? Math.min(99, received / total * 100) : null })
      }
      blob = new Blob(chunks, { type: type || 'video/mp4' })
    } else {
      blob = await response.blob()
    }
    if (!blob.size) throw new DownloadError('El servicio devolvió un archivo vacío. Prueba otra calidad o inténtalo más tarde.')
    if (exactSize && !response.headers.get('content-encoding') && blob.size !== exactSize) {
      throw new DownloadError('La descarga quedó incompleta. Intenta de nuevo.')
    }
    // Some servers return an HTML/JSON error with HTTP 200 or a video MIME type.
    const prefix = new TextDecoder().decode(await blob.slice(0, 100).arrayBuffer()).trimStart()
    if (/^(<!doctype|<html|<\?xml|\{|\[)/i.test(prefix)) {
      throw new DownloadError('El servidor devolvió un error en lugar de un video. Intenta de nuevo.')
    }
    signal?.throwIfAborted()
    return blob
  } catch (error) {
    if (reader) await reader.cancel().catch(() => {})
    throw networkError(error, request, signal)
  } finally {
    reader?.releaseLock()
    request.dispose()
  }
}

export function saveVideo(blobUrl, filename) {
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = safeFilename(filename)
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
}
