#!/bin/sh
cd "$(dirname "$0")"
echo "================================================"
echo "  ZENITH API - arrancando..."
echo "================================================"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  FALTA NODE.JS: instalalo desde https://nodejs.org"
  echo ""
  exit 1
fi
node api.mjs
