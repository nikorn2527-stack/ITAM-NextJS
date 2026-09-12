#!/usr/bin/env bash
# ============================================================
# ITAM-NextJS — Linux/Mac Setup Script
# ============================================================
# Run this ONCE after cloning the repo on Linux or macOS.
#
# Usage (from the project root):
#   bash setup.sh
#
# What it does:
#   1. Checks that bun is installed
#   2. Installs npm dependencies (if node_modules is missing)
#   3. Copies .env.example → .env if missing
#   4. Generates a random JWT_SECRET (if still the placeholder)
#   5. Auto-syncs prisma/schema.prisma provider with DATABASE_URL
#   6. Runs prisma db push + prisma generate
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${CYAN}=== $1 ===${NC}"; }
ok()   { echo -e "  ${GREEN}✓ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${NC}"; }
err()  { echo -e "  ${RED}✗ $1${NC}"; }

# ── 1. Pre-flight: bun ───────────────────────────────────────────────────
step "Checking prerequisites"
if ! command -v bun >/dev/null 2>&1; then
  err "bun not found. Install from https://bun.sh"
  exit 1
fi
ok "bun $(bun --version)"

# ── 2. Install npm dependencies (idempotent) ──────────────────────────────
if [ ! -d "node_modules" ]; then
  step "Installing dependencies (first run — this takes a few minutes)"
  bun install
  ok "Dependencies installed"
else
  ok "node_modules exists — skipping bun install"
fi

# ── 3. Copy .env.example → .env if missing ───────────────────────────────
step "Setting up .env"
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp ".env.example" ".env"
    ok "Copied .env.example → .env"
  else
    err ".env.example not found. Create .env manually with DATABASE_URL and JWT_SECRET."
    exit 1
  fi
else
  ok ".env already exists"
fi

# ── 4. Generate JWT_SECRET if still placeholder ───────────────────────────
if grep -q "^JWT_SECRET=CHANGE_ME_TO_RANDOM_32_CHAR_STRING$" .env; then
  SECRET=$(openssl rand -hex 32)
  # Use a temp file to avoid sed -i portability issues (macOS vs GNU)
  sed "s|^JWT_SECRET=CHANGE_ME_TO_RANDOM_32_CHAR_STRING|JWT_SECRET=$SECRET|" .env > .env.tmp
  mv .env.tmp .env
  ok "Generated a random JWT_SECRET (64 hex chars)"
else
  ok "JWT_SECRET already set"
fi

# ── 5. Export .env vars into this shell (so prisma can see DATABASE_URL) ──
step "Loading .env"
set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  err "DATABASE_URL is not set in .env"
  exit 1
fi
case "$DATABASE_URL" in
  postgres*)   ok "DATABASE_URL = postgresql:... (PostgreSQL baseline ✓)" ;;
  file:*)      err "DATABASE_URL is SQLite (file:) — Phase 1 baseline requires PostgreSQL."
               echo "   Set DATABASE_URL to a PostgreSQL connection string in .env"
               echo "   See .env.example for the format."
               exit 1 ;;
  *)           warn "DATABASE_URL doesn't look like PostgreSQL (postgresql://...)"
               echo "   Got: $DATABASE_URL"
               echo "   Phase 1 baseline requires PostgreSQL." ;;
esac

# ── 6. Verify prisma provider is PostgreSQL ──────────────────────────────
step "Verifying prisma provider (PostgreSQL baseline)"
node scripts/set-prisma-provider.mjs

# ── 7. (Removed) SQLite db folder — Phase 1 is PostgreSQL-only ───────────

# ── 8. prisma migrate deploy (Phase 1: PostgreSQL migrations) ─────────────
step "Running prisma migrate deploy"
bunx prisma migrate deploy
ok "Database schema synced (migrate deploy)"

# ── 9. prisma generate ───────────────────────────────────────────────────
step "Generating Prisma Client"
bunx prisma generate
ok "Prisma Client generated"

# ── Done ─────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  ✓ Setup complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n${CYAN}Next steps:${NC}"
echo "  bun run dev      # start dev server on http://localhost:3000"
echo "  bun run db:seed  # (optional) seed demo data"
echo ""
echo -e "${YELLOW}Default login (after seeding): admin / test1234${NC}"
