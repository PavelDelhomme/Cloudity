# mobile/calendar — placeholder (non démarré)

> **Statut** : 🟡 placeholder créé le **2026-05-13** (J7 ter sprint Pass)
> pour **réserver l'emplacement** du futur app `cloudity_calendar`. Le
> répertoire ne contient pour l'instant **que ce README + un
> `pubspec.yaml` stub**.
>
> **Ne pas** tenter `flutter run` — il n'y a ni `lib/main.dart`, ni
> dossier `android/`, ni dossier `ios/`. Le scaffolding réel se fera
> avec `flutter create --platforms=android,ios .` au démarrage du
> chantier (cf. ROADMAP).

## Pourquoi un placeholder ?

L'utilisateur a explicitement demandé en 2026-05-13 que les surfaces
manquantes soient **listées et préparées**, sans pour autant exploser
le scope du sprint Pass en cours :

> *« Et aussi une application mobile pour Calendar, Photos, les
> applications aussi Linux et mobile de Drive en plus des applications
> web aussi donc etc. Note-le bien. »*

→ On crée ce dossier pour qu'il apparaisse dans la matrice
[`docs/produit/MULTI-PLATEFORME.md`](../../docs/produit/MULTI-PLATEFORME.md)
et qu'il soit pré-câblé (mêmes conventions que `mobile/drive`,
`mobile/mail`, `mobile/photos`).

## Pré-requis avant de démarrer

1. Avoir un **service backend** `calendar-service` (Go + Postgres)
   qui expose au moins :
   - `GET  /calendar/events?from=…&to=…` — liste événements de
     l'utilisateur ;
   - `POST /calendar/events` — création ;
   - `iCal/CalDAV` à terme (interop standard).
2. Avoir une **page web Calendar** (`cloudity-web` route `/app/calendar`)
   qui fait le parcours minimal — l'app mobile suit (cf.
   [`MOBILES.md`](../../docs/produit/MOBILES.md) § 0).
3. Décider du **scope MVP mobile** :
   - V0 : lecture des événements à venir (J+0 à J+7) ;
   - V1 : création d'événements offline avec sync au retour réseau ;
   - V2 : rappels natifs (FCM/APNs/Linux desktop notifications).

## Plan de scaffolding (à exécuter quand on démarre)

```bash
cd mobile
flutter create --platforms=android,ios --org com.cloudity calendar
cd calendar
# Ajouter cloudity_shared comme dépendance dans pubspec.yaml :
#   dependencies:
#     cloudity_shared:
#       path: ../cloudity_shared
flutter pub get
```

## Conventions à respecter (alignées sur Drive/Mail/Photos)

* `lib/main.dart` : `CloudityCalendarApp` (Material 3).
* `lib/auth_api.dart` : reprendre le pattern de `mobile/drive/lib/auth_api.dart`
  (login → 2FA → tokens, via `Auth2FAClient` du package
  `cloudity_shared`).
* `lib/session_store.dart` : réutiliser les mêmes clés
  `CloudityStorageKeys.cloudity_suite_*` que Drive/Mail/Photos pour
  partager la session (Pass est volontairement à part).
* `lib/login_screen.dart` : copier le pattern Drive (étape 2FA
  `_build2FAForm`).
* Tests : `flutter analyze` 0 issue + au moins un `widget_test`.

## Liens

* Matrice multiplateforme : [`docs/produit/MULTI-PLATEFORME.md`](../../docs/produit/MULTI-PLATEFORME.md).
* Roadmap fonctionnelle : [`docs/produit/ROADMAP.md`](../../docs/produit/ROADMAP.md) — APP-05 Calendar.
* Backlog : [`BACKLOG.md`](../../BACKLOG.md) (entrée *Calendar — placeholder*).
