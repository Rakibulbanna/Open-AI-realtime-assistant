.PHONY: help migrate migrate-create migrate-apply migrate-reset migrate-status db-seed db-reset db-apply-sql db-generate clean clean-logs clean-dist clean-coverage clean-all build dev docker-up docker-down docker-clean install

# Colors for output
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

# Default target
.DEFAULT_GOAL := help

# Variables
PRISMA_SCHEMA := prisma/schema.prisma
SQL_SCRIPT := scripts/init-pgvector.sql
LOGS_DIR := logs
DIST_DIR := dist
COVERAGE_DIR := coverage

##@ Help

help: ## Display this help message
	@echo "$(CYAN)Available commands:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

##@ Prisma Migrations

migrate: migrate-status ## Show migration status (default)

migrate-create: ## Create a new migration (usage: make migrate-create NAME=migration_name)
	@if [ -z "$(NAME)" ]; then \
		echo "$(RED)Error: NAME is required. Usage: make migrate-create NAME=migration_name$(NC)"; \
		exit 1; \
	fi
	@echo "$(CYAN)Creating migration: $(NAME)$(NC)"
	@yarn prisma migrate dev --name $(NAME) --schema $(PRISMA_SCHEMA)

migrate-apply: ## Apply pending migrations
	@echo "$(CYAN)Applying pending migrations...$(NC)"
	@yarn prisma migrate deploy --schema $(PRISMA_SCHEMA)
	@echo "$(GREEN)✓ Migrations applied successfully$(NC)"

migrate-reset: ## Reset database and apply all migrations (WARNING: This will delete all data)
	@echo "$(YELLOW)⚠ WARNING: This will delete all data in the database!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "$(CYAN)Resetting database...$(NC)"; \
		yarn prisma migrate reset --schema $(PRISMA_SCHEMA) --force; \
		echo "$(GREEN)✓ Database reset successfully$(NC)"; \
	else \
		echo "$(YELLOW)Cancelled$(NC)"; \
	fi

migrate-status: ## Show migration status
	@echo "$(CYAN)Checking migration status...$(NC)"
	@yarn prisma migrate status --schema $(PRISMA_SCHEMA)

##@ Database Operations

db-generate: ## Generate Prisma Client
	@echo "$(CYAN)Generating Prisma Client...$(NC)"
	@yarn prisma generate --schema $(PRISMA_SCHEMA)
	@echo "$(GREEN)✓ Prisma Client generated successfully$(NC)"

db-seed: ## Seed the database
	@echo "$(CYAN)Seeding database...$(NC)"
	@yarn prisma db seed
	@echo "$(GREEN)✓ Database seeded successfully$(NC)"

db-reset: migrate-reset ## Alias for migrate-reset

db-apply-sql: ## Apply SQL script (default: scripts/init-pgvector.sql, usage: make db-apply-sql FILE=path/to/script.sql)
	@SQL_FILE="$(if $(FILE),$(FILE),$(SQL_SCRIPT))"; \
	if [ ! -f "$$SQL_FILE" ]; then \
		echo "$(RED)Error: File $$SQL_FILE not found$(NC)"; \
		exit 1; \
	fi; \
	echo "$(CYAN)Applying SQL script: $$SQL_FILE$(NC)"; \
	yarn prisma db execute --file $$SQL_FILE --schema $(PRISMA_SCHEMA); \
	echo "$(GREEN)✓ SQL script applied successfully$(NC)"

db-setup: db-apply-sql db-generate ## Setup database: apply SQL script and generate Prisma Client

##@ Cleanup

clean-logs: ## Remove all log files
	@echo "$(CYAN)Cleaning log files...$(NC)"
	@if [ -d "$(LOGS_DIR)" ]; then \
		find $(LOGS_DIR) -type f -name "*.log" -delete; \
		echo "$(GREEN)✓ Log files removed$(NC)"; \
	else \
		echo "$(YELLOW)No logs directory found$(NC)"; \
	fi

clean-dist: ## Remove build output directory
	@echo "$(CYAN)Cleaning build output...$(NC)"
	@if [ -d "$(DIST_DIR)" ]; then \
		rm -rf $(DIST_DIR); \
		echo "$(GREEN)✓ Build output removed$(NC)"; \
	else \
		echo "$(YELLOW)No dist directory found$(NC)"; \
	fi

clean-coverage: ## Remove test coverage directory
	@echo "$(CYAN)Cleaning test coverage...$(NC)"
	@if [ -d "$(COVERAGE_DIR)" ]; then \
		rm -rf $(COVERAGE_DIR); \
		echo "$(GREEN)✓ Coverage files removed$(NC)"; \
	else \
		echo "$(YELLOW)No coverage directory found$(NC)"; \
	fi

clean-node: ## Remove node_modules (use with caution)
	@echo "$(YELLOW)⚠ WARNING: This will delete node_modules!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "$(CYAN)Removing node_modules...$(NC)"; \
		rm -rf node_modules; \
		echo "$(GREEN)✓ node_modules removed$(NC)"; \
		echo "$(YELLOW)Run 'make install' to reinstall dependencies$(NC)"; \
	else \
		echo "$(YELLOW)Cancelled$(NC)"; \
	fi

clean-all: clean-logs clean-dist clean-coverage ## Remove all temporary files (logs, dist, coverage)

clean: clean-all ## Alias for clean-all

##@ Development

install: ## Install dependencies
	@echo "$(CYAN)Installing dependencies...$(NC)"
	@yarn install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

build: clean-dist ## Build the project
	@echo "$(CYAN)Building project...$(NC)"
	@yarn build
	@echo "$(GREEN)✓ Build completed$(NC)"

dev: ## Start development server
	@echo "$(CYAN)Starting development server...$(NC)"
	@yarn start:dev

format: ## Format code with Prettier
	@echo "$(CYAN)Formatting code...$(NC)"
	@yarn format
	@echo "$(GREEN)✓ Code formatted$(NC)"

lint: ## Lint code
	@echo "$(CYAN)Linting code...$(NC)"
	@yarn lint
	@echo "$(GREEN)✓ Linting completed$(NC)"

test: ## Run tests
	@echo "$(CYAN)Running tests...$(NC)"
	@yarn test

test-watch: ## Run tests in watch mode
	@echo "$(CYAN)Running tests in watch mode...$(NC)"
	@yarn test:watch

test-coverage: ## Run tests with coverage
	@echo "$(CYAN)Running tests with coverage...$(NC)"
	@yarn test:cov

##@ Docker

docker-up: ## Start Docker containers
	@echo "$(CYAN)Starting Docker containers...$(NC)"
	@yarn docker:dev

docker-down: ## Stop Docker containers
	@echo "$(CYAN)Stopping Docker containers...$(NC)"
	@docker-compose down

docker-clean: ## Stop and remove Docker containers and volumes
	@echo "$(YELLOW)⚠ WARNING: This will remove Docker volumes!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "$(CYAN)Cleaning Docker containers and volumes...$(NC)"; \
		yarn docker:dev:clean; \
		echo "$(GREEN)✓ Docker cleaned$(NC)"; \
	else \
		echo "$(YELLOW)Cancelled$(NC)"; \
	fi

docker-logs: ## Show Docker container logs
	@echo "$(CYAN)Showing Docker logs...$(NC)"
	@docker-compose logs -f

##@ Quick Setup

setup: install db-setup ## Complete setup: install dependencies, setup database, and generate Prisma Client

reset: clean-all migrate-reset ## Reset everything: clean files and reset database (WARNING: deletes data)

