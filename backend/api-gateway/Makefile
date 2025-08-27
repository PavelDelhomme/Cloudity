# backend/api-gateway/Makefile
.PHONY: help dev build test clean setup

include ../../scripts/colors.mk

help: ## API Gateway Go
	@echo "$(PURPLE)🌐 API Gateway$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

setup: ## Setup environnement Go
	$(call log_info,"Setup API Gateway")
	@go mod download
	@go mod tidy
	$(call log_success,"API Gateway configuré")

dev: ## Démarrage développement
	$(call log_info,"Démarrage API Gateway")
	@docker compose -f ../../docker-compose.yml up -d api-gateway
	$(call log_success,"API Gateway: http://localhost:8000")

dev-local: ## Démarrage local (sans Docker)
	$(call log_info,"Démarrage API Gateway local")
	@air -c .air.toml
	$(call log_success,"API Gateway local: http://localhost:8000")

build: ## Build du service
	$(call log_info,"Build API Gateway")
	@go build -o bin/api-gateway ./cmd/main.go
	$(call log_success,"Build terminé")

build-docker: ## Build image Docker
	@docker compose -f ../../docker-compose.yml build api-gateway

test: ## Tests Go
	$(call log_info,"Tests API Gateway")
	@go test ./... -v
	$(call log_success,"Tests terminés")

test-unit: ## Tests unitaires
	@go test ./internal/... -v

test-integration: ## Tests d'intégration
	@go test ./tests/integration/... -v

benchmark: ## Benchmarks
	@go test -bench=. ./...

lint: ## Linting Go
	@golangci-lint run

format: ## Formatage Go
	@go fmt ./...
	@goimports -w .

logs: ## Logs du service
	@docker compose -f ../../docker-compose.yml logs -f api-gateway

status: ## Status du service
	@docker compose -f ../../docker-compose.yml ps api-gateway

health: ## Health check
	@curl -f http://localhost:8000/health || echo "Service non disponible"

shell: ## Shell dans container
	@docker compose -f ../../docker-compose.yml exec api-gateway /bin/sh

clean: ## Nettoyage
	@go clean
	@rm -rf bin/ tmp/
