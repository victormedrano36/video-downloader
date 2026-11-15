import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { createServer } from 'node:http'
import express from 'express'
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from 'undici'
import { internalStream } from './src/stream/internal.js'
import ffmpeg from './src/stream/ffmpeg.js'

// Exercise the actual Cobalt streaming boundary against a controlled origin.
test('rejected/empty YouTube media is an HTTP error, valid media stays intact', async t => {
  // The application installs its own Undici dispatcher at startup. Do the same
  // here: Node 24's bundled dispatcher uses a newer handler API than Undici 6.
  const previousDispatcher = getGlobalDispatcher()
  const dispatcher = new Agent()
  setGlobalDispatcher(dispatcher)
  t.after(async () => {
    setGlobalDispatcher(previousDispatcher)
    await dispatcher.close()
  })
  const bytes = Buffer.from([0, 0, 0, 12, 102, 116, 121, 112, 105, 115, 111, 109])
  const requests = []
  const upstream = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`)
    const valid = req.url === '/valid'
    res.writeHead(req.url === '/rejected' ? 403 : 200, {
      'Content-Length': valid ? bytes.length : 0,
      'Content-Type': 'video/mp4',
    })
    res.end(req.method === 'HEAD' || !valid ? undefined : bytes)
  }).listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const app = express()
  app.get('/merge-empty', (req, res) => ffmpeg.remux({
    type: 'merge',
    filename: 'test.mp4',
    urls: Array(2).fill(`http://127.0.0.1:${upstream.address().port}/rejected`),
  }, res))
  let refreshes = 0
  app.get('/refresh', (req, res) => {
    const info = {
      url: `http://127.0.0.1:${upstream.address().port}/rejected`,
      service: 'youtube',
      controller: new AbortController(),
      async transplant() {
        refreshes++
        info.url = `http://127.0.0.1:${upstream.address().port}/valid`
      },
    }
    return internalStream(info, res)
  })
  app.get('/:fixture', (req, res) => internalStream({
    url: `http://127.0.0.1:${upstream.address().port}/${req.params.fixture}`,
    service: 'youtube',
    controller: new AbortController(),
  }, res))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    server.closeAllConnections()
    upstream.closeAllConnections()
    server.close()
    upstream.close()
  })
  const base = `http://127.0.0.1:${server.address().port}`
  for (const fixture of ['rejected', 'empty', 'merge-empty']) {
    const response = await fetch(`${base}/${fixture}`)
    assert.equal(response.status, 500, fixture)
    assert.notEqual(response.headers.get('content-type'), 'video/mp4')
    await response.arrayBuffer()
  }
  const response = await fetch(`${base}/valid`)
  const body = Buffer.from(await response.arrayBuffer())
  assert.equal(response.status, 200, JSON.stringify({ body: body.toString(), requests }))
  assert.deepEqual(body, bytes)
  const refreshed = await fetch(`${base}/refresh`)
  assert.equal(refreshed.status, 200)
  assert.deepEqual(Buffer.from(await refreshed.arrayBuffer()), bytes)
  assert.equal(refreshes, 1)
})
