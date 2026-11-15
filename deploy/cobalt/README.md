# Servicio Cobalt de VicDownloader

Esta imagen conserva la API de Cobalt utilizada por el frontend y actualiza su
integración con YouTube. El caso `bDugoccFDAc` devolvía metadatos válidos pero un
túnel HTTP 200 de cero bytes con el cliente IOS de la imagen oficial 11.7.1.

## Cambios

- Base fijada al commit `a636575b09de1fc55d9b8cd98cac88f5f2f16b42` de Cobalt.
- `youtubei.js` 18.1.0 y cliente `VISIONOS`, con URL de medios sin cifrado.
- Actualización de URL cuando YouTube rechaza un fragmento, con reintentos limitados.
- Los medios rechazados/vacíos y FFmpeg sin salida responden con un error HTTP,
  en vez de HTTP 200 y cero bytes.
- Identificador de versión `11.7.1-vic.1` para comprobar qué código está publicado.

El parche adapta [la propuesta upstream #1581](https://github.com/imputnet/cobalt/pull/1581).
El código base y el parche son públicos. Cobalt conserva su licencia AGPL-3.0:
[fuentes y licencia de la versión base](https://github.com/imputnet/cobalt/tree/a636575b09de1fc55d9b8cd98cac88f5f2f16b42).
El Dockerfile y `cobalt-youtube.patch` permiten reconstruir esta versión modificada.

## Railway

Usar el servicio existente `cobalt-tools` del proyecto `devoted-renewal`, con este
repositorio como origen y `/deploy/cobalt` como directorio raíz. Se conserva el
dominio público y las variables existentes de puerto, URL, CORS y límites.
La imagen define `CUSTOM_INNERTUBE_CLIENT=VISIONOS`; no requiere cookies ni claves.

La compilación ejecuta `test-streams.mjs` contra un origen HTTP local controlado.
Comprueba medios rechazados, archivos vacíos, FFmpeg sin salida, transferencia de
bytes válidos y renovación de URL. La compilación debe fallar si alguna falla.

```bash
docker build -t vicdownloader-cobalt deploy/cobalt
docker run --rm -p 9000:9000 \
  -e API_URL=http://localhost:9000/ -e API_PORT=9000 \
  vicdownloader-cobalt
```

Vercel sigue compilando el frontend desde la raíz del repositorio. Su
`VITE_API_URL` permanece igual: los videos se procesan en Railway.

## Validación después del despliegue

Comprobar la versión en `GET /`, descargar `bDugoccFDAc` a 1080p desde la página
pública y verificar audio, video, duración y tamaño con FFprobe. Revisar también
el video de control `jNQXAC9IVRw` y las otras plataformas porque comparten túneles.
No basta con obtener una URL ni con una respuesta HTTP 200.

Para deshacer el despliegue, restaurar el despliegue anterior de `cobalt-tools`
en Railway. La imagen previa era `ghcr.io/imputnet/cobalt:latest` (11.7.1);
restaurarla también reintroduce el fallo de YouTube documentado aquí.
