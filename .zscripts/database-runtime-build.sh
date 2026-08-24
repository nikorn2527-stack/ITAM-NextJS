#!/usr/bin/env bash

set -euo pipefail

BUILD_DIR="${BUILD_DIR:?BUILD_DIR is required}"

# Vercel และ runtime แบบ serverless ไม่ควรพึ่งพา filesystem เพื่อเก็บฐานข้อมูล
# ฐานข้อมูล production ต้องมาจาก DATABASE_URL ของ PostgreSQL/Supabase เท่านั้น
case "${DATABASE_URL:-}" in
    file:*)
        echo "❌ SQLite DATABASE_URL is not supported for deployment. Configure PostgreSQL/Supabase instead." >&2
        exit 1
        ;;
esac

mkdir -p "$BUILD_DIR"

echo "🗄️  ใช้ฐานข้อมูลภายนอกจาก DATABASE_URL ตอน runtime; ไม่คัดลอกหรือสร้างไฟล์ฐานข้อมูลใน build artifact"
