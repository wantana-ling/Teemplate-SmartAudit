#!/usr/bin/env bash
# ============================================================================
# SmartAIAudit — One-command deploy to Fly.io
# ============================================================================
# Prerequisites:
#   - flyctl installed and authenticated (`fly auth login`)
#   - A .env file at the repo root with Supabase + security keys
#
# Usage:
#   ./scripts/deploy-demo.sh
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_APP="smartaudit-backend"
TARGETS_APP="smartaudit-demo-targets"
REGION="sin"

# ── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}▶${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

# ── Pre-flight checks ─────────────────────────────────────────────────────
if ! command -v fly &>/dev/null; then
  err "flyctl not found. Install: https://fly.io/docs/flyctl/install/"
  exit 1
fi

if [ ! -f "$REPO_ROOT/.env" ]; then
  err ".env file not found at repo root. Copy .env.example and fill in values."
  exit 1
fi

# Source secrets from .env
set -a
source "$REPO_ROOT/.env"
set +a

for var in SUPABASE_PROJECT_URL SUPABASE_PUBLISHABLE_API_KEY SUPABASE_SECRET_KEY \
           JWT_SECRET ENCRYPTION_KEY OPENROUTER_API_KEY; do
  if [ -z "${!var:-}" ]; then
    err "Missing required env var: $var (check .env)"
    exit 1
  fi
done

# ── Step 1: Create Fly apps (idempotent) ──────────────────────────────────
log "Creating Fly apps (if they don't exist)..."

fly apps create "$BACKEND_APP" --org personal 2>/dev/null \
  && ok "Created $BACKEND_APP" \
  || warn "$BACKEND_APP already exists"

fly apps create "$TARGETS_APP" --org personal 2>/dev/null \
  && ok "Created $TARGETS_APP" \
  || warn "$TARGETS_APP already exists"

# ── Step 2: Create volume for recordings ──────────────────────────────────
log "Creating recordings volume (if it doesn't exist)..."
fly volumes list --app "$BACKEND_APP" --json 2>/dev/null | grep -q '"name":"recordings"' \
  && warn "Volume 'recordings' already exists" \
  || { fly volumes create recordings \
         --app "$BACKEND_APP" \
         --region "$REGION" \
         --size 1 \
         --yes \
       && ok "Created 1GB recordings volume"; }

# ── Step 3: Set backend secrets ───────────────────────────────────────────
log "Setting backend secrets..."
fly secrets set \
  --app "$BACKEND_APP" \
  SUPABASE_PROJECT_URL="$SUPABASE_PROJECT_URL" \
  SUPABASE_PUBLISHABLE_API_KEY="$SUPABASE_PUBLISHABLE_API_KEY" \
  SUPABASE_SECRET_KEY="$SUPABASE_SECRET_KEY" \
  JWT_SECRET="$JWT_SECRET" \
  ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  OPENROUTER_API_KEY="$OPENROUTER_API_KEY" \
  CORS_ORIGIN="https://${BACKEND_APP}.fly.dev" \
  --stage
ok "Secrets staged"

# ── Step 4: Deploy demo targets first (backend needs it reachable) ────────
log "Deploying $TARGETS_APP..."
fly deploy \
  --app "$TARGETS_APP" \
  --config "$REPO_ROOT/fly/demo-targets/fly.toml" \
  --dockerfile "$REPO_ROOT/docker/deploy/Dockerfile.demo-targets" \
  --yes
ok "Demo targets deployed"

# ── Step 5: Deploy backend ────────────────────────────────────────────────
log "Deploying $BACKEND_APP..."
fly deploy \
  --app "$BACKEND_APP" \
  --config "$REPO_ROOT/fly/backend/fly.toml" \
  --dockerfile "$REPO_ROOT/docker/deploy/Dockerfile.demo-backend" \
  --yes
ok "Backend deployed"

# ── Step 6: Wait for backend to become healthy ────────────────────────────
log "Waiting for backend health check..."
BACKEND_URL="https://${BACKEND_APP}.fly.dev"
for i in $(seq 1 30); do
  if curl -sf "$BACKEND_URL/health" >/dev/null 2>&1; then
    ok "Backend is healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    err "Backend failed to become healthy after 30 attempts"
    exit 1
  fi
  sleep 2
done

# ── Step 7: Seed demo data ───────────────────────────────────────────────
log "Seeding demo data..."
node "$REPO_ROOT/scripts/seed-demo.mjs" "$BACKEND_URL"
ok "Demo data seeded"

# ── Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  SmartAIAudit Demo Deployment Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Backend URL:   ${CYAN}${BACKEND_URL}${NC}"
echo -e "  Health check:  ${CYAN}${BACKEND_URL}/health${NC}"
echo ""
echo -e "  ${YELLOW}Auditor login:${NC}"
echo -e "    Email:     admin@smartaudit.demo"
echo -e "    Password:  DemoAdmin123!"
echo ""
echo -e "  ${YELLOW}Client login:${NC}"
echo -e "    Email:     demo@smartaudit.demo"
echo -e "    Password:  DemoUser123!"
echo ""
echo -e "  ${YELLOW}Target machine credentials:${NC}"
echo -e "    Username:  testuser"
echo -e "    Password:  testpass"
echo ""
echo -e "  Next steps:"
echo -e "    1. Build Electron apps:  ${CYAN}./scripts/build-demo-apps.sh${NC}"
echo -e "    2. Distribute .dmg/.exe installers to testers"
echo ""
