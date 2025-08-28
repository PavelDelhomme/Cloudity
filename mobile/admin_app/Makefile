# mobile/admin_app/Makefile
.PHONY: help dev build test clean setup

include ../../scripts/colors.mk

help: ## Admin App Mobile Flutter
	printf "$(PURPLE)📱 Admin App Mobile$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

setup: ## Setup Flutter
	$(call log_info,"Setup Admin App Mobile")
	@flutter pub get
	@flutter doctor
	$(call log_success,"Admin App Mobile configuré")

dev: ## Démarrage développement
	$(call log_info,"Démarrage Admin App Mobile")
	@flutter run --debug
	$(call log_success,"Admin App Mobile démarré")

dev-android: ## Démarrage Android
	@flutter run -d android

dev-ios: ## Démarrage iOS
	@flutter run -d ios

dev-web: ## Démarrage Web
	@flutter run -d web-server --web-port 8096

build: ## Build production
	$(call log_info,"Build Admin App Mobile")
	@flutter build apk --release
	@flutter build ios --release
	$(call log_success,"Build terminé")

build-android: ## Build Android APK
	@flutter build apk --release

build-ios: ## Build iOS
	@flutter build ios --release

build-web: ## Build Web
	@flutter build web

test: ## Tests Flutter
	$(call log_info,"Tests Admin App Mobile")
	@flutter test
	$(call log_success,"Tests terminés")

test-integration: ## Tests d'intégration
	@flutter test integration_test/

test-widget: ## Tests widgets
	@flutter test test/widget_test.dart

lint: ## Linting Dart
	@flutter analyze

format: ## Formatage Dart
	@dart format .

doctor: ## Flutter Doctor
	@flutter doctor -v

devices: ## Appareils disponibles
	@flutter devices

clean: ## Nettoyage Flutter
	@flutter clean
	@flutter pub get

upgrade: ## Mise à jour dépendances
	@flutter pub upgrade