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
  });

  final String email;
  final String gatewayUrl;
  final String accessToken;
  final String refreshToken;
  final int tenantId;
  final String? sourcePackage;

  factory CloudityAuthAccount.fromMap(Map<dynamic, dynamic> m) {
    return CloudityAuthAccount(
      email: '${m['email'] ?? ''}',
      gatewayUrl: '${m['gateway_url'] ?? ''}',
      accessToken: '${m['access_token'] ?? ''}',
      refreshToken: '${m['refresh_token'] ?? ''}',
      tenantId: (m['tenant_id'] as num?)?.toInt() ?? 1,
      sourcePackage: m['source_package'] as String?,
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

/// Partage gateway + jetons entre Photos, Drive, Mail (Android, signature identique).
class CloudityAuthBroker {
  CloudityAuthBroker._();

  static const _channel = MethodChannel('cloudity_auth_broker');

  static bool get isSupported => Platform.isAndroid;

  static Future<List<CloudityAuthAccount>> listAccounts() async {
    if (!isSupported) return [];
    final raw = await _channel.invokeMethod<List<dynamic>>('listAccounts');
    if (raw == null) return [];
    return raw
        .map((e) => CloudityAuthAccount.fromMap(Map<dynamic, dynamic>.from(e as Map)))
        .where((a) => a.email.isNotEmpty && a.refreshToken.isNotEmpty)
        .toList();
  }

  static Future<void> saveSession(CloudityAuthAccount account) async {
    if (!isSupported) return;
    await _channel.invokeMethod<void>('saveSession', account.toMap());
  }

  static Future<void> clearAccount(String email) async {
    if (!isSupported) return;
    await _channel.invokeMethod<void>('clearAccount', {'email': email});
  }
}
