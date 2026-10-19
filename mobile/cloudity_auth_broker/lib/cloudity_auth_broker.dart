import 'dart:io';

import 'package:flutter/services.dart';

/// Compte Cloudity exposé par le broker (apps Android même signature).
class CloudityAuthAccount {
  const CloudityAuthAccount({
    required this.email,
    required this.gatewayUrl,
    required this.accessToken,
    required this.refreshToken,
    this.tenantId = 1,
    this.sourcePackage,
    this.updatedAt = 0,
  });

  final String email;
  final String gatewayUrl;
  final String accessToken;
  final String refreshToken;
  final int tenantId;
  final String? sourcePackage;
  final int updatedAt;

  factory CloudityAuthAccount.fromMap(Map<dynamic, dynamic> m) {
    return CloudityAuthAccount(
      email: '${m['email'] ?? ''}',
      gatewayUrl: '${m['gateway_url'] ?? ''}',
      accessToken: '${m['access_token'] ?? ''}',
      refreshToken: '${m['refresh_token'] ?? ''}',
      tenantId: (m['tenant_id'] as num?)?.toInt() ?? 1,
      sourcePackage: m['source_package'] as String?,
      updatedAt: (m['updated_at'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toMap() => {
        'email': email,
        'gateway_url': gatewayUrl,
        'access_token': accessToken,
        'refresh_token': refreshToken,
        'tenant_id': tenantId,
      };
}

/// Partage gateway + jetons entre toutes les apps Cloudity (Android, signature identique).
class CloudityAuthBroker {
  CloudityAuthBroker._();

  static const _channel = MethodChannel('cloudity_auth_broker');

  static bool get isSupported => Platform.isAndroid;

  /// Access frais du compte déjà choisi, demandé à Hubera ID. Pas d’autre adresse.
  static Future<CloudityAuthAccount?> freshAccount(String email) async {
    if (!isSupported) return null;
    final want = email.trim().toLowerCase();
    if (want.isEmpty) return null;
    try {
      final raw = await _channel.invokeMethod<dynamic>(
        'freshAccount',
        {'email': want},
      );
      if (raw is! Map) return null;
      final account = CloudityAuthAccount.fromMap(Map<dynamic, dynamic>.from(raw));
      if (account.email.trim().toLowerCase() != want) return null;
      return account;
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }

  /// Une entrée par e-mail (copie la plus fraîche parmi les peers).
  static Future<List<CloudityAuthAccount>> listAccounts() async {
    if (!isSupported) return [];
    final raw = await _channel.invokeMethod<List<dynamic>>('listAccounts');
    if (raw == null) return [];
    return raw
        .map((e) => CloudityAuthAccount.fromMap(Map<dynamic, dynamic>.from(e as Map)))
        .where((a) => a.email.isNotEmpty && a.refreshToken.isNotEmpty)
        .toList();
  }

  /// Compte Hubera ID déjà sur l’appareil, y compris une adresse sans jeton.
  ///
  /// Le scan des fournisseurs reste dans l’exécuteur du plugin, jamais sur
  /// le fil UI. [listAccounts] ne change pas : il ignore toujours les
  /// adresses sans jeton de rafraîchissement.
  /// Comptes AccountManager déjà sur l’appareil, sans le scan des fournisseurs.
  static Future<List<CloudityAuthAccount>> listAccountManagerAccounts() async {
    if (!isSupported) return [];
    try {
      final raw =
          await _channel.invokeMethod<List<dynamic>>('listAccountManagerAccounts');
      if (raw == null) return [];
      return raw
          .map((e) => CloudityAuthAccount.fromMap(Map<dynamic, dynamic>.from(e as Map)))
          .where((a) => a.email.isNotEmpty)
          .toList();
    } on MissingPluginException {
      return [];
    } on PlatformException {
      return [];
    }
  }

  static Future<List<CloudityAuthAccount>> listHuberaDeviceAccounts() async {
    if (!isSupported) return [];
    try {
      final raw =
          await _channel.invokeMethod<List<dynamic>>('listHuberaDeviceAccounts');
      if (raw == null) return [];
      return raw
          .map((e) => CloudityAuthAccount.fromMap(Map<dynamic, dynamic>.from(e as Map)))
          .where((a) => a.email.isNotEmpty)
          .toList();
    } on MissingPluginException {
      return [];
    } on PlatformException {
      return [];
    }
  }

  /// Toutes les copies brutes (tous les ContentProviders) — pour retry SSO.
  static Future<List<CloudityAuthAccount>> listAllAccountCopies() async {
    if (!isSupported) return [];
    try {
      final raw =
          await _channel.invokeMethod<List<dynamic>>('listAllAccountCopies');
      if (raw == null) return [];
      return raw
          .map((e) => CloudityAuthAccount.fromMap(Map<dynamic, dynamic>.from(e as Map)))
          .where((a) => a.email.isNotEmpty && a.refreshToken.isNotEmpty)
          .toList();
    } on MissingPluginException {
      return listAccounts();
    } on PlatformException {
      return listAccounts();
    }
  }

  static Future<void> saveSession(CloudityAuthAccount account) async {
    if (!isSupported) return;
    await _channel.invokeMethod<void>('saveSession', account.toMap());
  }

  static Future<void> clearAccount(String email) async {
    if (!isSupported) return;
    await _channel.invokeMethod<void>('clearAccount', {'email': email});
  }

  static Future<bool> isHuberaIdInstalled() async {
    if (!isSupported) return true;
    try {
      return await _channel.invokeMethod<bool>('idInstalled') ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  /// Code de cloud.hubera.id, ou -1 s’il n’est pas installé. N’efface rien.
  static Future<int> huberaIdVersionCode() async {
    if (!isSupported) return -1;
    try {
      return await _channel.invokeMethod<int>('idVersionCode') ?? -1;
    } on MissingPluginException {
      return -1;
    } on PlatformException {
      return -1;
    }
  }

  /// Ouvre cloud.hubera.id s’il est là. Ne télécharge rien tout seul.
  static Future<void> openHuberaIdInstall() async {
    if (!isSupported) return;
    try {
      await _channel.invokeMethod<void>('openIdInstall');
    } on MissingPluginException {
      // plugin absent
    }
  }
}
