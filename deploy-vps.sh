#!/usr/bin/env bash

# ==============================================================================
# Deploy Script: Direct VPS (PM2 + Node.js + pnpm)
# Description: Tự động pull code mới, install dependencies, migrate DB,
#              build project, và reload PM2 (zero-downtime).
# ==============================================================================

set -e

# Colors for output
RED='\030[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_info "🚀 Bắt đầu quá trình deploy dự án lên VPS (PM2)..."

# 1. KIỂM TRA MÔI TRƯỜNG & YÊU CẦU
log_info "1/7. Kiểm tra các công cụ bắt buộc..."
command -v node >/dev/null 2>&1 || { log_error "Node.js chưa được cài đặt!"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { log_error "pnpm chưa được cài đặt!"; exit 1; }
command -v pm2 >/dev/null 2>&1 || { log_error "PM2 chưa được cài đặt! Run: npm i -g pm2"; exit 1; }

# 2. PULL CODE MỚI NHẤT TỪ GIT
log_info "2/7. Kéo code mới nhất từ Git repository..."
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
log_info "Đang ở branch: ${BRANCH}"
git pull origin "${BRANCH}"

# 3. CÀI ĐẶT DEPENDENCIES
log_info "3/7. Cài đặt các gói phụ thuộc (pnpm install)..."
pnpm install --frozen-lockfile

# 4. CHẠY PRISMA DB MIGRATE & GENERATE
log_info "4/7. Cập nhật Database Schema (Prisma migrate & generate)..."
if [ -d "packages/db" ]; then
    pnpm db:generate
    pnpm db:migrate
fi

# 5. BUILD DỰ ÁN
log_info "5/7. Tiến hành build dự án (pnpm build)..."
pnpm build

# 6. KHỞI ĐỘNG HOẶC RELOAD PM2 (ZERO-DOWNTIME)
log_info "6/7. Reload ứng dụng qua PM2..."

# Check và reload API
if [ -d "apps/api" ]; then
    log_info "Reloading apps/api..."
    cd apps/api
    if pm2 describe base-template-api > /dev/null 2>&1 || pm2 describe api > /dev/null 2>&1; then
        pm2 reload ecosystem.config.js --env production
    else
        pm2 start ecosystem.config.js --env production
    fi
    cd ../..
fi

# Check và reload Web (nếu có)
if [ -d "apps/web" ]; then
    log_info "Reloading apps/web..."
    cd apps/web
    if pm2 describe base-template-web > /dev/null 2>&1 || pm2 describe web > /dev/null 2>&1; then
        pm2 reload ecosystem.config.js --env production
    else
        pm2 start ecosystem.config.js --env production
    fi
    cd ../..
fi

pm2 save

# 7. RELOAD REVERSE PROXY (CADDY NẾU CÓ)
log_info "7/7. Kiểm tra và reload Caddy Reverse Proxy..."
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet caddy; then
    sudo systemctl reload caddy
    log_success "Đã reload Caddy thành công."
elif command -v caddy >/dev/null 2>&1; then
    caddy reload --config Caddyfile 2>/dev/null || log_warning "Caddy chưa được reload hoặc Caddyfile không hợp lệ."
else
    log_warning "Caddy không chạy hoặc chưa được cài đặt (bỏ qua bước reload Caddy)."
fi

log_success "🎉 DEPLOY LÊN VPS NATIVE THÀNH CÔNG!"
echo ""
pm2 status
