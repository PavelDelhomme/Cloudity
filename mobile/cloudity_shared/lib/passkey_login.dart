import 'package:flutter/material.dart';
import 'package:passkeys/authenticator.dart';
import 'package:passkeys/types.dart';

import 'webauthn_client.dart';

class PasskeyLoginResult {
  const PasskeyLoginResult({
    required this.accessToken,
    required this.refreshToken,
    this.role,
    this.email,
    this.userId,
  });

  final String accessToken;
  final String refreshToken;
  final String? role;
  final String? email;
  final String? userId;
}

/// Connexion discoverable via Credential Manager / passkeys natives.
class CloudityPasskeyLogin {
  CloudityPasskeyLogin(this.gatewayBase);

  final String gatewayBase;
  final _authenticator = PasskeyAuthenticator();

  Future<bool> isSupported() async {
    try {
      final availability = _authenticator.getAvailability();
      final android = await availability.android();
      return android.hasPasskeySupport;
    } catch (_) {
      return false;
    }
  }

  Future<PasskeyLoginResult?> loginDiscoverable({
    String tenantId = '1',
  }) async {
    final client = CloudityWebAuthnClient(gatewayBase);
    final begin = await client.beginDiscoverableLogin(tenantId: tenantId);
    final options = begin['options'];
    if (options is! Map<String, dynamic>) {
      throw CloudityWebAuthnException('options manquantes');
    }
    final publicKey = options['publicKey'];
    final requestJson = publicKey is Map<String, dynamic> ? publicKey : options;
    final request = AuthenticateRequestType.fromJson(
      Map<String, dynamic>.from(requestJson),
      mediation: MediationType.Required,
      preferImmediatelyAvailableCredentials: true,
    );
    final challenge = request.challenge;
    AuthenticateResponseType response;
    try {
      response = await _authenticator.authenticate(request);
    } on PasskeyAuthCancelledException {
      return null;
    } on NoCredentialsAvailableException {
      return null;
    }
    final tokens = await client.finishDiscoverableLogin(
      tenantId: tenantId,
      challengeB64u: challenge,
      assertion: response.toJson(),
    );
    return PasskeyLoginResult(
      accessToken: (tokens['access_token'] as String?) ?? '',
      refreshToken: (tokens['refresh_token'] as String?) ?? '',
      role: tokens['role'] as String?,
      email: tokens['email'] as String?,
      userId: tokens['user_id']?.toString(),
    );
  }
}

/// Bouton réutilisable « Se connecter avec une passkey ».
class CloudityPasskeyLoginButton extends StatefulWidget {
  const CloudityPasskeyLoginButton({
    super.key,
    required this.gatewayBase,
    required this.onSuccess,
    this.tenantId = '1',
    this.busy = false,
    this.onBusyChanged,
  });

  final String gatewayBase;
  final String tenantId;
  final bool busy;
  final ValueChanged<bool>? onBusyChanged;
  final void Function(PasskeyLoginResult result) onSuccess;

  @override
  State<CloudityPasskeyLoginButton> createState() =>
      _CloudityPasskeyLoginButtonState();
}

class _CloudityPasskeyLoginButtonState extends State<CloudityPasskeyLoginButton> {
  bool _supported = false;

  @override
  void initState() {
    super.initState();
    CloudityPasskeyLogin(widget.gatewayBase).isSupported().then((ok) {
      if (mounted) setState(() => _supported = ok);
    });
  }

  Future<void> _login() async {
    if (widget.busy) return;
    widget.onBusyChanged?.call(true);
    try {
      final result = await CloudityPasskeyLogin(
        widget.gatewayBase,
      ).loginDiscoverable(tenantId: widget.tenantId);
      if (result != null && result.accessToken.isNotEmpty) {
        widget.onSuccess(result);
      }
    } on CloudityWebAuthnException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      widget.onBusyChanged?.call(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_supported) return const SizedBox.shrink();
    return OutlinedButton.icon(
      onPressed: widget.busy ? null : _login,
      icon: const Icon(Icons.key_outlined),
      label: const Text('Se connecter avec une passkey'),
    );
  }
}
