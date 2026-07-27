#!/usr/bin/env bash
# Personnalise une copie mobile/mail → mobile/<app>.
# Usage: ./scripts/mobile/customize-suite-app.sh calendar cloudity_calendar "Cloudity Calendar" calendar
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="${1:?folder}"
PKG="${2:?dart package name}"
TITLE="${3:?app title}"
PRODUCT="${4:?calendar|contacts|notes|tasks}"

SEED_COLOR=$(case "$PRODUCT" in
  calendar) echo "Colors.orange" ;;
  contacts) echo "Colors.deepPurple" ;;
  notes) echo "Colors.amber" ;;
  tasks) echo "Colors.purple" ;;
  *) echo "Colors.blue" ;;
esac)

DIR="${ROOT}/mobile/${APP}"
ANDROID_PKG="fr.cloudity.${PKG}"

# pubspec
cat > "${DIR}/pubspec.yaml" <<EOF
name: ${PKG}
description: "Cloudity ${TITLE} — app mobile suite."
publish_to: 'none'
version: 0.1.0+1
environment:
  sdk: ^3.11.4
dependencies:
  flutter:
    sdk: flutter
  cloudity_shared:
    path: ../cloudity_shared
  cloudity_auth_broker:
    path: ../cloudity_auth_broker
  cupertino_icons: ^1.0.8
  http: ^1.2.2
  flutter_secure_storage: ^9.2.4
  shared_preferences: ^2.3.3
dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^6.0.0
flutter:
  uses-material-design: true
EOF

# Android package
if [[ -d "${DIR}/android/app/src/main/kotlin/fr/cloudity/cloudity_mail" ]]; then
  mkdir -p "${DIR}/android/app/src/main/kotlin/fr/cloudity/${PKG}"
  mv "${DIR}/android/app/src/main/kotlin/fr/cloudity/cloudity_mail/MainActivity.kt" \
    "${DIR}/android/app/src/main/kotlin/fr/cloudity/${PKG}/MainActivity.kt"
  rm -rf "${DIR}/android/app/src/main/kotlin/fr/cloudity/cloudity_mail"
  sed -i "s/fr.cloudity.cloudity_mail/${ANDROID_PKG}/g" \
    "${DIR}/android/app/src/main/kotlin/fr/cloudity/${PKG}/MainActivity.kt"
fi
sed -i "s/fr.cloudity.cloudity_mail/${ANDROID_PKG}/g" "${DIR}/android/app/build.gradle.kts"

# Supprimer écrans Mail spécifiques (ancien ou nouveau layout lib/)
rm -f "${DIR}/lib/features/inbox_screen.dart" \
  "${DIR}/lib/inbox_screen.dart" \
  "${DIR}/lib/features/compose_mail_screen.dart" \
  "${DIR}/lib/features/message_detail_screen.dart" \
  "${DIR}/lib/features/mail_imap_password_screen.dart" \
  "${DIR}/lib/features/mail_settings_screen.dart" \
  "${DIR}/lib/features/mail_account_helpers.dart" \
  "${DIR}/lib/features/mail_validation.dart" \
  "${DIR}/test/mail_validation_test.dart" \
  "${DIR}/test/mail_account_helpers_test.dart"

mkdir -p "${DIR}/lib/auth" "${DIR}/lib/api" "${DIR}/lib/features"

"${ROOT}/scripts/mobile/copy-suite-auth-base.sh" "${APP}" "${PKG}"

cat > "${DIR}/test/widget_test.dart" <<'EOF'
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';

void main() {
  testWidgets('MaterialApp smoke', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Text('ok'))));
    expect(find.text('ok'), findsOneWidget);
  });
}
EOF

rm -f "${DIR}/integration_test/mail_flow_test.dart" 2>/dev/null || true

sed -i "s/Cloudity Mail/${TITLE}/g" "${DIR}/lib/auth/login_screen.dart"
LOGIN_KEY="cloudity_${PKG//cloudity_/}_login"
sed -i "s/cloudity_mail_login/${LOGIN_KEY}/g" "${DIR}/lib/auth/login_screen.dart"

cat > "${DIR}/lib/main.dart" <<EOF
import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'auth/login_screen.dart';
import 'auth/session_store.dart';
import 'auth/user_session.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const Cloudity${PRODUCT^}App());
}

class Cloudity${PRODUCT^}App extends StatelessWidget {
  const Cloudity${PRODUCT^}App({super.key});

  @override
  Widget build(BuildContext context) {
    return CloudityThemedApp(
      title: '${TITLE}',
      seedColor: ${SEED_COLOR},
      home: SuiteAppShell<UserSession>(
        restoreSession: _restoreSession,
        clearSession: SessionStore.clearTokens,
        loginBuilder: (onLoggedIn) => LoginScreen(onLoggedIn: onLoggedIn),
        homeBuilder: (session, onLogout) => SuiteProductHomeScreen(
          product: SuiteProduct.${PRODUCT},
          gatewayBase: session.api.baseUrl,
          accessToken: session.accessToken,
          refreshAccessToken: () async {
            await session.refreshIfNeeded();
            return session.accessToken;
          },
          onLogout: onLogout,
        ),
      ),
    );
  }
}

Future<UserSession?> _restoreSession() async {
  final pair = await SessionStore.loadValidatedSession();
  if (pair == null) return null;
  return UserSession(
    api: pair.api,
    accessToken: pair.access,
    refreshToken: pair.refresh,
  );
}
EOF

echo "✅ ${APP} personnalisé (${PKG}) — layout lib/auth|api|features"
