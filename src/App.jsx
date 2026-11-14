import { useState, useEffect } from 'react'
import './App.css'

const API_BASE = 'http://localhost:3001'

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function App() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [step, setStep] = useState('input') // 'input' | 'formats' | 'downloading' | 'ready'
  const [videoInfo, setVideoInfo] = useState(null)
  const [formats, setFormats] = useState([])
  const [selectedFormat, setSelectedFormat] = useState(null)
  const [downloadReady, setDownloadReady] = useState(false)
  const [downloadPath, setDownloadPath] = useState('')
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [downloadSpeed, setDownloadSpeed] = useState('')
  const [downloadEta, setDownloadEta] = useState('')
  const [downloadedSize, setDownloadedSize] = useState('')
  const [totalSize, setTotalSize] = useState('')

  const handleFetchInfo = async (e) => {
    e.preventDefault()
    setError('')
    setVideoInfo(null)
    setFormats([])
    setDownloadReady(false)
    setDownloadPath('')
    setSelectedFormat(null)
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

    setLoading(true)
    setProgress('Buscando video...')

    try {
      // Obtener info del video
      const infoResponse = await fetch(`${API_BASE}/api/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      })

      const infoData = await infoResponse.json()

      if (!infoResponse.ok) {
        setError(infoData.error || 'No se pudo obtener información del video')
        setLoading(false)
        setProgress('')
        return
      }

      setVideoInfo(infoData)
      setProgress('Obteniendo calidades disponibles...')

      // Obtener formatos disponibles
      const formatsResponse = await fetch(`${API_BASE}/api/formats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      })

      const formatsData = await formatsResponse.json()

      if (!formatsResponse.ok) {
        setError(formatsData.error || 'No se pudieron obtener las calidades')
        setLoading(false)
        setProgress('')
        return
      }

      setFormats(formatsData.formats)

      // Seleccionar el mejor formato por defecto
      if (formatsData.formats.length > 0) {
        setSelectedFormat(formatsData.formats[0])
      }

      setStep('formats')
    } catch (err) {
      setError('Error de conexión. Verifica que el servidor esté corriendo.')
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  const handleDownload = async () => {
    if (!selectedFormat) {
      setError('Selecciona una calidad')
      return
    }

    setError('')
    setStep('downloading')
    setLoading(true)
    setProgress('Iniciando descarga...')
    setDownloadPercent(0)
    setDownloadSpeed('')
    setDownloadEta('')
    setDownloadedSize('')
    setTotalSize('')

    try {
      const downloadResponse = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          format_id: selectedFormat.format_id,
        })
      })

      const downloadData = await downloadResponse.json()

      if (!downloadResponse.ok) {
        setError(downloadData.error || 'No se pudo descargar el video')
        setLoading(false)
        setProgress('')
        setStep('formats')
        return
      }

      setDownloadPath(downloadData.download_path)
      setDownloadReady(true)
      setStep('ready')
      setProgress('')
      setDownloadPercent(100)
    } catch (err) {
      setError('Error de conexión. Verifica que el servidor esté corriendo.')
      setStep('formats')
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  // Polling para progreso de descarga
  useEffect(() => {
    let interval = null
    if (step === 'downloading') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/api/progress`)
          const data = await res.json()
          setDownloadPercent(data.percent || 0)
          setDownloadSpeed(data.speed || '')
          setDownloadEta(data.eta || '')
          setDownloadedSize(data.downloaded || '')
          setTotalSize(data.total || '')

          if (data.status === 'finished') {
            setDownloadPercent(100)
          }
        } catch {
          // Ignorar errores de polling
        }
      }, 500)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [step])

  const handleDownloadFile = () => {
    if (downloadPath) {
      window.open(`${API_BASE}${downloadPath}`, '_blank')
    }
  }

  const handleReset = () => {
    setUrl('')
    setError('')
    setVideoInfo(null)
    setFormats([])
    setSelectedFormat(null)
    setDownloadReady(false)
    setDownloadPath('')
    setStep('input')
    setLoading(false)
    setProgress('')
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
        {step === 'formats' && formats.length > 0 && (
          <div className="quality-section">
            <h3 className="section-title">
              <span className="title-icon">🎬</span>
              Selecciona la calidad
            </h3>
            <div className="quality-grid">
              {formats.map((format) => (
                <button
                  key={format.format_id}
                  className={`quality-card ${selectedFormat?.format_id === format.format_id ? 'selected' : ''}`}
                  onClick={() => setSelectedFormat(format)}
                >
                  <div className="quality-label">{format.label}</div>
                  <div className="quality-fps">{format.fps}fps</div>
                  {format.size && <div className="quality-size">{format.size}</div>}
                  <div className="quality-check">✓</div>
                </button>
              ))}
            </div>
            <button onClick={handleDownload} className="download-now-btn">
              <span className="btn-icon">⬇</span>
              Descargar {selectedFormat?.label || ''}
            </button>
          </div>
        )}

        {/* Download Progress */}
        {step === 'downloading' && (
          <div className="download-progress-section">
            <div className="progress-header">
              <span className="progress-label">Descargando video...</span>
              <span className="progress-percent">{Math.round(downloadPercent)}%</span>
            </div>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${downloadPercent}%` }}
              ></div>
            </div>
            <div className="progress-details">
              {downloadSpeed && (
                <span className="progress-detail-item">
                  <span className="progress-detail-icon">⚡</span>
                  {downloadSpeed}
                </span>
              )}
              {downloadedSize && totalSize && (
                <span className="progress-detail-item">
                  <span className="progress-detail-icon">📦</span>
                  {downloadedSize} / {totalSize}
                </span>
              )}
              {downloadEta && (
                <span className="progress-detail-item">
                  <span className="progress-detail-icon">⏳</span>
                  {downloadEta}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Download Ready */}
        {step === 'ready' && downloadReady && (
          <div className="success-section">
            <div className="success-icon">✅</div>
            <h3 className="success-title">¡Video listo!</h3>
            <p className="success-text">Tu video se ha descargado correctamente</p>
            <button onClick={handleDownloadFile} className="save-btn">
              <span className="btn-icon">💾</span>
              Guardar en mi dispositivo
            </button>
            <button onClick={handleReset} className="reset-btn">
              Descargar otro video
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="footer">
          <p>Hecho desde República Dominicana 🇩🇴 para descargar tus videos favoritos</p>
        </div>
      </div>
    </div>
  )
}

export default App
