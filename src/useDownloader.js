import { useState, useEffect, useRef } from 'react'
import { checkService, formatBytes, getApiUrl, normalizeVideoUrl, prepareDownload, receiveVideo, saveVideo } from './download.js'

const API_BASE = import.meta.env.VITE_API_URL || ''

export function useDownloader() {
  const [url, setUrl] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [step, setStep] = useState('input')
  const [videoInfo, setVideoInfo] = useState(null)
  const [selectedQuality, setSelectedQuality] = useState('1080')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [downloadFilename, setDownloadFilename] = useState('')
  const [downloadPercent, setDownloadPercent] = useState(null)
  const [videoChoices, setVideoChoices] = useState([])
  const abortControllerRef = useRef(null)
  const blobUrlRef = useRef('')

  useEffect(() => () => {
    abortControllerRef.current?.abort()
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
  }, [])

  const clearFile = () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    blobUrlRef.current = ''
    setDownloadUrl('')
    setDownloadFilename('')
  }

  const beginOperation = () => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setError('')
    setLoading(true)
    return controller
  }

  const finishOperation = (controller) => {
    if (abortControllerRef.current !== controller) return
    abortControllerRef.current = null
    setLoading(false)
    setProgress('')
  }

  const handleFetchInfo = async (event) => {
    event.preventDefault()
    clearFile()
    setVideoInfo(null)
    setVideoChoices([])
    setStep('input')
    setError('')
    let normalized, apiUrl
    try {
      normalized = normalizeVideoUrl(url)
      apiUrl = getApiUrl(API_BASE)
    } catch (err) {
      setError(err.message)
      return
    }
    const controller = beginOperation()
    setProgress('Conectando con el servicio de descarga...')
    try {
      await checkService(apiUrl, controller.signal)
      controller.signal.throwIfAborted()
      setUrl(normalized)
      setSourceUrl(normalized)
      setSelectedQuality('1080')
      setStep('formats')
    } catch (err) {
      if (abortControllerRef.current === controller) {
        setError(err.name === 'AbortError' ? 'Búsqueda cancelada.' : err.message)
      }
    } finally {
      finishOperation(controller)
    }
  }

  const receiveAndSave = async (item, controller) => {
    setProgress('Recibiendo archivo de video...')
    const blob = await receiveVideo(item.url, {
      signal: controller.signal,
      onProgress: ({ received, total, percent }) => {
        setDownloadPercent(percent)
        setProgress(`${formatBytes(received)} recibidos${total ? ` de aproximadamente ${formatBytes(total)}` : ''}`)
      },
    })
    controller.signal.throwIfAborted()
    const blobUrl = URL.createObjectURL(blob)
    blobUrlRef.current = blobUrl
    setDownloadUrl(blobUrl)
    setDownloadFilename(item.filename)
    setDownloadPercent(100)
    setVideoInfo({ title: item.filename, duration: 0 })
    setStep('ready')
    // Never navigate to a remote tunnel; save only a validated local file.
    saveVideo(blobUrl, item.filename)
  }

  const handleDownload = async (choice = null) => {
    clearFile()
    const controller = beginOperation()
    setStep('downloading')
    setProgress('Preparando video y audio...')
    setDownloadPercent(null)
    try {
      const items = choice ? [choice] : await prepareDownload(getApiUrl(API_BASE), sourceUrl, selectedQuality, controller.signal)
      controller.signal.throwIfAborted()
      if (items.length > 1) {
        setVideoChoices(items)
        setStep('picker')
      } else {
        await receiveAndSave(items[0], controller)
      }
    } catch (err) {
      if (abortControllerRef.current === controller) {
        setError(err.name === 'AbortError' ? 'Descarga cancelada.' : err.message)
        setStep('formats')
        setVideoChoices([])
        setDownloadPercent(null)
      }
    } finally {
      finishOperation(controller)
    }
  }

  const handleReset = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    clearFile()
    setUrl('')
    setSourceUrl('')
    setError('')
    setVideoInfo(null)
    setVideoChoices([])
    setStep('input')
    setLoading(false)
    setProgress('')
    setDownloadPercent(null)
  }

  const handleUrlChange = (event) => {
    clearFile()
    setUrl(event.target.value)
    setError('')
    setVideoInfo(null)
    setVideoChoices([])
    setStep('input')
  }

  return {
    url, error, loading, progress, step, setStep, videoInfo,
    selectedQuality, setSelectedQuality, downloadUrl, downloadFilename,
    downloadPercent, videoChoices, handleFetchInfo, handleDownload,
    handleReset, handleUrlChange, handleCancel: () => abortControllerRef.current?.abort(),
  }
}
