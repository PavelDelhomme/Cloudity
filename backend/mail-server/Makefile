# backend/mail-server/Makefile
.PHONY: help dev build test clean setup

include ../../scripts/colors.mk

help: ## Mail Server Custom
	printf "$(PURPLE)📮 Mail Server$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

setup: ## Setup mail server
	$(call log_info,"Setup Mail Server")
	@mkdir -p {postfix,dovecot}/{config,logs}
	@mkdir -p data/{mail,certs,dkim}
	$(call log_success,"Mail Server configuré")

dev: ## Démarrage développement
	$(call log_info,"Démarrage Mail Server")
	@docker compose -f ../../docker-compose.yml up -d mail-server
	$(call log_success,"Mail Server: SMTP:587, IMAP:993")

build: ## Build images mail server
	$(call log_info,"Build Mail Server")
	@docker compose -f docker-compose.mail.yml build
	$(call log_success,"Build terminé")

test: ## Tests configuration
	$(call log_info,"Tests Mail Server")
	printf "Test SMTP..." && nc -zv localhost 587
	printf "Test IMAP..." && nc -zv localhost 993
	$(call log_success,"Tests terminés")

test-smtp: ## Test SMTP uniquement
	@telnet localhost 587

test-imap: ## Test IMAP uniquement  
	@telnet localhost 993

config-check: ## Vérification config Postfix
	@docker compose -f ../../docker-compose.yml exec mail-server postfix check

config-reload: ## Rechargement config
	@docker compose -f ../../docker-compose.yml exec mail-server postfix reload
	@docker compose -f ../../docker-compose.yml exec mail-server dovecot reload

logs: ## Logs mail server
	@docker compose -f ../../docker-compose.yml logs -f mail-server

logs-postfix: ## Logs Postfix
	@docker compose -f ../../docker-compose.yml exec mail-server tail -f /var/log/mail.log

logs-dovecot: ## Logs Dovecot
	@docker compose -f ../../docker-compose.yml exec mail-server tail -f /var/log/dovecot.log

status: ## Status mail server
	@docker compose -f ../../docker-compose.yml ps mail-server

shell-postfix: ## Shell Postfix
	@docker compose -f ../../docker-compose.yml exec mail-server /bin/bash

queue-status: ## Status queue mail
	@docker compose -f ../../docker-compose.yml exec mail-server mailq

clean: ## Nettoyage
	@rm -rf data/mail/* data/logs/*