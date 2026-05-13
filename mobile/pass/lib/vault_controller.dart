import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'pass_crypto.dart';

/// État de verrouillage du coffre.
enum VaultLockState { locked, unlocking, unlocked }

/// Auto-lock après inactivité (5 min) — aligné sur `vaultContext.tsx` (web).
const Duration kAutoLockAfter = Duration(minutes: 5);

/// Contrôleur central du coffre Pass : détient la master key en mémoire,
/// gère l'unlock (Argon2id), l'auto-lock par inactivité et le passage
/// background → foreground qui re-verrouille systématiquement.
///
/// **Sécurité (cf. PASS-CRYPTO § 1)** :
///  - La MK ne quitte JAMAIS la mémoire Dart.
///  - À chaque `lock()`, on `zeroize` le buffer (best-effort GC Dart).
///  - À chaque `AppLifecycleState.paused/inactive`, on lock immédiatement
///    (politique stricte v0.1 — re-déverrouillage rapide via biométrie en L2).
class VaultController extends ChangeNotifier with WidgetsBindingObserver {
  VaultController() {
    WidgetsBinding.instance.addObserver(this);
  }

  VaultLockState _state = VaultLockState.locked;
  Uint8List? _masterKey;
  Argon2idParams? _profile;
  String? _unlockError;
  Timer? _idleTimer;
  DateTime _lastActivity = DateTime.now();

  VaultLockState get state => _state;
  bool get isUnlocked => _state == VaultLockState.unlocked;
  bool get isUnlocking => _state == VaultLockState.unlocking;
  String? get unlockError => _unlockError;
  Argon2idParams? get profile => _profile;

  /// Accès **direct** à la master key — à utiliser uniquement par le code de
  /// décryptage. Lance si verrouillé.
  Uint8List get masterKey {
    final mk = _masterKey;
    if (mk == null) {
      throw StateError('Vault verrouillé — appelez unlock() avant');
    }
    return mk;
  }

  /// Tente le déverrouillage avec le mot de passe maître.
  ///
  /// `userId` = identifiant utilisateur (string ou int) — utilisé pour
  /// dériver le salt déterministe `SHA-256("cloudity-pass:v1:user-salt:" + userId)[:16]`.
  ///
  /// `params` = profil Argon2id à utiliser (par défaut `mobileLow`).
  /// **Doit correspondre** au profil ayant servi côté web pour chiffrer les
  /// items, sinon la MK ne déchiffrera rien (pour le sprint 2026-05 on accepte
  /// que l'utilisateur retape `desktop` profile s'il a chiffré côté desktop ;
  /// l'écran d'unlock affichera "désynchronisation MK" à l'échec d'un test).
  Future<void> unlock({
    required String masterPassword,
    required String userId,
    Argon2idParams params = Argon2idParams.mobileLow,
  }) async {
    if (_state == VaultLockState.unlocking) return;
    _state = VaultLockState.unlocking;
    _unlockError = null;
    notifyListeners();
    try {
      final salt = await deriveUserSaltDeterministic(userId);
      final mk = await deriveMasterKey(
        password: masterPassword,
        saltUser: salt,
        params: params,
      );
      _masterKey = mk;
      _profile = params;
      _lastActivity = DateTime.now();
      _state = VaultLockState.unlocked;
      _scheduleIdleCheck();
    } catch (e) {
      _state = VaultLockState.locked;
      _unlockError = 'Déverrouillage impossible : $e';
    } finally {
      notifyListeners();
    }
  }

  /// Verrouille immédiatement (efface la MK, annule le timer).
  void lock() {
    if (_masterKey != null) zeroize(_masterKey!);
    _masterKey = null;
    _profile = null;
    _idleTimer?.cancel();
    _idleTimer = null;
    if (_state != VaultLockState.locked) {
      _state = VaultLockState.locked;
      notifyListeners();
    }
  }

  /// Notifie une activité utilisateur — reset du timer auto-lock.
  void bumpActivity() {
    _lastActivity = DateTime.now();
  }

  void _scheduleIdleCheck() {
    _idleTimer?.cancel();
    _idleTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      final idle = DateTime.now().difference(_lastActivity);
      if (idle >= kAutoLockAfter) {
        lock();
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    // Politique stricte v0.1 : tout passage en arrière-plan re-verrouille.
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.detached) {
      lock();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    lock();
    super.dispose();
  }

  // Test helper — ne JAMAIS l'appeler depuis l'app.
  @visibleForTesting
  void debugForceUnlocked(Uint8List mk) {
    _masterKey = Uint8List.fromList(mk);
    _state = VaultLockState.unlocked;
    notifyListeners();
  }
}
