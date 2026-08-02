#!/usr/bin/env bash

# ==============================================================================
# Deploy Script: Docker & Docker Compose VPS
# Description: Tự động pull code mới, build Docker images, chạy DB migration,
#              khởi chạy containers và dọn dẹp docker images rác.
# ==============================================================================

set -e

# Colors for output
RED='\033[0;31m'
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

log_info "🐳 Bắt đầu quá trình deploy bằng Docker & Docker Compose..."

# 1. KIỂM TRA MÔI TRƯỜNG DOCKER
log_info "1/7. Kiểm tra Docker & Docker Compose..."
command -v docker >/dev/null 2>&1 || { log_error "Docker chưa được cài đặt!"; exit 1; }

DOCKER_COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    log_error "Docker Compose chưa được cài đặt!"
    exit 1
fi
log_info "Sử dụng lệnh Compose: ${DOCKER_COMPOSE_CMD}"

# 2. PULL CODE MỚI NHẤT
log_info "2/7. Kéo code mới nhất từ Git..."
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
log_info "Đang ở branch: ${BRANCH}"
git pull origin "${BRANCH}"

# 3. KIỂM TRA FILE CẤU HÌNH ENV
log_info "3/7. Kiểm tra các file môi trường (.env)..."
if [ ! -f ".env" ] && [ ! -f "apps/api/.env" ]; then
    log_warning "Không tìm thấy file .env ở root hoặc apps/api. Đang dùng cấu hình mặc định trong docker-compose.yml."
fi

# 4. BUILD DOCKER IMAGES
log_info "4/7. Tiến hành build Docker images..."
$DOCKER_COMPOSE_CMD build

# 5. CHẠY DATABASE CONTAINER & MIGRATE DB
log_info "5/7. Khởi động DB và chạy Prisma Migration..."
$DOCKER_COMPOSE_CMD up -d postgres

log_info "Đợi Postgres sẵn sàng..."
sleep 3

log_info "Chạy DB Migration..."
$DOCKER_COMPOSE_CMD run --rm api pnpm db:migrate || log_warning "Migration gặp sự cố hoặc đã up-to-date."

# 6. KHỞI CHẠY TOÀN BỘ SERVICES
log_info "6/7. Khởi chạy toàn bộ ứng dụng trong background (detached mode)..."
$DOCKER_COMPOSE_CMD up -d

# 7. DỌN DẸP IMAGES RÁC (DANGLING IMAGES)
log_info "7/7. Dọn dẹp Docker images rác cũ để tiết kiệm dung lượng đĩa..."
docker image prune -f

log_success "🎉 DEPLOY DOCKER THÀNH CÔNG!"
echo ""
$DOCKER_COMPOSE_CMD ps
