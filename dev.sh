#!/bin/bash
# dev.sh — loads .env then starts dev server
cd /home/z/my-project
set -a
source .env
set +a
exec bun run next dev -p 3000
