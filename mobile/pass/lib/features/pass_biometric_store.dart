import 'dart:convert';
import 'dart:typed_data';

import 'package:cloudity_shared/storage_keys.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'pass_crypto.dart';

/// Déverrouillage rapide Pass via biométrie / code appareil (après 1er unlock mot de passe).
///
/// La master key reste dans le secure enclave / Keystore de l'appareil, protégée
/// par authentification locale — cf. docs/produit/PASS-BACKUP.md § biométrie.
class PassBiometricStore {
  PassBiometricStore._();

  static const _secure = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  static final _auth = LocalAuthentication();

  static Future<bool> deviceSupportsBiometric() async {
    try {
      final supported = await _auth.isDeviceSupported();
      final canCheck = await _auth.canCheckBiometrics;
      return supported || canCheck;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> isEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(CloudityStorageKeys.biometricEnabled) ?? false;
  }

  static Future<void> disable() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(CloudityStorageKeys.biometricEnabled, false);
    await _secure.delete(key: CloudityStorageKeys.secureMkWrapped);
  }

  static String _profileKey(Argon2idParams profile) {
    if (identical(profile, Argon2idParams.desktop)) return 'desktop';
    if (identical(profile, Argon2idParams.mobileHigh)) return 'mobileHigh';
    return 'mobileLow';
  }

  static Argon2idParams _profileFromKey(String key) {
    switch (key) {
      case 'desktop':
        return Argon2idParams.desktop;
      case 'mobileHigh':
        return Argon2idParams.mobileHigh;
      default:
        return Argon2idParams.mobileLow;
    }
  }

  static Future<bool> enable({
    required Uint8List masterKey,
    required Argon2idParams profile,
  }) async {
    if (!await deviceSupportsBiometric()) return false;
    final ok = await _auth.authenticate(
      localizedReason:
          'Confirmez votre identité pour activer le déverrouillage biométrique Cloudity Pass.',
      options: const AuthenticationOptions(
        biometricOnly: false,
        stickyAuth: true,
      ),
    );
    if (!ok) return false;
    final payload = jsonEncode({
      'mk_b64': base64Encode(masterKey),
      'profile': _profileKey(profile),
    });
    await _secure.write(key: CloudityStorageKeys.secureMkWrapped, value: payload);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(CloudityStorageKeys.biometricEnabled, true);
    return true;
  }

  static Future<({Uint8List mk, Argon2idParams profile})?> tryUnlock() async {
    if (!await isEnabled()) return null;
    final ok = await _auth.authenticate(
      localizedReason:
          'Déverrouillez Cloudity Pass avec votre empreinte, votre visage ou le code de l’appareil.',
      options: const AuthenticationOptions(
        biometricOnly: false,
        stickyAuth: true,
      ),
    );
    if (!ok) return null;
    final raw = await _secure.read(key: CloudityStorageKeys.secureMkWrapped);
    if (raw == null || raw.isEmpty) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final mk = base64Decode(map['mk_b64'] as String);
      final profile = _profileFromKey(map['profile'] as String? ?? 'mobileLow');
      return (mk: Uint8List.fromList(mk), profile: profile);
    } catch (_) {
      return null;
    }
  }
}
