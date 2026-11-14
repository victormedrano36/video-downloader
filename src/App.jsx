import { useState, useEffect, useRef } from 'react'
import './App.css'

// URL de tu instancia de Cobalt API (desplegada en Railway u otro servidor)
// Ejemplo: 'https://tu-cobalt.railway.app/'
const API_BASE = import.meta.env.VITE_API_URL || ''

// Calidades disponibles para Cobalt
const QUALITY_OPTIONS = [
  { label: 'Max', value: 'max', description: 'Mejor disponible' },
  { label: '4K', value: '2160', description: '2160p Ultra HD' },
  { label: '1080p', value: '1080', description: 'Full HD' },
  { label: '720p', value: '720', description: 'HD' },
  { label: '480p', value: '480', description: 'SD' },
  { label: '360p', value: '360', description: 'Baja' },
]

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Detectar plataforma desde la URL
function detectPlatform(videoUrl) {
  const lower = videoUrl.toLowerCase()
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube'
  if (lower.includes('tiktok.com')) return 'tiktok'
  if (lower.includes('instagram.com')) return 'instagram'
  if (lower.includes('facebook.com') || lower.includes('fb.com')) return 'facebook'
  if (lower.includes('x.com') || lower.includes('twitter.com')) return 'twitter'
  if (lower.includes('vimeo.com')) return 'vimeo'
  if (lower.includes('reddit.com')) return 'reddit'
  if (lower.includes('twitch.tv')) return 'twitch'
  return 'unknown'
}

// Obtener info del video usando oEmbed (sin backend)
async function fetchVideoInfo(videoUrl) {
  const platform = detectPlatform(videoUrl)
  let oembedUrl = ''

  switch (platform) {
    case 'youtube':
      oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
      break
    case 'tiktok':
      oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`
      break
    case 'instagram':
      oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(videoUrl)}`
      break
    case 'facebook':
      oembedUrl = `https://graph.facebook.com/v18.0/oembed_post?url=${encodeURIComponent(videoUrl)}`
      break
    case 'twitter':
      oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(videoUrl)}`
      break
    case 'vimeo':
      oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`
      break
    default:
      return null
  }

  try {
    const response = await fetch(oembedUrl)
    if (!response.ok) return null
    const data = await response.json()
    return {
      title: data.title || data.author_name || 'Video',
      thumbnail: data.thumbnail_url || '',
      duration: data.duration ? parseInt(data.duration) : 0,
      uploader: data.author_name || '',
      author_url: data.author_url || '',
    }
  } catch {
    return null
  }
}

