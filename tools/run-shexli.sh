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

# Check for --strict flag
STRICT=0
ARGS=""
for arg in "$@"; do
    if [ "$arg" = "--strict" ]; then
        STRICT=1
    else
        ARGS="$ARGS \"$arg\""
    fi
done

# Helper function to run shexli with strict JSON checking
run_shexli() {
    target="$1"
    echo "Running shexli on $target..."

    # 1. Human-readable output for the logs
    shexli "$target" || exit_code=$?
    exit_code=${exit_code:-0}

    if [ "$exit_code" -ne 0 ]; then
        exit "$exit_code"
    fi

    # 2. In strict mode, check JSON output via check_shexli.py
    if [ "$STRICT" -eq 1 ]; then
        shexli --format json "$target" | python3 "$srcdir/check_shexli.py"
    fi
}

# 1. Target explicitly specified
if [ -n "$ARGS" ]; then
    eval "run_shexli $ARGS"
    exit 0
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
    run_shexli "$ZIP_FILE"
else
    run_shexli "$(realpath "$rootdir")"
fi
