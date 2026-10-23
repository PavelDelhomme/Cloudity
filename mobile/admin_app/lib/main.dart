import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:cloudity_shared/cloudity_shared.dart';

import 'api/auth_api.dart';
import 'auth/admin_gate.dart';
import 'auth/admin_refresh.dart';
import 'auth/user_session.dart';
import 'features/admin_home.dart';

CloudityCrashSessionBinding _crashBinding(UserSession s) => CloudityCrashSessionBinding(
      accessToken: s.accessToken,
      gatewayBase: s.api.baseUrl,
    );

Future<bool?> _adminRoleOrNull(AuthApi api, String access) async {
  // Pas d’endpoint /auth/me fiable : le rôle admin est dans le JWT.
  final role = roleFromAccessToken(access);
  if (role == null) {
    // Jeton illisible — vérifier au moins que la gateway répond.
    try {
      if (!await api.authHealth()) return null;
    } catch (_) {
      return null;
    }
    return false;
  }
  return role == 'admin';
}

/// Le jeton encore valide peut porter un ancien rôle `user`. Un refresh relit
/// le rôle en base avant de refuser l’accès admin.
Future<({String access, String refresh, bool? isAdmin})> _tokensForAdmin({
  required AuthApi api,
  required String access,
  required String refresh,
}) async {
  final want = (emailFromAccessToken(access) ?? '').trim().toLowerCase();
  // Pas de scan des ContentProviders ici : un fournisseur bloqué figeait
  // le démarrage et renvoyait vers le login. Le renouvellement HTTP suffit.
  final copies = <({String email, String access, String refresh})>[];
  // Le jeton encore valide peut porter un ancien rôle. Chaque refresh de CE
  // compte relit le rôle en base. Le compte labo reste refusé.
  return resolveAdminTokens(
    access: access,
    refresh: refresh,
    expectedEmail: want,
    copies: copies,
    roleOf: (token) => _adminRoleOrNull(api, token),
    refreshTokens: api.refreshTokens,
    renewAccess: api.renewFromAccess,
  );
}

Future<List<({String email, String refresh})>> _refreshCopies() async {
  // Le scan de tous les fournisseurs a bloqué le fil. Le refresh HTTP suffit.
  return const [];
}

Future<AdminEntry> _adminEntry(AuthApi api, String access) async {
  if (access.trim().isEmpty) return AdminEntry.unresolved;
  try {
    return adminEntryFromStatus(await api.adminUsersStatus(access));
  } catch (error) {
    debugPrint('Admin: API admin injoignable ($error)');
    return AdminEntry.unresolved;
  }
}

Future<UserSession?> _sessionAfterProbe({
  required AdminEntry entry,
  required AuthApi api,
  required String access,
  required String refresh,
  required String previousAccess,
  required String previousRefresh,
  String emailHint = '',
}) async {
  if (entry == AdminEntry.denied) {
    debugPrint('Admin: API 403, écran de connexion');
    await SessionStore.clearLocalTokens();
    adminStayOnLogin();
    return null;
  }
  if (entry != AdminEntry.open) {
    debugPrint('Admin: API admin sans 200, tableau fermé');
    return null;
  }
  adminClearLoginNotice();
  if (access != previousAccess || refresh != previousRefresh) {
    final savedEmail = emailFromAccessToken(access) ?? emailHint;
    if (savedEmail.isNotEmpty) {
      await SessionStore.saveSessionWithEmail(
        gatewayUrl: api.baseUrl,
        accessToken: access,
        refreshToken: refresh,
        email: savedEmail,
        tenantId: await SessionStore.readTenantId(),
        userId: await SessionStore.readUserId(),
      );
    } else {
      await SessionStore.saveSession(
        gatewayUrl: api.baseUrl,
        accessToken: access,
        refreshToken: refresh,
      );
    }
    debugPrint('Admin: session renouvelée (${api.baseUrl})');
  }
  debugPrint('Admin: API 200, ouverture du tableau');
  return UserSession(api: api, accessToken: access, refreshToken: refresh);
}

