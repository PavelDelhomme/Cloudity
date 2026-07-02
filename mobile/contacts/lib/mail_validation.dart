/// Validation légère des champs Mail (MVP mobile).
bool isValidRecipientEmail(String raw) {
  final to = raw.trim().toLowerCase();
  if (to.isEmpty || !to.contains('@')) return false;
  final parts = to.split('@');
  if (parts.length != 2) return false;
  final local = parts[0];
  final domain = parts[1];
  if (local.isEmpty || domain.isEmpty) return false;
  if (!domain.contains('.')) return false;
  return true;
}
