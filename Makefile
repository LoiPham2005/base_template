.PHONY: help setup install dev dev-web dev-api dev-worker build lint typecheck test check format \
        db-generate db-migrate db-deploy db-seed db-reset db-studio \
        infra-up infra-down \
        deploy-vps deploy-docker \
        docker-build docker-up docker-down docker-logs docker-ps \
        pm2-status pm2-logs pm2-restart

# Mặc định hiển thị danh sách các lệnh
help:
	@echo "========================================================================"
	@echo "                      BẢNG HƯỚNG DẪN CÁC LỆNH MAKE                       "
	@echo "========================================================================"
	@echo "--- BẮT ĐẦU ---"
	@echo "  make setup           - Cài lần đầu: .env + deps + hạ tầng + migrate + seed"
	@echo ""
	@echo "--- MÔI TRƯỜNG PHÁT TRIỂN (DEVELOPMENT) ---"
	@echo "  make install         - Cài đặt dependencies (pnpm install)"
	@echo "  make infra-up        - Bật Postgres + Redis + Mailpit bằng Docker"
	@echo "  make infra-down      - Tắt hạ tầng dev"
	@echo "  make dev             - Chạy Web + API + Worker ở môi trường dev"
	@echo "  make dev-web         - Chỉ Next.js Web    (http://localhost:3000)"
	@echo "  make dev-api         - Chỉ NestJS API     (http://localhost:3001/docs)"
	@echo "  make dev-worker      - Chỉ worker job nền (http://localhost:3002/health)"
	@echo ""
	@echo "--- BUILD & KIỂM TRA CHẤT LƯỢNG (BUILD & TESTING) ---"
	@echo "  make build           - Build toàn bộ project (Web + API + Packages)"
	@echo "  make lint            - Kiểm tra cú pháp mã nguồn (ESLint)"
	@echo "  make typecheck       - Kiểm tra kiểu dữ liệu (TypeScript)"
	@echo "  make test            - Chạy unit tests (Vitest)"
	@echo "  make check           - Chạy TẤT CẢ: format + lint + typecheck + test"
	@echo "  make format          - Định dạng mã nguồn tự động (Prettier)"
	@echo ""
	@echo "--- QUẢN LÝ DATABASE (PRISMA) ---"
	@echo "  make db-generate     - Sinh Prisma Client"
	@echo "  make db-migrate      - Tạo + áp migration mới (DEV)"
	@echo "  make db-deploy       - Áp migration đã commit (PRODUCTION)"
	@echo "  make db-seed         - Đồng bộ quyền/vai trò + tạo admin + dữ liệu mẫu"
	@echo "  make db-reset        - XOÁ SẠCH database rồi dựng lại (chỉ dev)"
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

# Setup lần đầu — chạy đúng thứ tự bắt buộc: .env phải có TRƯỚC khi migrate,
# và database phải sống TRƯỚC khi seed.
setup:
	@test -f .env || (cp .env.example .env && echo "✓ Đã tạo .env từ .env.example — MỞ RA SỬA JWT_SECRET trước khi chạy tiếp")
	pnpm install
	pnpm build
	$(MAKE) infra-up
	@echo "Đợi Postgres sẵn sàng…" && sleep 5
	pnpm db:migrate
	pnpm db:seed
	@echo ""
	@echo "Xong. Chạy: make dev"

# Development Commands
install:
	pnpm install

# Chỉ hạ tầng, không build gì cả — đủ để `pnpm dev` chạy được.
# Mailpit bắt mọi email và hiện ở http://localhost:8025
infra-up:
	docker compose --profile dev up -d postgres redis mailpit

infra-down:
	docker compose stop postgres redis mailpit

dev:
	pnpm dev

dev-web:
	pnpm dev:web

dev-api:
	pnpm dev:api

dev-worker:
	pnpm dev:worker

# Build & Quality Commands
build:
	pnpm build

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

check:
	pnpm check

format:
	pnpm format

# Database Commands
db-generate:
	pnpm db:generate

db-migrate:
	pnpm db:migrate

db-deploy:
	pnpm db:deploy

db-seed:
	pnpm db:seed

db-reset:
	pnpm db:reset

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
