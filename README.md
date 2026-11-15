# VicDownloader

Frontend React + Vite para descargar videos mediante una instancia propia de Cobalt. La instancia procesa el video y el audio; el navegador recibe el archivo, comprueba la respuesta y lo guarda sin abrir otra página.

## Ejecutar localmente

Requisitos: Node.js 22.12+ y una instancia de Cobalt accesible. Python y FFmpeg no son necesarios para ejecutar este frontend.

```bash
cd /Users/victormedrano/Documents/video-downloader
npm ci
cp .env.example .env.local
```

Configura en `.env.local` la URL de la **raíz de tu instancia de Cobalt**, por ejemplo:

```dotenv
VITE_API_URL=https://tu-instancia-cobalt.up.railway.app/
```

Si ya tienes un `.env.local` configurado, consérvalo en lugar de sobrescribirlo. Después:

```bash
npm run dev
```

Abre la dirección indicada por Vite, pega el enlace, pulsa **Buscar**, elige una calidad y pulsa **Descargar**. Al terminar aparece **Guardar video** para repetir el guardado si el navegador lo bloqueó. El archivo permanece disponible mientras no cambies el enlace, reinicies el formulario o cierres la página.

La calidad seleccionada es un máximo: la calidad final depende de las versiones que la plataforma ofrezca. Las publicaciones con varios videos permiten elegir uno; las publicaciones que contienen solo fotos muestran un mensaje.

## Configurar Cobalt

- `GET /` debe devolver JSON con `cobalt.version`; `POST /` debe admitir el esquema de la API de Cobalt.
- Tanto `/` como `/tunnel` deben permitir CORS desde el dominio del frontend.
- Los enlaces de túnel deben señalar a la URL pública HTTPS del servicio, no a un nombre interno del contenedor.
- La instancia debe permitir procesar y unir audio/video en el servidor. El cliente solicita `alwaysProxy: true` y `localProcessing: disabled`.
- No pongas claves privadas en variables `VITE_*`: Vite las incluye en el JavaScript público. Una instancia que exija autenticación necesita una integración de servidor que proteja esas claves.
- Mantén actualizada tu instancia: los cambios de YouTube, Instagram y otras redes pueden afectar sus extractores.

Consulta la [API oficial de Cobalt](https://github.com/imputnet/cobalt/blob/main/docs/api.md) y la [guía para alojar una instancia](https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md). El sitio público cobalt.tools no sustituye a tu propia API.

Los archivos `server.py`, `requirements.txt`, `Procfile` y `render-build.sh` pertenecen a una implementación Flask/yt-dlp anterior. **El frontend actual no los usa.** No configures `VITE_API_URL` con ese servidor: los contratos de las dos API son diferentes.

## Qué se corrigió

1. El formulario GET usado para descargar eliminaba `id`, `exp`, `sig`, `sec` e `iv` del enlace firmado. El cliente ahora hace fetch de la URL completa, sin reconstruirla.
2. Los enlaces a CDNs pueden bloquear peticiones del navegador. Se solicita a Cobalt que envíe los archivos mediante su túnel con CORS.
3. Un error estructurado `{ error: { code, context } }` podía enviarse directamente a React y romper la pantalla. Ahora se transforma siempre en un mensaje legible.
4. Se eliminó el progreso aleatorio. El progreso usa bytes recibidos y, si existe, el tamaño real o estimado. Sin tamaño conocido, el indicador es indeterminado.
5. Se comprueban errores HTTP, archivos vacíos, imágenes/audio en lugar de video, respuestas HTML/JSON y tamaños incompletos. Los errores permanecen en la página.
6. La cancelación aborta las solicitudes activas. Los enlaces blob se liberan al cambiar de video o cerrar la vista.
7. Las peticiones oEmbed externas ya no bloquean ni condicionan la descarga. El nombre del archivo viene de Cobalt.

## Verificación

```bash
npm test
npm run lint
npm run build
```

Las pruebas de lógica usan respuestas controladas y no consumen tu servidor. Cubren firmas, errores, formatos, cancelación, tiempo de espera, progreso y guardado.

Pruebas de navegador reproducibles:

```bash
npx playwright install chromium
npm run test:e2e
```

El servidor de prueba se inicia en 127.0.0.1:5174 con una API simulada. Para usar un navegador Chromium ya instalado, define `PLAYWRIGHT_EXECUTABLE_PATH`.

Prueba real opcional con tu instancia (requiere también `ffprobe` en PATH para verificar audio/video):

```bash
E2E_LIVE_API=https://tu-instancia-cobalt.up.railway.app/ npm run test:live
```

## Publicar en Vercel

1. Configura `VITE_API_URL` en las variables de entorno de Vercel para Production y, si corresponde, Preview.
2. Publica estos cambios mediante el repositorio conectado o tu flujo habitual de despliegue.
3. Usa `npm run build` como comando de compilación y `dist` como carpeta de salida (ya configurados en `vercel.json`).
4. Tras cambiar `VITE_API_URL`, compila y despliega de nuevo: la variable se incorpora en tiempo de compilación.
5. Prueba un enlace desde el dominio publicado y comprueba que se guarda un archivo sin navegar fuera de la aplicación.

Este frontend se aloja como sitio estático; los archivos se transfieren desde Cobalt directamente al navegador. No necesita una función de Vercel que copie los videos ni un proxy abierto.

## Límites prácticos

Los videos privados, eliminados, con restricciones geográficas o que exijan autenticación pueden no estar disponibles. La instancia también puede aplicar límites de duración o solicitudes. Ningún cliente puede garantizar todas las URL de todas las redes.

La transferencia a un blob utiliza recursos del navegador. Para videos especialmente grandes se recomienda un equipo con memoria suficiente. La interfaz muestra el error si la transferencia falla; no redirige a una página externa como alternativa.

Descarga contenido propio o para el que tengas autorización.
