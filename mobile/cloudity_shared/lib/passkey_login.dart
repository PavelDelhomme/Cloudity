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
    this.rawTokens,
  });

  final String accessToken;
  final String refreshToken;
  final String? role;
  final String? email;
  final String? userId;
  final Map<String, dynamic>? rawTokens;
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

  Future<PasskeyLoginResult?> loginDiscoverable() async {
    final client = CloudityWebAuthnClient(gatewayBase);
    final begin = await client.beginDiscoverableLogin();
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
      tenantId: '1', // compat prod mono-tenant ; omis une fois auth-service redéployé
      challengeB64u: challenge,
      assertion: response.toJson(),
    );
    return PasskeyLoginResult(
      accessToken: (tokens['access_token'] as String?) ?? '',
      refreshToken: (tokens['refresh_token'] as String?) ?? '',
      role: tokens['role'] as String?,
      email: tokens['email'] as String?,
      userId: tokens['user_id']?.toString(),
      rawTokens: tokens,
    );
  }

  /// Enregistre une passkey discoverable (empreinte / PIN) pour l'utilisateur connecté.
  Future<String?> registerPasskey({
    required String accessToken,
    String nickname = 'Téléphone',
  }) async {
    final client = CloudityWebAuthnClient(gatewayBase);
    final begin = await client.beginRegister(accessToken);
    final publicKey = begin['publicKey'];
    final opts = publicKey is Map<String, dynamic>
        ? Map<String, dynamic>.from(publicKey)
        : Map<String, dynamic>.from(begin);
    final request = RegisterRequestType.fromJson(opts);
    RegisterResponseType response;
    try {
      response = await _authenticator.register(request);
    } on PasskeyAuthCancelledException {
      return null;
    }
    final attestation = Map<String, dynamic>.from(response.toJson());
    attestation['type'] = 'public-key';
    final result = await client.finishRegister(
      accessToken: accessToken,
      attestation: attestation,
      nickname: nickname,
    );
    return result['credential_id'] as String?;
  }
}

/// Bouton réutilisable « Se connecter avec une passkey ».
class CloudityPasskeyLoginButton extends StatefulWidget {
  const CloudityPasskeyLoginButton({
    super.key,
    required this.gatewayBase,
    required this.onSuccess,
    this.busy = false,
    this.onBusyChanged,
  });

  final String gatewayBase;
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
      ).loginDiscoverable();
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
    final cs = Theme.of(context).colorScheme;
    return OutlinedButton.icon(
      onPressed: widget.busy ? null : _login,
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 14),
        side: BorderSide(color: cs.primary.withValues(alpha: 0.55)),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      icon: Icon(Icons.fingerprint, color: cs.primary),
      label: Text(
        'Connexion empreinte / passkey',
        style: TextStyle(fontWeight: FontWeight.w600, color: cs.primary),
      ),
    );
  }
}
