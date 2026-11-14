import os
import sys
import signal
import tempfile
import threading
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
import yt_dlp

# Prevenir el error "Broken pipe" en macOS
if hasattr(signal, 'SIGPIPE'):
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)

app = Flask(__name__)
CORS(app)

# Carpeta temporal para archivos de video
DOWNLOAD_DIR = os.path.join(tempfile.gettempdir(), 'video-downloader')
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Almacenar progreso de descarga activa
current_progress = {'percent': 0, 'status': 'idle', 'speed': '', 'eta': '', 'downloaded': '', 'total': ''}

def cleanup_file(filepath):
    """Eliminar archivo después de un retraso para liberar espacio."""
    def delete():
        import time
        time.sleep(60)  # Esperar 60 segundos después de la descarga
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
        except Exception:
            pass
    thread = threading.Thread(target=delete, daemon=True)
    thread.start()

def get_available_formats(url):
    """Obtener las calidades disponibles para un video."""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'js_runtimes': {'node': {'path': '/usr/local/bin/node'}},
        'remote_components': {'ejs:github': None},
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            formats = info.get('formats', [])

            # Filtrar y agrupar formatos de video con audio
            quality_options = []
            seen_heights = set()

            # Preferir formatos MP4 con video+audio combinados
            for f in formats:
                height = f.get('height')
                if not height or height in seen_heights:
                    continue

                # Buscar formato con video+audio o solo video
                vcodec = f.get('vcodec', 'none')
                acodec = f.get('acodec', 'none')
                ext = f.get('ext', 'mp4')

                if vcodec != 'none':
                    seen_heights.add(height)
                    format_id = f.get('format_id', '')
                    filesize = f.get('filesize', 0)
                    fps = f.get('fps', 30)

                    # Estimar tamaño
                    size_str = ''
                    if filesize:
                        if filesize > 1073741824:
                            size_str = f'{filesize / 1073741824:.1f} GB'
                        elif filesize > 1048576:
                            size_str = f'{filesize / 1048576:.1f} MB'
                        else:
                            size_str = f'{filesize / 1024:.0f} KB'

                    quality_options.append({
                        'label': f'{height}p',
                        'height': height,
                        'format_id': format_id,
                        'ext': ext,
                        'fps': fps,
                        'size': size_str,
                        'has_audio': acodec != 'none',
                    })

            # Ordenar por altura (mayor primero)
            quality_options.sort(key=lambda x: x['height'], reverse=True)
            return quality_options
    except Exception as e:
        raise Exception(f'No se pudieron obtener las calidades: {str(e)}')


def progress_hook(d):
    """Hook para rastrear el progreso de descarga."""
    if d['status'] == 'downloading':
        percent = d.get('downloaded', 0)
        total = d.get('total', 0)
        speed = d.get('speed', '')
        eta = d.get('eta', '')

        if total:
            pct = (percent / total) * 100
        else:
            pct = 0

        # Formatear tamaño
        def format_size(bytes_val):
            if not bytes_val:
                return '0 B'
            for unit in ['B', 'KB', 'MB', 'GB']:
                if bytes_val < 1024:
                    return f'{bytes_val:.1f} {unit}'
                bytes_val /= 1024
            return f'{bytes_val:.1f} TB'

        current_progress['percent'] = round(pct, 1)
        current_progress['status'] = 'downloading'
        current_progress['speed'] = format_size(speed) + '/s' if speed else ''
        current_progress['eta'] = str(eta) + 's' if eta else ''
        current_progress['downloaded'] = format_size(percent)
        current_progress['total'] = format_size(total)
    elif d['status'] == 'finished':
        current_progress['percent'] = 100
        current_progress['status'] = 'finished'
        current_progress['downloaded'] = format_size(d.get('downloaded', 0))
        current_progress['total'] = format_size(d.get('total', 0))