Future<UserSession?> _restoreSession() async {
  debugPrint('Admin: reprise de session');
  final pair = await SessionStore.loadValidatedSession(createApi: AuthApi.new);
  if (pair == null) {
    debugPrint('Admin: session locale absente');
    return null;
  }
  var access = pair.access;
  var refresh = pair.refresh;
  final email = emailFromAccessToken(access) ?? '';
  debugPrint('Admin: session locale lue, lecture API admin');
  try {
    final recovered = await recoverAdminRefresh(
      access: pair.access,
      refresh: pair.refresh,
      expectedEmail: email,
      listCopies: _refreshCopies,
      refreshTokens: (access, refresh) => pair.api.refreshTokens(refresh),
    );
    if (!recovered.openChooser && recovered.access.trim().isNotEmpty) {
      final adminTokens = await _tokensForAdmin(
        api: pair.api,
        access: recovered.access,
        refresh: recovered.refresh,
      );
      if (adminTokens.access.trim().isNotEmpty) {
        access = adminTokens.access;
        refresh = adminTokens.refresh;
      }
    }
  } catch (error) {
    debugPrint('Admin: relecture interrompue ($error)');
  }
  return _sessionAfterProbe(
    entry: await _adminEntry(pair.api, access),
    api: pair.api,
    access: access,
    refresh: refresh,
    previousAccess: pair.access,
    previousRefresh: pair.refresh,
    emailHint: email,
  );
}

Future<void> _onLoggedIn(
  CloudityUserSession<AuthApi> session,
  void Function(UserSession session) onLoggedIn,
) async {
  final adminTokens = await _tokensForAdmin(
    api: session.api,
    access: session.accessToken,
    refresh: session.refreshToken,
  );
  final access = adminTokens.access.trim().isNotEmpty
      ? adminTokens.access
      : session.accessToken;
  final refresh = adminTokens.refresh.trim().isNotEmpty
      ? adminTokens.refresh
      : session.refreshToken;
  final entry = await _adminEntry(session.api, access);
  if (entry == AdminEntry.denied) {
    await SessionStore.clearLocalTokens();
    adminStayOnLogin();
    throw AuthException(adminDeniedMessage);
  }
  if (entry != AdminEntry.open) {
    throw AuthException(
      'Gateway Hubera injoignable. Vérifie la connexion puis réessaie.',
    );
  }
  adminClearLoginNotice();
  if (access != session.accessToken || refresh != session.refreshToken) {
    final email = emailFromAccessToken(access) ?? '';
    if (email.isNotEmpty) {
      await SessionStore.saveSessionWithEmail(
        gatewayUrl: session.api.baseUrl,
        accessToken: access,
        refreshToken: refresh,
        email: email,
        tenantId: tenantIdFromAccessToken(access) ?? 1,
      );
    }
  }
  onLoggedIn(
    UserSession(
      api: session.api,
      accessToken: access,
      refreshToken: refresh,
    ),
  );
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.admin,
    title: 'Hubera Admin',
    home: SuiteAppShell<UserSession>(
      suiteApp: ClouditySuiteApp.admin,
      restoreSession: _restoreSession,
      clearSession: SessionStore.clearTokens,
      loginNotice: adminLoginNotice,
      crashSession: _crashBinding,
      sessionCredentials: (s) => (gatewayBase: s.api.baseUrl, accessToken: s.accessToken),
      loginBuilder: (onLoggedIn) => CloudityLoginScreen<AuthApi>(
        suiteApp: ClouditySuiteApp.admin,
        productTitle: 'Hubera Admin',
        keyPrefix: 'cloudity_admin',
        createApi: AuthApi.new,
        initialError: adminLoginNotice.value,
        onLoggedIn: (s) => _onLoggedIn(s, onLoggedIn),
      ),
      homeBuilder: (session, onLogout) =>
          AdminHome(session: session, onLogout: onLogout),
    ),
  );
}
