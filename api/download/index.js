// Vercel Serverless Function para proxy de descarga de videos
// Recibe el tunnel URL de Cobalt y descarga el video para el navegador

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // Solo permitir POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { url, filename } = await req.json();

    if (!url) {
      return new Response('Missing URL', { status: 400 });
    }

    // Descargar el video desde Cobalt
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': '*/*',
      },
    });

    if (!response.ok) {
      return new Response(`Cobalt error: ${response.status}`, { status: 502 });
    }

    // Obtener el blob
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // Extraer el nombre del archivo si no se proporcionó
    const contentDisposition = response.headers.get('content-disposition');
    let finalFilename = filename || 'video.mp4';
    if (contentDisposition && contentDisposition.includes('filename=')) {
      const match = contentDisposition.match(/filename="?(.+?)"?(?:;|$)/);
      if (match) {
        finalFilename = match[1];
      }
    }

    // Devolver el video al navegador
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${finalFilename}"`,
        'Content-Length': String(arrayBuffer.byteLength),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Download proxy error:', error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}
