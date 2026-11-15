// Vercel Edge Function para proxy de descarga de videos
// Recibe el tunnel URL de Cobalt y descarga el video para el navegador

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  try {
    const { url, filename } = await request.json();

    if (!url) {
      return new Response('Missing URL', { status: 400 });
    }

    // Descargar el video desde Cobalt
    const response = await fetch(url);

    if (!response.ok) {
      return new Response(`Cobalt error: ${response.status}`, { status: 502 });
    }

    // Obtener el nombre del archivo
    const contentDisposition = response.headers.get('content-disposition');
    let finalFilename = filename || 'video.mp4';
    if (contentDisposition && contentDisposition.includes('filename=')) {
      const match = contentDisposition.match(/filename="?(.+?)"?(?:;|$)/);
      if (match) {
        finalFilename = match[1];
      }
    }

    // Re-stream el video al navegador sin cargar todo en memoria
    return new Response(response.body, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${finalFilename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Download proxy error:', error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}
