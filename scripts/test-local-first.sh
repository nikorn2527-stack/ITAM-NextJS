#!/usr/bin/env bash
# test-local-first.sh — Pre-flight checks for local development.
#
# Runs all static checks that can be done without a running server.
# Use before pushing or when debugging local issues.
#
# Usage:
#   bash scripts/test-local-first.sh
#
# Exit codes:
#   0 = all checks passed
#   1 = one or more checks failed

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass=0
fail=0

check() {
  local name="$1"
  shift
  echo -n "  $name... "
  if "$@" > /tmp/test-local-$$ 2>&1; then
    echo -e "${GREEN}✓${NC}"
    ((pass++))
  else
    echo -e "${RED}✗${NC}"
    cat /tmp/test-local-$$ | head -5
    ((fail++))
  fi
  rm -f /tmp/test-local-$$
}

echo "═".repeat(50)
echo "  Local-First Pre-flight Checks"
echo "═".repeat(50)
echo ""

# ── 1. Shell syntax checks ──
echo "1. Shell script syntax"
check "dev.sh" bash -n dev.sh
check "setup.sh" bash -n setup.sh
check "scripts/safe-migrate.sh" bash -n scripts/safe-migrate.sh
echo ""

# ── 2. .env file exists ──
echo "2. Environment file"
if [ -f ".env" ]; then
  echo -e "  .env exists... ${GREEN}✓${NC}"
  ((pass++))
  # Check DATABASE_URL
  if grep -q "^DATABASE_URL=" .env; then
    echo -e "  DATABASE_URL set... ${GREEN}✓${NC}"
    ((pass++))
  else
    echo -e "  DATABASE_URL set... ${RED}✗${NC}"
    ((fail++))
  fi
  # Check JWT_SECRET
  if grep -q "^JWT_SECRET=" .env; then
    echo -e "  JWT_SECRET set... ${GREEN}✓${NC}"
    ((pass++))
  else
    echo -e "  JWT_SECRET set... ${RED}✗${NC}"
    ((fail++))
  fi
else
  echo -e "  .env exists... ${RED}✗ (run setup first)${NC}"
  ((fail++))
fi
echo ""

# ── 3. No hardcoded absolute paths in runtime scripts ──
echo "3. Portable paths (no /home/z/my-project)"
HARDCODED=$(grep -rl "/home/z/my-project" dev.sh setup.sh scripts/safe-migrate.sh scripts/install.ps1 scripts/backup-db.ts scripts/restore-db.ts 2>/dev/null || true)
if [ -z "$HARDCODED" ]; then
  echo -e "  No hardcoded paths... ${GREEN}✓${NC}"
  ((pass++))
else
  echo -e "  Hardcoded paths found in: $HARDCODED... ${RED}✗${NC}"
  ((fail++))
fi
echo ""

# ── 4. i18n check ──
echo "4. Translation coverage"
if command -v bun &>/dev/null; then
  check "i18n check" bun run scripts/check-i18n.ts
else
  echo -e "  (skipped — bun not found)${YELLOW}⚠${NC}"
fi
echo ""

# ── 5. Prisma schema validation ──
echo "5. Prisma schema"
if command -v bunx &>/dev/null || command -v npx &>/dev/null; then
  PKG="bunx"
  command -v bunx &>/dev/null || PKG="npx"
  check "prisma validate" $PKG prisma validate
else
  echo -e "  (skipped — no bunx/npx)${YELLOW}⚠${NC}"
fi
echo ""

# ── 6. Lockfile exists ──
echo "6. Lockfile"
if [ -f "bun.lock" ] || [ -f "bun.lockb" ] || [ -f "package-lock.json" ]; then
  echo -e "  Lockfile present... ${GREEN}✓${NC}"
  ((pass++))
else
  echo -e "  Lockfile missing... ${RED}✗${NC}"
  ((fail++))
fi
echo ""

# ── Summary ──
echo "═".repeat(50)
echo -e "  Results: ${GREEN}${pass} passed${NC}, ${RED}${fail} failed${NC}"
echo "═".repeat(50)

if [ $fail -gt 0 ]; then
  exit 1
fi
exit 0
