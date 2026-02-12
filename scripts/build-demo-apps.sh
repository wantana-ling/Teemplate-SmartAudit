#!/usr/bin/env bash
# ============================================================================
# SmartAIAudit — Build Electron installers pointed at fly.io demo backend
# ============================================================================
# Copies .env.demo → .env for each app, builds shared lib, then packages
# the Electron apps for macOS and Windows.
#
# Usage:
#   ./scripts/build-demo-apps.sh            # Build for current platform
#   ./scripts/build-demo-apps.sh --mac      # macOS only
#   ./scripts/build-demo-apps.sh --win      # Windows only
#   ./scripts/build-demo-apps.sh --all      # Both (requires cross-compile tooling)
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM="${1:---mac}"  # default to mac on macOS

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}▶${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }

# ── Swap .env files ───────────────────────────────────────────────────────
log "Setting up demo environment files..."

for app in client-desktop auditor-desktop; do
  DEMO_ENV="$REPO_ROOT/apps/$app/.env.demo"
  TARGET_ENV="$REPO_ROOT/apps/$app/.env"

  if [ ! -f "$DEMO_ENV" ]; then
    echo -e "${RED}✗${NC} Missing $DEMO_ENV"
    exit 1
  fi

  # Back up existing .env if it differs
  if [ -f "$TARGET_ENV" ]; then
    if ! diff -q "$DEMO_ENV" "$TARGET_ENV" >/dev/null 2>&1; then
      cp "$TARGET_ENV" "$TARGET_ENV.local-backup"
      echo "  Backed up existing .env → .env.local-backup ($app)"
    fi
  fi

  cp "$DEMO_ENV" "$TARGET_ENV"
  ok "Set .env for $app"
done

# ── Build shared package ──────────────────────────────────────────────────
log "Building shared package..."
pnpm --filter @smartaiaudit/shared build
ok "Shared package built"

# ── Build + package apps ──────────────────────────────────────────────────
build_app() {
  local app="$1"
  local filter="@smartaiaudit/$app"

  log "Building $app (renderer + electron)..."
  pnpm --filter "$filter" build
  ok "$app built"

  case "$PLATFORM" in
    --mac)
      log "Packaging $app for macOS..."
      pnpm --filter "$filter" package:mac
      ok "$app macOS package created"
      ;;
    --win)
      log "Packaging $app for Windows..."
      pnpm --filter "$filter" package:win
      ok "$app Windows package created"
      ;;
    --all)
      log "Packaging $app for macOS..."
      pnpm --filter "$filter" package:mac
      log "Packaging $app for Windows..."
      pnpm --filter "$filter" package:win
      ok "$app packages created (macOS + Windows)"
      ;;
  esac
}

build_app "client-desktop"
build_app "auditor-desktop"

# ── Restore original .env files ──────────────────────────────────────────
log "Restoring original .env files..."
for app in client-desktop auditor-desktop; do
  BACKUP="$REPO_ROOT/apps/$app/.env.local-backup"
  TARGET="$REPO_ROOT/apps/$app/.env"
  if [ -f "$BACKUP" ]; then
    mv "$BACKUP" "$TARGET"
    ok "Restored .env for $app"
  fi
done

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Demo Electron App Builds Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Installers:"

for app in client-desktop auditor-desktop; do
  DIST="$REPO_ROOT/apps/$app/dist"
  if [ -d "$DIST" ]; then
    echo "    $app:"
    # List installer files (dmg, exe, AppImage)
    find "$DIST" -maxdepth 1 \( -name "*.dmg" -o -name "*.exe" -o -name "*.AppImage" -o -name "*.zip" \) 2>/dev/null | while read -r f; do
      echo "      $(basename "$f")"
    done
  fi
done

echo ""
echo "  These apps are configured to connect to:"
echo "    Backend:  https://smartaudit-backend.fly.dev"
echo ""
