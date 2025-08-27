# backend/alias-service/Makefile
.PHONY: dev build test clean

dev: ## Démarrage en mode développement
	cargo watch -x run

build: ## Construction du projet
	cargo build --release

test: ## Exécution des tests
	cargo test

clean: ## Nettoyage
	cargo clean

docker-build: ## Construction image Docker
	docker build -t cloudity/alias-service -f Dockerfile.dev .

docker-run: ## Lancement container
	docker run -p 8092:8092 --env-file ../../.env cloudity/alias-service

help: ## Affiche l'aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'