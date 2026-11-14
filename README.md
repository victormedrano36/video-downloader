# ⬇ Video Downloader

Una aplicación web minimalista y moderna para descargar videos de **YouTube**, **TikTok**, **Instagram**, **Facebook** y **X (Twitter)** en formato MP4.

## 🚀 Características

- ✅ Soporte para múltiples plataformas: YouTube, TikTok, Instagram, Facebook, X
- ✅ Diseño minimalista y atractivo
- ✅ Totalmente responsive (funciona en celulares, tablets y computadoras)
- ✅ Descarga videos en formato MP4
- ✅ Interfaz intuitiva y fácil de usar

## 📦 Requisitos

- **Node.js** 18 o superior
- **npm** (viene incluido con Node.js)

## 🛠️ Instalación

1. **Navega al directorio del proyecto:**
   ```bash
   cd video-downloader
   ```

2. **Instala las dependencias:**
   ```bash
   npm install
   ```

3. **Inicia el servidor de desarrollo:**
   ```bash
   npm run dev
   ```

4. **Abre tu navegador** y ve a la URL que se muestra en la terminal (generalmente `http://localhost:5173`)

## 📱 Uso

1. **Copia el enlace** del video que quieres descargar de YouTube, TikTok, Instagram, Facebook o X
2. **Pega el enlace** en el campo de texto
3. **Haz clic en "Descargar"**
4. **Espera** a que se procese el video
5. **Haz clic en el enlace** de descarga que aparecerá
6. El video se descargará en formato **MP4**

## 🏗️ Construir para Producción

Para crear una versión optimizada para producción:

```bash
npm run build
```

Los archivos se generarán en el directorio `dist/`.

## 🌐 Desplegar

Puedes desplegar esta aplicación en cualquier servicio que soporte sitios estáticos:

- **Vercel**: `npx vercel`
- **Netlify**: Arrastra la carpeta `dist/` a Netlify Drop
- **GitHub Pages**: Usa el action de GitHub Pages para React

## 🔧 Tecnología

- **React** - Framework de UI
- **Vite** - Build tool
- **Cobalt API** - Servicio de descarga de videos

## 📝 Notas

- La aplicación usa la API pública de [Cobalt](https://cobalt.tools) para procesar las descargas
- Algunos videos pueden no estar disponibles para descarga dependiendo de la plataforma y los permisos del creador
- Respetar los derechos de autor al descargar contenido

## 📄 Licencia

Este proyecto es de uso personal y educativo.
