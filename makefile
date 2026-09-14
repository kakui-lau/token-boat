WEB_DIR = ./web
API_DIR = .
DEV_WEB_PORT ?= 5173
DEV_COMPOSE_FILE = docker-compose.dev.yml
DEV_POSTGRES_SERVICE = postgres
DEV_API_SERVICE = new-api
DEV_POSTGRES_DB = new-api
DEV_POSTGRES_USER = root
DEV_SQLITE_PATH ?= data/one-api.db

.PHONY: all build-web build-console build-all-web start-api dev dev-api dev-api-rebuild dev-web reset-setup test

all: build-all-web
	@$(MAKE) start-api

build-web:
	@echo "Building web frontend..."
	@cd $(WEB_DIR) && bun install --frozen-lockfile
	@cd $(WEB_DIR) && DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$${VERSION:-$$(cat ../VERSION)} bun run build

build-console: build-web
	@echo "Building public site, User Console, and the development-only Admin V2..."
	@cd frontend && bun install --frozen-lockfile
	@cd frontend && bun run build
	@mkdir -p "$(CURDIR)/web/dist/legacy"
	@cp "$(CURDIR)/web/dist/index.html" "$(CURDIR)/web/dist/legacy/index.html"
	@cp -R frontend/apps/site/dist/. "$(CURDIR)/web/dist/"
	@rm -rf "$(CURDIR)/web/dist/console"
	@mkdir -p "$(CURDIR)/web/dist/console"
	@cp -R frontend/apps/console/dist/. "$(CURDIR)/web/dist/console/"
	# Admin V2 remains build-tested but is not shipped until it replaces the legacy dashboard.
	@rm -rf "$(CURDIR)/web/dist/admin"
	@./scripts/check-web-assembly.sh "$(CURDIR)/web/dist"

# The legacy build supplies the setup/auth compatibility shell and empties
# web/dist, so the public-site overlay must run only after it finishes.
build-all-web: build-console

start-api:
	@echo "Starting api dev server..."
	@mkdir -p $(dir $(DEV_SQLITE_PATH))
	@cd $(API_DIR) && SQLITE_PATH="$(abspath $(DEV_SQLITE_PATH))?_busy_timeout=30000" go run main.go &

dev-api:
	@echo "Starting api services (docker)..."
	@docker compose -f $(DEV_COMPOSE_FILE) up -d

dev-api-rebuild:
	@echo "Rebuilding and starting api service (docker)..."
	@docker compose -f $(DEV_COMPOSE_FILE) up -d --build $(DEV_API_SERVICE)

dev-web:
	@echo "Starting web frontend dev server..."
	@echo "Web frontend: http://localhost:$(DEV_WEB_PORT)"
	@cd $(WEB_DIR) && bun install
	@cd $(WEB_DIR) && bun run dev -- --host 0.0.0.0 --port $(DEV_WEB_PORT)

dev: dev-api dev-web

# The main package embeds the ignored web/dist output and is covered after build-web.
test:
	@echo "Testing root Go module..."
	@root_module=$$(GOWORK=off go list -m); \
		root_packages=$$(GOWORK=off go list -e ./... | grep -vxF "$$root_module"); \
		GOWORK=off go test $$root_packages
	@echo "Testing relaykit Go module..."
	@cd relaykit && GOWORK=off go test ./...

reset-setup:
	@echo "Resetting local setup wizard state..."
	@if docker compose -f $(DEV_COMPOSE_FILE) ps --services --status running | grep -qx "$(DEV_POSTGRES_SERVICE)"; then \
		echo "Detected running docker dev PostgreSQL. Removing setup record and root users..."; \
		docker compose -f $(DEV_COMPOSE_FILE) exec -T $(DEV_POSTGRES_SERVICE) \
			psql -U $(DEV_POSTGRES_USER) -d $(DEV_POSTGRES_DB) \
			-c 'DELETE FROM setups;' \
			-c 'DELETE FROM users WHERE role = 100;' \
			-c "DELETE FROM options WHERE key IN ('SelfUseModeEnabled', 'DemoSiteEnabled');"; \
		echo "Restarting docker dev api so setup status is recalculated..."; \
		docker compose -f $(DEV_COMPOSE_FILE) restart $(DEV_API_SERVICE); \
	elif db_path="$${SQLITE_PATH:-$(DEV_SQLITE_PATH)}"; db_path="$${db_path%%\?*}"; [ -f "$$db_path" ]; then \
		db_path="$${SQLITE_PATH:-$(DEV_SQLITE_PATH)}"; \
		db_path="$${db_path%%\?*}"; \
		echo "Detected local SQLite database: $$db_path"; \
		sqlite3 "$$db_path" \
			"DELETE FROM setups; DELETE FROM users WHERE role = 100; DELETE FROM options WHERE key IN ('SelfUseModeEnabled', 'DemoSiteEnabled');"; \
		echo "SQLite setup state reset. Restart the local api process before testing the setup wizard."; \
	else \
		echo "No running docker dev PostgreSQL or local SQLite database found."; \
		echo "Start the dev stack with 'make dev-api', or set SQLITE_PATH/DEV_SQLITE_PATH to your local SQLite database."; \
		exit 1; \
	fi
