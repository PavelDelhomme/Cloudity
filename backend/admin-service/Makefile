# backend/admin-service/Makefile
.PHONY: help dev build test clean setup

include ../../scripts/colors.mk

help: ## Admin Service Python/FastAPI
	@echo "$(PURPLE)🏢 Admin Service$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

setup: ## Setup environnement Python
	$(call log_info,"Setup Admin Service")
	@python -m venv venv
	@source venv/bin/activate && pip install -r requirements.txt
	$(call log_success,"Admin Service configuré")

dev: ## Démarrage développement
	$(call log_info,"Démarrage Admin Service")
	@docker compose -f ../../docker-compose.yml up -d admin-service
	$(call log_success,"Admin Service: http://localhost:8082")

build: ## Build du service
	$(call log_info,"Build Admin Service")
	@docker compose -f ../../docker-compose.yml build admin-service
	$(call log_success,"Build terminé")

test: ## Tests Python
	$(call log_info,"Tests Admin Service")
	@source venv/bin/activate && python -m pytest tests/
	$(call log_success,"Tests terminés")

test-api: ## Tests API
	@source venv/bin/activate && python -m pytest tests/test_api.py -v

lint: ## Linting Python
	@source venv/bin/activate && flake8 . && black --check .

format: ## Formatage Python
	@source venv/bin/activate && black . && isort .

logs: ## Logs du service
	@docker compose -f ../../docker-compose.yml logs -f admin-service

status: ## Status du service
	@docker compose -f ../../docker-compose.yml ps admin-service

health: ## Health check
	@curl -f http://localhost:8082/health || echo "Service non disponible"

shell: ## Shell Python dans container
	@docker compose -f ../../docker-compose.yml exec admin-service /bin/bash

clean: ## Nettoyage
	@rm -rf venv/ __pycache__/ .pytest_cache/
	@find . -name "*.pyc" -delete