function App() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [step, setStep] = useState('input') // 'input' | 'formats' | 'downloading' | 'ready'
  const [videoInfo, setVideoInfo] = useState(null)
  const [selectedQuality, setSelectedQuality] = useState('1080')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [downloadPercent, setDownloadPercent] = useState(0)
  const abortControllerRef = useRef(null)

  const handleFetchInfo = async (e) => {
    e.preventDefault()
    setError('')
    setVideoInfo(null)
    setDownloadUrl('')
    setSelectedQuality('1080')
    setStep('input')

    if (!url.trim()) {
      setError('Por favor, pega un enlace de video')
      return
    }

    try {
      new URL(url.trim())
    } catch {
      setError('Por favor, ingresa un enlace válido')
      return
    }

    // Verificar que Cobalt API esté configurada
    if (!API_BASE.trim()) {
      setError('Servicio de descarga no configurado. Contacta al administrador.')
      return
    }

    setLoading(true)
    setProgress('Buscando video...')

    try {
      // Intentar obtener info con oEmbed
      const info = await fetchVideoInfo(url.trim())
      if (info) {
        setVideoInfo(info)
      }

      setProgress('Verificando enlace...')

      // Verificar que Cobalt esté accesible
      const checkResponse = await fetch(API_BASE, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      })

      if (!checkResponse.ok) {
        setError('El servicio de descarga no está disponible. Intenta de nuevo en unos segundos.')
        setLoading(false)
        setProgress('')
        return
      }

      setStep('formats')
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Se canceló la búsqueda.')
      } else {
        setError('No se pudo conectar con el servicio de descarga. Verifica tu conexión.')
      }
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  const handleDownload = async () => {
    setError('')
    setStep('downloading')
    setLoading(true)
    setProgress('Procesando video...')
    setDownloadPercent(0)
    setDownloadUrl('')

    // Simular progreso mientras Cobalt procesa
    let progressInterval
    let currentPercent = 0
    progressInterval = setInterval(() => {
      currentPercent += Math.random() * 15
      if (currentPercent > 90) currentPercent = 90
      setDownloadPercent(currentPercent)
    }, 500)

    abortControllerRef.current = abortControllerRef.current || new AbortController()

    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim(),
          videoQuality: selectedQuality,
          downloadMode: 'auto',
          filenameStyle: 'pretty',
        }),
        signal: abortControllerRef.current.signal,
      })

      clearInterval(progressInterval)
      setDownloadPercent(100)

      const data = await response.json()

      if (data.status === 'redirect' && data.url) {
        // Cobalt devuelve un enlace directo
        setDownloadUrl(data.url)
        setStep('ready')
        setProgress('')
      } else if (data.status === 'stream' && data.url) {
        // Cobalt devuelve un enlace de streaming (tunnel)
        setDownloadUrl(data.url)
        setStep('ready')
        setProgress('')
      } else if (data.status === 'picker' && data.picker) {
        // Múltiples archivos (ej: Instagram carousel)
        setError('Este contenido tiene múltiples archivos. Intenta con un video individual.')
        setStep('formats')
        setProgress('')
        setDownloadPercent(0)
      } else if (data.status === 'error') {
        const errorMsg = data.text || data.error || 'No se pudo procesar el video'
        setError(errorMsg)
        setStep('formats')
        setProgress('')
        setDownloadPercent(0)
      } else {
        setError('Respuesta inesperada del servidor. Intenta de nuevo.')
        setStep('formats')
        setProgress('')
        setDownloadPercent(0)
      }
    } catch (err) {
      clearInterval(progressInterval)
      if (err.name === 'AbortError') {
        setError('Se canceló la descarga.')
      } else {
        setError('Error de conexión con el servicio de descarga.')
      }
      setStep('formats')
      setProgress('')
      setDownloadPercent(0)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadFile = () => {
    if (downloadUrl) {
      // Crear un enlace de descarga directa
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = ''
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const handleReset = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setUrl('')
    setError('')
    setVideoInfo(null)
    setDownloadUrl('')
    setStep('input')
    setLoading(false)
    setProgress('')
    setDownloadPercent(0)
  }

  return (
    <div className="app">
      <div className="bg-animation">
        <div className="bg-circle circle-1"></div>
        <div className="bg-circle circle-2"></div>
        <div className="bg-circle circle-3"></div>
      </div>

      <div className="container">
        {/* Header */}
        <div className="header">
          <div className="logo-wrapper">
            <div className="logo-icon">⬇</div>
          </div>
          <h1 className="title">Social Media Content Download</h1>
          <p className="subtitle">Descarga videos en la mejor calidad</p>
        </div>

        {/* Platform Badges */}
        <div className="platforms">
          <span className="platform-tag youtube">
            <svg className="platform-icon-svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            YouTube
          </span>
          <span className="platform-tag tiktok">
            <svg className="platform-icon-svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.76.06-3.53.07-5.3.01-4.03-.01-8.05.02-12.07z"/>
            </svg>
            TikTok
          </span>
          <span className="platform-tag instagram">
            <svg className="platform-icon-svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 1 0 0-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 1 1-3.885 0 1.441 1.441 0 0 1 3.885 0z"/>
            </svg>
            Instagram
          </span>
          <span className="platform-tag facebook">
            <svg className="platform-icon-svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Facebook
          </span>
          <span className="platform-tag twitter">
            <svg className="platform-icon-svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            X
          </span>
        </div>

        {/* Input Form */}
        <form onSubmit={handleFetchInfo} className="download-form">
          <div className="input-wrapper">
            <div className="input-icon">🔗</div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Pega el enlace del video aquí..."
              className="url-input"
              required
              disabled={loading}
            />
            <button
              type="submit"
              className="action-btn"
              disabled={loading}
            >
              {loading ? (
                <span className="spinner"></span>
              ) : (
                'Buscar'
              )}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="loading-message">
            <div className="loading-dots">
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
            </div>
            <p>{progress || 'Procesando...'}</p>
          </div>
        )}

        {/* Video Preview */}
        {videoInfo && (step === 'formats' || step === 'downloading' || step === 'ready') && (
          <div className="video-preview">
            {videoInfo.thumbnail && (
              <div className="thumbnail-wrapper">
                <img src={videoInfo.thumbnail} alt="Thumbnail" className="video-thumbnail" />
                <div className="thumbnail-overlay">
                  <span className="duration-badge">{formatDuration(videoInfo.duration)}</span>
                </div>
              </div>
            )}
            <div className="video-details">
              <h3 className="video-title">{videoInfo.title}</h3>
              <div className="video-meta">
                {videoInfo.uploader && (
                  <span className="meta-item">
                    <span className="meta-icon">👤</span>
                    {videoInfo.uploader}
                  </span>
                )}
                {videoInfo.duration && (
                  <span className="meta-item">
                    <span className="meta-icon">⏱</span>
                    {formatDuration(videoInfo.duration)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quality Selection */}
        {step === 'formats' && (
          <div className="quality-section">
            <h3 className="section-title">
              <span className="title-icon">🎬</span>
              Selecciona la calidad
            </h3>
            <div className="quality-grid">
              {QUALITY_OPTIONS.map((quality) => (
                <button
                  key={quality.value}
                  className={`quality-card ${selectedQuality === quality.value ? 'selected' : ''}`}
                  onClick={() => setSelectedQuality(quality.value)}
                >
                  <div className="quality-label">{quality.label}</div>
                  <div className="quality-fps">{quality.description}</div>
                  <div className="quality-check">✓</div>
                </button>
              ))}
            </div>
            <button onClick={handleDownload} className="download-now-btn">
              <span className="btn-icon">⬇</span>
              Descargar {QUALITY_OPTIONS.find(q => q.value === selectedQuality)?.label || ''}
            </button>
          </div>
        )}

        {/* Download Progress */}
        {step === 'downloading' && (
          <div className="download-progress-section">
            <div className="progress-header">
              <span className="progress-label">Procesando video...</span>
              <span className="progress-percent">{Math.round(downloadPercent)}%</span>
            </div>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${downloadPercent}%` }}
              ></div>
            </div>
            <div className="progress-details">
              <span className="progress-detail-item">
                <span className="progress-detail-icon">⏳</span>
                {progress || 'Preparando descarga...'}
              </span>
            </div>
          </div>
        )}

        {/* Download Ready */}
        {step === 'ready' && downloadUrl && (
          <div className="success-section">
            <div className="success-icon">✅</div>
            <h3 className="success-title">¡Video listo!</h3>
            <p className="success-text">Tu video se ha procesado correctamente</p>
            <button onClick={handleDownloadFile} className="save-btn">
              <span className="btn-icon">💾</span>
              Descargar video
            </button>
            <button onClick={handleReset} className="reset-btn">
              Descargar otro video
            </button>
          </div>
        )}

        {/* Donate Section */}
        <div className="donate-section">
          <p className="donate-text">¿Te gusta esta herramienta? Apóyame con un café ☕</p>
          <div className="donate-buttons">
            <a href="https://ko-fi.com" target="_blank" rel="noopener noreferrer" className="donate-btn kofi">
              ☕ Buy Me a Coffee
            </a>
            <a href="https://www.paypal.com" target="_blank" rel="noopener noreferrer" className="donate-btn paypal">
              💳 PayPal Donate
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="footer">
          <p>Hecho desde República Dominicana 🇩🇴 para descargar tus videos favoritos</p>
        </div>
      </div>
    </div>
  )
}

export default App