def extract_video(url, format_id=None):
    """Extraer video usando yt-dlp y devolver la ruta del archivo."""
    output_template = os.path.join(DOWNLOAD_DIR, '%(id)s.%(ext)s')

    # Construir formato según selección
    if format_id:
        # Si se especifica un formato, usarlo con audio si es necesario
        fmt = f'{format_id}+bestaudio[ext=m4a]/{format_id}/best'
    else:
        fmt = 'best'

    # Resetear progreso
    current_progress['percent'] = 0
    current_progress['status'] = 'preparing'
    current_progress['speed'] = ''
    current_progress['eta'] = ''
    current_progress['downloaded'] = ''
    current_progress['total'] = ''

    ydl_opts = {
        'format': fmt,
        'outtmpl': output_template,
        'quiet': True,
        'no_warnings': True,
        'prefer_free_formats': False,
        'extract_audio': False,
        'writethumbnail': False,
        'socket_timeout': 60,
        'retries': 10,
        'fragment_retries': 10,
        'extractor_retries': 3,
        'nopart': True,
        'keepvideo': False,
        'writetimestamp': False,
        'writedescription': False,
        'writeinfojson': False,
        'writesubtitles': False,
        'writesubtitlesfiles': False,
        'progress_hooks': [progress_hook],
        # Runtime de JavaScript necesario para YouTube
        'js_runtimes': {'node': {'path': '/usr/local/bin/node'}},
        # Componente remoto para resolver desafíos de YouTube
        'remote_components': {'ejs:github': None},
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            current_progress['status'] = 'finished'
            current_progress['percent'] = 100
            return {
                'title': info.get('title', 'Video'),
                'filename': filename,
                'thumbnail': info.get('thumbnail', ''),
                'duration': info.get('duration', 0),
                'uploader': info.get('uploader', ''),
            }
    except Exception as e:
        current_progress['status'] = 'error'
        error_str = str(e)
        if 'Errno 32' in error_str or 'Broken pipe' in error_str:
            raise Exception('La conexión se interrumpió durante la descarga. Intenta de nuevo con un video más corto o verifica tu conexión a internet.')
        raise Exception(error_str)

@app.route('/api/info', methods=['POST'])
def get_info():
    """Obtener información del video sin descargar."""
    data = request.get_json()
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': 'Por favor, proporciona un enlace de video'}), 400

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'js_runtimes': {'node': {'path': '/usr/local/bin/node'}},
        'remote_components': {'ejs:github': None},
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return jsonify({
                'title': info.get('title', 'Video'),
                'thumbnail': info.get('thumbnail', ''),
                'duration': info.get('duration', 0),
                'uploader': info.get('uploader', ''),
                'webpage_url': info.get('webpage_url', ''),
            })
    except Exception as e:
        return jsonify({'error': f'No se pudo obtener información del video: {str(e)}'}), 400

@app.route('/api/formats', methods=['POST'])
def get_formats():
    """Obtener las calidades disponibles para un video."""
    data = request.get_json()
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': 'Por favor, proporciona un enlace de video'}), 400

    try:
        formats = get_available_formats(url)
        return jsonify({
            'formats': formats,
            'count': len(formats),
        })
    except Exception as e:
        return jsonify({'error': f'No se pudieron obtener las calidades: {str(e)}'}), 400

@app.route('/api/download', methods=['POST'])
def download():
    """Descargar video y devolver el archivo."""
    data = request.get_json()
    url = data.get('url', '').strip()
    format_id = data.get('format_id', None)

    if not url:
        return jsonify({'error': 'Por favor, proporciona un enlace de video'}), 400

    try:
        result = extract_video(url, format_id)
        return jsonify({
            'status': 'success',
            'title': result['title'],
            'filename': os.path.basename(result['filename']),
            'download_path': f"/api/stream/{os.path.basename(result['filename'])}",
        })
    except Exception as e:
        error_msg = str(e)
        if 'ERROR' in error_msg:
            error_msg = error_msg.split('ERROR')[-1].strip()
        return jsonify({'error': f'No se pudo descargar el video: {error_msg}'}), 500

@app.route('/api/progress', methods=['GET'])
def get_progress():
    """Obtener el progreso de la descarga actual."""
    return jsonify(current_progress)

@app.route('/api/stream/<filename>', methods=['GET'])
def stream_video(filename):
    """Servir el archivo de video descargado para que el navegador lo descargue."""
    filepath = os.path.join(DOWNLOAD_DIR, filename)

    if not os.path.exists(filepath):
        return jsonify({'error': 'Archivo no encontrado'}), 404

    # Programar la limpieza del archivo
    cleanup_file(filepath)

    return send_file(
        filepath,
        as_attachment=True,
        download_name=f'video.{filename.rsplit(".", 1)[-1] if "." in filename else "mp4"}',
        mimetype='video/mp4'
    )

if __name__ == '__main__':
    print(f'Servidor backend corriendo en http://localhost:3001')
    print(f'Archivos temporales en: {DOWNLOAD_DIR}')
    app.run(host='0.0.0.0', port=3001, debug=False)
