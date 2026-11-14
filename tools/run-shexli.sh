#!/bin/sh
set -e

srcdir=$(dirname -- "$0")
rootdir="$srcdir/.."
venv="$srcdir/.venv"

# Create virtual environment if it doesn't exist
if [ ! -d "$venv" ]; then
    echo "Creating virtual environment in $venv..."
    python3 -m venv "$venv" 2>/dev/null || virtualenv "$venv"
fi

# Activate virtual environment
. "$venv/bin/activate"

# Install shexli if not present
if ! command -v shexli >/dev/null 2>&1; then
    echo "Installing shexli..."
    pip install -U -r "$srcdir/requirements.txt"
fi

# 1. Target explicitly specified
if [ $# -gt 0 ]; then
    exec shexli "$@"
fi

# 2. No target specified: pack with gnome-extensions if available, or find existing zip
if command -v gnome-extensions >/dev/null 2>&1; then
    echo "Packaging extension with gnome-extensions..."
    gnome-extensions pack --force \
        --extra-source=lib/ \
        --extra-source=queries.json \
        --schema=schemas/org.gnome.shell.extensions.observability.gschema.xml \
        --out-dir="$rootdir" \
        "$rootdir"
fi

ZIP_FILE=$(ls "$rootdir"/*.shell-extension.zip "$rootdir"/*.zip 2>/dev/null | head -n 1)

if [ -n "$ZIP_FILE" ]; then
    echo "Running shexli on $ZIP_FILE..."
    exec shexli "$ZIP_FILE"
else
    echo "No zip archive found. Running shexli on $(realpath "$rootdir")..."
    exec shexli "$(realpath "$rootdir")"
fi
