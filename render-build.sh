#!/usr/bin/env bash
# Instalar Node.js en Render (necesario para yt-dlp con YouTube)
set -e

echo "=== Instalando Node.js para yt-dlp ==="

# Detectar arquitectura
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    NODE_ARCH="x64"
elif [ "$ARCH" = "aarch64" ]; then
    NODE_ARCH="arm64"
else
    NODE_ARCH="x64"
fi

# Instalar Node.js 20 LTS
NODE_VERSION="v20.11.0"
NODE_DIR="/opt/node"

if [ ! -d "$NODE_DIR" ]; then
    echo "Descargando Node.js $NODE_VERSION..."
    mkdir -p $NODE_DIR
    curl -sL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-$NODE_ARCH.tar.xz" | tar -xJ -C $NODE_DIR --strip-components=1
    ln -sf $NODE_DIR/bin/node /usr/local/bin/node
    ln -sf $NODE_DIR/bin/npx /usr/local/bin/npx
    echo "Node.js instalado en $NODE_DIR"
else
    ln -sf $NODE_DIR/bin/node /usr/local/bin/node
    ln -sf $NODE_DIR/bin/npx /usr/local/bin/npx
    echo "Node.js ya instalado en $NODE_DIR"
fi

node --version
echo "=== Instalación completada ==="
