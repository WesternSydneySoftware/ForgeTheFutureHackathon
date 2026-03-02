#!/usr/bin/env bash
set -euo pipefail

MODE="dev"
PORT="8001"
SKIP_INSTALL="0"
OPEN_BROWSER="0"

usage() {
  cat <<'USAGE'
Usage: ./run.sh [--mode dev|start] [--port 8001] [--skip-install] [--open]

Examples:
  ./run.sh
  ./run.sh --mode start --port 3000
  ./run.sh --skip-install
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode|-m)
      MODE="${2:-}"
      shift 2
      ;;
    --port|-p)
      PORT="${2:-}"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL="1"
      shift
      ;;
    --open)
      OPEN_BROWSER="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    dev|start)
      MODE="$1"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$MODE" != "dev" && "$MODE" != "start" ]]; then
  echo "Invalid --mode '$MODE' (expected dev|start)." >&2
  exit 2
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "Invalid --port '$PORT' (expected an integer)." >&2
  exit 2
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command '$1'. Install Node.js (includes npm) and try again." >&2
    exit 1
  fi
}

require_cmd node
require_cmd npm

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

if [[ ! -f ".env" && -f ".env.example" ]]; then
  cp ".env.example" ".env"
  echo "Created .env from .env.example. Add your Elastic settings to .env before using the app." >&2
fi

deps_hash() {
  node - <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");

const files = ["package.json", "package-lock.json", "npm-shrinkwrap.json"];
const hash = crypto.createHash("sha256");

for (const file of files) {
  if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
  hash.update("\0" + file + "\0");
}

process.stdout.write(hash.digest("hex"));
NODE
}

STAMP_FILE="node_modules/.omj-deps.sha256"

ensure_deps() {
  if [[ "$SKIP_INSTALL" == "1" ]]; then
    return 0
  fi

  local needs_install="0"
  if [[ ! -d "node_modules" ]]; then
    needs_install="1"
  elif [[ ! -f "$STAMP_FILE" ]]; then
    needs_install="1"
  else
    local current expected
    current="$(deps_hash)"
    expected="$(cat "$STAMP_FILE" 2>/dev/null || true)"
    if [[ "$current" != "$expected" ]]; then
      needs_install="1"
    fi
  fi

  if [[ "$needs_install" == "1" ]]; then
    echo "Installing dependencies..." >&2
    if [[ -f "package-lock.json" ]]; then
      npm ci || npm install
    else
      npm install
    fi
    mkdir -p "node_modules"
    deps_hash > "$STAMP_FILE"
  fi
}

open_url() {
  local url="$1"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 || true
  fi
}

ensure_deps

export PORT="$PORT"

if [[ "$OPEN_BROWSER" == "1" ]]; then
  open_url "http://localhost:${PORT}/"
fi

echo "Starting One More Job (${MODE}) on http://localhost:${PORT}/ ..." >&2

if [[ "$MODE" == "dev" ]]; then
  npm run dev
else
  npm start
fi

