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

# Instalar Node.js en el directorio del proyecto (Render permite escribir aquí)
NODE_VERSION="v20.11.0"
NODE_DIR="$HOME/node"

if [ ! -d "$NODE_DIR" ]; then
    echo "Descargando Node.js $NODE_VERSION..."
    mkdir -p $NODE_DIR
    curl -sL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-$NODE_ARCH.tar.xz" | tar -xJ -C $NODE_DIR --strip-components=1
    echo "Node.js instalado en $NODE_DIR"
else
    echo "Node.js ya instalado en $NODE_DIR"
fi

# Agregar Node.js al PATH
export PATH="$NODE_DIR/bin:$PATH"
echo "export PATH=$NODE_DIR/bin:$PATH" >> "$HOME/.bashrc"

node --version
echo "=== Instalación completada ==="
