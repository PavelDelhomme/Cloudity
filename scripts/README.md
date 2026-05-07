# Scripts Cloudity

Arborescence (tout est invoqué depuis la **racine du dépôt**, sauf mention contraire) :

| Dossier | Rôle |
|--------|------|
| **`db/`** | Migration PostgreSQL appliquée par le service Docker **`db-migrate`** (`migrate-db.sh`). |
| **`mobile/`** | Flutter : `run-mobile.sh`, `test-mobile-app.sh`, suite Photos/Drive/Mail, doctor, logcat mail. |
| **`ci/`** | Rapports de tests (`run-tests-with-report.sh`), E2E shell, sécurité, envoi des métriques pipeline (`report-pipeline-run.sh`). |
| **`dev/`** | Setup (`setup.sh`, `setup-dev.sh`, `install-deps.sh`), diagnostic, réparation, statut, fin de feature, nettoyage tenants de test. |

Les cibles **`make …`** du Makefile pointent vers ces chemins ; préférez-les aux appels directs.
