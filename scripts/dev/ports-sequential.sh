#!/usr/bin/env bash
# Série ports hôte Cloudity (PORT-ORG-01) — source unique pour Makefile / compose / scripts.
# Usage : source scripts/dev/ports-sequential.sh

# Apps & API (6001–6012)
export PORT_DASHBOARD="${PORT_DASHBOARD:-6001}"
export PORT_GATEWAY="${PORT_GATEWAY:-6002}"
export PORT_AUTH="${PORT_AUTH:-6003}"
export PORT_ADMIN="${PORT_ADMIN:-6004}"
export PORT_MAIL_DIRECTORY="${PORT_MAIL_DIRECTORY:-6005}"
export PORT_PASS_MGR="${PORT_PASS_MGR:-6006}"
export PORT_CALENDAR="${PORT_CALENDAR:-6007}"
export PORT_NOTES="${PORT_NOTES:-6008}"
export PORT_TASKS="${PORT_TASKS:-6009}"
export PORT_DRIVE="${PORT_DRIVE:-6010}"
export PORT_CONTACTS="${PORT_CONTACTS:-6011}"
export PORT_PHOTOS="${PORT_PHOTOS:-6012}"

# Infra & outils dev (inchangés)
export PORT_POSTGRES="${PORT_POSTGRES:-6042}"
export PORT_REDIS="${PORT_REDIS:-6079}"
export PORT_ADMINER="${PORT_ADMINER:-6083}"
export PORT_REDIS_COMMANDER="${PORT_REDIS_COMMANDER:-6084}"
