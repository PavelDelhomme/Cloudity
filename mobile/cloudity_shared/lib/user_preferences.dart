import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Identifiants apps Cloudity (alignés web).
enum CloudityAppId {
  hub,
  pass,
  drive,
  photos,
  mail,
  calendar,
  contacts,
  notes,
  tasks,
}

/// Préférences Pass (sync compte + cache local).
class PassAppSettings {
  const PassAppSettings({
    this.clipboardEnabled = true,
    this.clipboardClearMs = 30000,
    this.totpAutoCopy = false,
    this.digitalAssetLinksEnabled = true,
    this.autoLockMs = 300000,
  });

  final bool clipboardEnabled;
  final int clipboardClearMs;
  final bool totpAutoCopy;
  final bool digitalAssetLinksEnabled;
  final int autoLockMs;

  PassAppSettings copyWith({
    bool? clipboardEnabled,
    int? clipboardClearMs,
    bool? totpAutoCopy,
    bool? digitalAssetLinksEnabled,
    int? autoLockMs,
  }) {
    return PassAppSettings(
      clipboardEnabled: clipboardEnabled ?? this.clipboardEnabled,
      clipboardClearMs: clipboardClearMs ?? this.clipboardClearMs,
      totpAutoCopy: totpAutoCopy ?? this.totpAutoCopy,
      digitalAssetLinksEnabled: digitalAssetLinksEnabled ?? this.digitalAssetLinksEnabled,
      autoLockMs: autoLockMs ?? this.autoLockMs,
    );
  }

  Map<String, dynamic> toJson() => {
        'clipboardEnabled': clipboardEnabled,
        'clipboardClearMs': clipboardClearMs,
        'totpAutoCopy': totpAutoCopy,
        'digitalAssetLinksEnabled': digitalAssetLinksEnabled,
        'autoLockMs': autoLockMs,
      };

  static PassAppSettings fromJson(Map<String, dynamic>? raw) {
    if (raw == null) return const PassAppSettings();
    int n(dynamic v, int d) => v is num ? v.toInt() : d;
    return PassAppSettings(
      clipboardEnabled: raw['clipboardEnabled'] is bool ? raw['clipboardEnabled'] as bool : true,
      clipboardClearMs: n(raw['clipboardClearMs'], 30000),
      totpAutoCopy: raw['totpAutoCopy'] is bool ? raw['totpAutoCopy'] as bool : false,
      digitalAssetLinksEnabled:
          raw['digitalAssetLinksEnabled'] is bool ? raw['digitalAssetLinksEnabled'] as bool : true,
      autoLockMs: n(raw['autoLockMs'], 300000),
    );
  }
}

/// Préférences utilisateur v1 (cache + sync API).
class UserPreferencesV1 {
  const UserPreferencesV1({
    this.themeDefault = 'system',
    this.themeApps = const {},
    this.pass = const PassAppSettings(),
  });

  final String themeDefault;
  final Map<String, String> themeApps;
  final PassAppSettings pass;

  UserPreferencesV1 copyWith({
    String? themeDefault,
    Map<String, String>? themeApps,
    PassAppSettings? pass,
  }) {
    return UserPreferencesV1(
      themeDefault: themeDefault ?? this.themeDefault,
      themeApps: themeApps ?? this.themeApps,
      pass: pass ?? this.pass,
    );
  }

  CloudityThemeMode resolveTheme(CloudityAppId app) {
    final key = app.name;
    final override = themeApps[key];
    return cloudityThemeModeFromString(override ?? themeDefault);
  }

  Map<String, dynamic> toPatchJson() => {
        'theme': {
          'default': themeDefault,
          'apps': themeApps,
        },
        'pass': pass.toJson(),
      };

  static UserPreferencesV1 fromJson(Map<String, dynamic>? raw) {
    if (raw == null) return const UserPreferencesV1();
    final theme = raw['theme'];
    String def = 'system';
    final apps = <String, String>{};
    if (theme is Map) {
      if (theme['default'] is String) def = theme['default'] as String;
      final a = theme['apps'];
      if (a is Map) {
        for (final e in a.entries) {
          if (e.value is String) apps[e.key.toString()] = e.value as String;
        }
      }
    }
    final passRaw = raw['pass'];
    return UserPreferencesV1(
      themeDefault: def,
      themeApps: apps,
      pass: PassAppSettings.fromJson(passRaw is Map<String, dynamic> ? passRaw : null),
    );
  }
}

enum CloudityThemeMode { system, light, dark }

CloudityThemeMode cloudityThemeModeFromString(String? raw) {
  switch (raw) {
    case 'light':
      return CloudityThemeMode.light;
    case 'dark':
      return CloudityThemeMode.dark;
    default:
      return CloudityThemeMode.system;
  }
}

String cloudityThemeModeToString(CloudityThemeMode mode) => switch (mode) {
      CloudityThemeMode.light => 'light',
      CloudityThemeMode.dark => 'dark',
      CloudityThemeMode.system => 'system',
    };

/// Cache + API sync (`GET/PUT /auth/me/preferences`).
class UserPreferencesStore {
  static const cacheKey = 'cloudity.userPreferences.v1'; // aligné USER_PREFERENCES_CACHE_KEY (@cloudity/shared)

  static Future<UserPreferencesV1> loadCached() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(cacheKey);
    if (raw == null) return const UserPreferencesV1();
    try {
      return UserPreferencesV1.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return const UserPreferencesV1();
    }
  }

  static Future<void> saveCached(UserPreferencesV1 prefs) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(cacheKey, jsonEncode(prefs.toPatchJson()));
  }
}
