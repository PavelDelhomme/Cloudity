/// Reprise d’un compte déjà sur l’appareil, même règles que Hubera ID 0.1.10.
///
/// Un jeton ouvre la session. Sans jeton, l’écran de connexion reçoit
/// l’adresse connue. Le champ e-mail n’est pas le résultat d’un compte
/// qui a déjà une session.
enum DeviceAccountAction { open, password }

class DeviceAccountPlan {
  const DeviceAccountPlan({
    required this.action,
    required this.fillsEmailField,
  });

  final DeviceAccountAction action;
  final bool fillsEmailField;
}

DeviceAccountPlan planDeviceAccount({
  required String email,
  required String accessToken,
  required String refreshToken,
}) {
  final address = email.trim();
  final hasToken =
      accessToken.trim().isNotEmpty || refreshToken.trim().isNotEmpty;
  if (address.isEmpty || !hasToken) {
    return DeviceAccountPlan(
      action: DeviceAccountAction.password,
      fillsEmailField: address.isNotEmpty,
    );
  }
  return const DeviceAccountPlan(
    action: DeviceAccountAction.open,
    fillsEmailField: false,
  );
}
