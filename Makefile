.PHONY: help install dev dev-web dev-api build lint typecheck test format \
        db-generate db-migrate db-studio \
        deploy-vps deploy-docker \
        docker-build docker-up docker-down docker-logs docker-ps \
        pm2-status pm2-logs pm2-restart

# Mặc định hiển thị danh sách các lệnh
help:
	@echo "========================================================================"
	@echo "                      BẢNG HƯỚNG DẪN CÁC LỆNH MAKE                       "
	@echo "========================================================================"
	@echo "--- MÔI TRƯỜNG PHÁT TRIỂN (DEVELOPMENT) ---"
	@echo "  make install         - Cài đặt dependencies (pnpm install)"
	@echo "  make dev             - Chạy cả Web + API ở môi trường dev"
	@echo "  make dev-web         - Chỉ chạy Next.js Web (http://localhost:3000)"
	@echo "  make dev-api         - Chỉ chạy NestJS API (http://localhost:3001)"
	@echo ""
	@echo "--- BUILD & KIỂM TRA CHẤT LƯỢNG (BUILD & TESTING) ---"
	@echo "  make build           - Build toàn bộ project (Web + API + Packages)"
	@echo "  make lint            - Kiểm tra cú pháp mã nguồn (ESLint)"
	@echo "  make typecheck       - Kiểm tra kiểu dữ liệu (TypeScript)"
	@echo "  make test            - Chạy unit tests (Vitest)"
	@echo "  make format          - Định dạng mã nguồn tự động (Prettier)"
	@echo ""
	@echo "--- QUẢN LÝ DATABASE (PRISMA) ---"
	@echo "  make db-generate     - Sinh Prisma Client"
	@echo "  make db-migrate      - Chạy Database Migration"
	@echo "  make db-studio       - Mở Prisma Studio trên giao diện web"
	@echo ""
	@echo "--- DEPLOYMENT (TRIỂN KHAI TRÊN VPS) ---"
	@echo "  make deploy-vps      - Deploy ứng dụng trực tiếp lên VPS (PM2 + Node.js)"
	@echo "  make deploy-docker   - Deploy ứng dụng bằng Docker & Docker Compose"
	@echo ""
	@echo "--- QUẢN LÝ DOCKER ---"
	@echo "  make docker-build    - Build Docker images cho các dịch vụ"
	@echo "  make docker-up       - Khởi chạy các container trong background"
	@echo "  make docker-down     - Dừng và xoá các container"
	@echo "  make docker-logs     - Xem log thời gian thực của Docker containers"
	@echo "  make docker-ps       - Xem trạng thái các container đang chạy"
	@echo ""
	@echo "--- QUẢN LÝ PM2 ---"
	@echo "  make pm2-status      - Xem trạng thái các tiến trình PM2"
	@echo "  make pm2-logs        - Xem log thời gian thực của PM2"
	@echo "  make pm2-restart     - Reload lại các ứng dụng PM2"
	@echo "========================================================================"

# Development Commands
install:
	pnpm install

dev:
	pnpm dev

dev-web:
	pnpm dev:web

dev-api:
	pnpm dev:api

# Build & Quality Commands
build:
	pnpm build

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

format:
	pnpm format

# Database Commands
db-generate:
	pnpm db:generate

db-migrate:
	pnpm db:migrate

db-studio:
	pnpm db:studio

# Deployment Commands
deploy-vps:
	chmod +x ./deploy-vps.sh
	./deploy-vps.sh

deploy-docker:
	chmod +x ./deploy-docker.sh
	./deploy-docker.sh

# Docker Commands
docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

docker-ps:
	docker compose ps

# PM2 Commands
pm2-status:
	pm2 status

pm2-logs:
	pm2 logs

pm2-restart:
	pm2 reload ecosystem.config.js || pm2 restart all
