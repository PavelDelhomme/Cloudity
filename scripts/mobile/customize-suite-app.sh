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
  contacts) echo "Colors.indigo" ;;
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

# Supprimer écrans Mail spécifiques
rm -f "${DIR}/lib/inbox_screen.dart" \
  "${DIR}/lib/compose_mail_screen.dart" \
  "${DIR}/lib/message_detail_screen.dart" \
  "${DIR}/lib/mail_imap_password_screen.dart" \
  "${DIR}/lib/mail_settings_screen.dart" \
  "${DIR}/lib/mail_account_helpers.dart" \
  "${DIR}/test/mail_validation_test.dart"

# Auth API léger
"${ROOT}/scripts/mobile/copy-suite-auth-base.sh" "${APP}" "${PKG}"

# Tests widget minimal
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

# Login : titre app
sed -i "s/Cloudity Mail/${TITLE}/g" "${DIR}/lib/login_screen.dart"
sed -i "s/cloudity_mail_login/cloudity_${PKG//cloudity_/}_login/g" "${DIR}/lib/login_screen.dart"

# main.dart
cat > "${DIR}/lib/main.dart" <<EOF
import 'package:flutter/material.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'login_screen.dart';
import 'session_store.dart';
import 'user_session.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _App());
}

class _App extends StatelessWidget {
  const _App();

  @override
  Widget build(BuildContext context) {
    return CloudityThemedApp(
      title: '${TITLE}',
      seedColor: ${SEED_COLOR},
      home: const _Bootstrap(),
    );
  }
}

class _Bootstrap extends StatefulWidget {
  const _Bootstrap();

  @override
  State<_Bootstrap> createState() => _BootstrapState();
}

class _BootstrapState extends State<_Bootstrap> {
  bool _ready = false;
  UserSession? _session;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final pair = await SessionStore.loadValidatedSession();
    if (!mounted) return;
    setState(() {
      _ready = true;
      if (pair != null) {
        _session = UserSession(
          api: pair.api,
          accessToken: pair.access,
          refreshToken: pair.refresh,
        );
      }
    });
  }

  Future<void> _onLogout() async {
    await SessionStore.clearTokens();
    if (!mounted) return;
    setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final session = _session;
    if (session == null) {
      return LoginScreen(onLoggedIn: (s) => setState(() => _session = s));
    }
    return SuiteProductHomeScreen(
      product: SuiteProduct.${PRODUCT},
      gatewayBase: session.api.baseUrl,
      accessToken: session.accessToken,
      refreshAccessToken: () async {
        await session.refreshIfNeeded();
        return session.accessToken;
      },
      onLogout: _onLogout,
    );
  }
}
EOF

echo "✅ ${APP} personnalisé (${PKG})"
