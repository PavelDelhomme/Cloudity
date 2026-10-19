import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:flutter/material.dart';

import 'hubera_account_order.dart';
import 'hubera_id_offer.dart';

class HuberaAccountChoice {
  const HuberaAccountChoice.use(this.account) : addNew = false;
  const HuberaAccountChoice.add() : account = null, addNew = true;

  final CloudityAuthAccount? account;
  final bool addNew;
}

/// Demande d’ouvrir le sélecteur sans effacer les comptes déjà enregistrés.
class HuberaAccountSwitch {
  HuberaAccountSwitch._();

  static bool openChooser = false;
  static final List<VoidCallback> _listeners = [];

  static void listen(VoidCallback listener) {
    _listeners.add(listener);
  }

  static void unlisten(VoidCallback listener) {
    _listeners.remove(listener);
  }

  static void requestChooser() {
    openChooser = true;
    for (final listener in List<VoidCallback>.of(_listeners)) {
      listener();
    }
  }

  static void closeChooser() {
    if (!openChooser) return;
    openChooser = false;
    for (final listener in List<VoidCallback>.of(_listeners)) {
      listener();
    }
  }
}

const _avatarPalette = <Color>[
  Color(0xFF1A73E8),
  Color(0xFF188038),
  Color(0xFFE37400),
  Color(0xFF9334E6),
  Color(0xFF007B83),
  Color(0xFFC5221F),
  Color(0xFF1967D2),
  Color(0xFF0D7377),
];

String huberaAccountTitle(String email, [String? displayName]) {
  final name = displayName?.trim() ?? '';
  final mail = email.trim();
  if (name.isNotEmpty && name.toLowerCase() != mail.toLowerCase()) return name;
  final local = mail.split('@').first.trim();
  if (local.isEmpty) return mail;
  return local[0].toUpperCase() + local.substring(1);
}

String huberaAccountInitial(String email, [String? displayName]) {
  final title = huberaAccountTitle(email, displayName);
  final source = title.trim().isEmpty ? email.trim() : title.trim();
  if (source.isEmpty) return '?';
  return source[0].toUpperCase();
}

Color huberaAvatarColor(String email) {
  var hash = 0;
  for (final code in email.toLowerCase().codeUnits) {
    hash = (hash * 31 + code) & 0x7fffffff;
  }
  return _avatarPalette[hash % _avatarPalette.length];
}

/// Ligne de compte : pastille, nom, adresse. Même dessin dans toutes les apps.
class HuberaAccountLine extends StatelessWidget {
  const HuberaAccountLine({
    super.key,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.letter,
    this.colorKey,
    this.add = false,
    this.checked = false,
    this.icon,
  });

  final String title;
  final String? subtitle;
  final String? letter;
  final String? colorKey;
  final bool add;
  final bool checked;
  final IconData? icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final onSurface = dark ? const Color(0xFFE8EAED) : const Color(0xFF202124);
    final muted = dark ? const Color(0xFF9AA0A6) : const Color(0xFF5F6368);
    final sub = subtitle?.trim();
    final showSub = sub != null && sub.isNotEmpty && sub.toLowerCase() != title.trim().toLowerCase();
    final mark = letter ?? (title.trim().isEmpty ? '?' : title.trim()[0].toUpperCase());
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 64),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _Avatar(
                  add: add || icon != null,
                  letter: mark,
                  colorKey: colorKey ?? title,
                  icon: icon ?? (add ? Icons.person_add_alt_1 : null),
                  onSurface: onSurface,
                  muted: muted,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          color: onSurface,
                          height: 1.2,
                        ),
                      ),
                      if (showSub)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            sub,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14, color: muted, height: 1.2),
                          ),
                        ),
                    ],
                  ),
                ),
                if (checked) Icon(Icons.check, color: muted, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.add,
    required this.letter,
    required this.colorKey,
    required this.onSurface,
    required this.muted,
    this.icon,
  });

  final bool add;
  final String letter;
  final String colorKey;
  final Color onSurface;
  final Color muted;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    if (add) {
      return Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: muted, width: 1),
        ),
        child: Icon(icon ?? Icons.person_add_alt_1, size: 20, color: onSurface),
      );
    }
    return CircleAvatar(
      radius: 20,
      backgroundColor: huberaAvatarColor(colorKey),
      child: Text(
        letter,
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 16),
      ),
    );
  }
}

/// Sélecteur : liste, choix, ajout. Le compte de l’appareil reste en tête.
Future<HuberaAccountChoice?> promptHuberaAccount(
  BuildContext context,
  List<CloudityAuthAccount> accounts, {
  required bool idInstalled,
  bool idTooOld = false,
  String? activeEmail,
  String? deviceEmail,
  bool prominent = false,
  bool barrierDismissible = false,
}) {
  final ordered = placeHuberaAccountFirst(
    accounts,
    deviceEmail,
    (account) => account.email,
  );
  final active = activeEmail?.trim().toLowerCase() ?? '';
  final pad = MediaQuery.viewPaddingOf(context);
  return showDialog<HuberaAccountChoice>(
    context: context,
    barrierDismissible: barrierDismissible,
    builder: (ctx) {
      final dark = Theme.of(ctx).brightness == Brightness.dark;
      final surface = dark ? const Color(0xFF2D2E30) : Colors.white;
      final onSurface = dark ? const Color(0xFFE8EAED) : const Color(0xFF202124);
      final line = dark ? const Color(0xFF3C4043) : const Color(0xFFE8EAED);
      final maxH = MediaQuery.sizeOf(ctx).height - pad.top - pad.bottom - 48;
      return Theme(
        data: Theme.of(ctx).copyWith(
          brightness: dark ? Brightness.dark : Brightness.light,
        ),
        child: Dialog(
        backgroundColor: surface,
        elevation: 6,
        insetPadding: EdgeInsets.fromLTRB(
          24 + pad.left,
          24 + pad.top,
          24 + pad.right,
          24 + pad.bottom,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: 400, maxHeight: maxH.clamp(220, 640)),
          child: SingleChildScrollView(
            padding: const EdgeInsets.only(top: 8, bottom: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
                  child: Text(
                    'Choisir un compte',
                    style: TextStyle(
                      fontSize: prominent ? 24 : 22,
                      fontWeight: prominent ? FontWeight.w600 : FontWeight.w400,
                      color: onSurface,
                    ),
                  ),
                ),
                for (final acc in ordered)
                  HuberaAccountLine(
                    title: huberaAccountTitle(acc.email),
                    subtitle: acc.email,
                    letter: huberaAccountInitial(acc.email),
                    colorKey: acc.email,
                    checked: active.isNotEmpty && acc.email.trim().toLowerCase() == active,
                    onTap: () => Navigator.pop(ctx, HuberaAccountChoice.use(acc)),
                  ),
                Divider(height: 1, thickness: 1, color: line),
                HuberaAccountLine(
                  add: true,
                  title: 'Ajouter un compte',
                  onTap: () => Navigator.pop(ctx, const HuberaAccountChoice.add()),
                ),
                if (!idInstalled || idTooOld)
                  HuberaAccountLine(
                    title: 'Installer Hubera ID',
                    subtitle: 'Application officielle, proposée. Rien ne s’installe tout seul.',
                    icon: Icons.download_outlined,
                    onTap: () {
                      offerOfficialHuberaIdApk(userAccepted: true);
                    },
                  ),
              ],
            ),
          ),
        ),
        ),
      );
    },
  );
}
