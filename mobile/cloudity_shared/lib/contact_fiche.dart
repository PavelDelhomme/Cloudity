import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'contact_card.dart';
import 'contact_editor.dart';
import 'contact_maps.dart';
import 'suite_product_api.dart';

/// Fiche contact : photo ou initiale, nom, actions, moyens de contact.
class ContactFicheScreen extends StatelessWidget {
  const ContactFicheScreen({
    super.key,
    required this.item,
    required this.api,
    required this.onChanged,
    this.readOnly = false,
  });

  final Map<String, dynamic> item;
  final SuiteProductApi api;
  final Future<void> Function() onChanged;
  final bool readOnly;

  ContactCardData get _card => ContactCardData.fromItem(item);

  Future<void> _launch(BuildContext context, String raw) async {
    final uri = Uri.tryParse(raw);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d’ouvrir le lien')),
      );
    }
  }

  Future<void> _openMaps(BuildContext context) async {
    final addr = _card.addressLine;
    if (addr.isEmpty) return;
    final native = Uri.parse(huberaMapsDeepLink(addr));
    if (await canLaunchUrl(native)) {
      await launchUrl(native, mode: LaunchMode.externalApplication);
      return;
    }
    await _launch(context, huberaMapsWebLink(addr));
  }

  Future<void> _edit(BuildContext context) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        fullscreenDialog: true,
        builder: (_) => ContactEditorScreen(api: api, existing: item),
      ),
    );
    if (saved != true) return;
    await onChanged();
    if (context.mounted) Navigator.pop(context, true);
  }

  Future<void> _delete(BuildContext context) async {
    final id = contactItemId(item);
    if (id == null) return;
    final name = _card.name.isEmpty ? 'ce contact' : _card.name;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Supprimer ?'),
        content: Text('Supprimer « $name » ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Supprimer')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await api.deleteContact(id);
      await onChanged();
      if (context.mounted) Navigator.pop(context, true);
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Suppression impossible')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final card = _card;
    final title = card.name.isEmpty ? 'Contact' : card.name;
    final phone = card.phones.isEmpty ? '' : card.phones.first.value;
    final email = card.emails.isEmpty ? '' : card.emails.first.value;
    final bottom = 24 + MediaQuery.viewPaddingOf(context).bottom;

    return Scaffold(
      backgroundColor: scheme.surface,
      appBar: AppBar(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        actions: [
          if (!readOnly)
            IconButton(
              tooltip: 'Modifier',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () => _edit(context),
            ),
          if (!readOnly)
            PopupMenuButton<String>(
              tooltip: 'Plus',
              onSelected: (value) {
                if (value == 'edit') _edit(context);
                if (value == 'delete') _delete(context);
              },
              itemBuilder: (ctx) => const [
                PopupMenuItem(value: 'edit', child: Text('Modifier')),
                PopupMenuItem(value: 'delete', child: Text('Supprimer')),
              ],
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: EdgeInsets.fromLTRB(0, 4, 0, bottom),
          children: [
            Center(child: _ContactAvatar(name: title, photoUrl: card.photoUrl, radius: 72)),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                title,
                key: const Key('contact_fiche_name'),
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: scheme.onSurface,
                ),
              ),
            ),
            if (card.orgLine.isNotEmpty) ...[
              const SizedBox(height: 4),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(
                  card.orgLine,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ),
            ],
            const SizedBox(height: 20),
            _ActionRow(
              phone: phone,
              email: email,
              address: card.addressLine,
              onCall: () => _launch(context, 'tel:$phone'),
              onSms: () => _launch(context, 'sms:$phone'),
              onMail: () => _launch(context, 'mailto:$email'),
              onMaps: () => _openMaps(context),
            ),
            const SizedBox(height: 12),
            for (final p in card.phones)
              _MethodTile(
                icon: Icons.call_outlined,
                value: p.value,
                label: contactLabelFr(p.label).isEmpty ? 'Téléphone' : contactLabelFr(p.label),
                onTap: () => _launch(context, 'tel:${p.value}'),
              ),
            for (final e in card.emails)
              _MethodTile(
                icon: Icons.mail_outlined,
                value: e.value,
                label: contactLabelFr(e.label).isEmpty ? 'E-mail' : contactLabelFr(e.label),
                onTap: () => _launch(context, 'mailto:${e.value}'),
              ),
            if (card.addressLine.isNotEmpty)
              _MethodTile(
                icon: Icons.place_outlined,
                value: card.addressLine,
                label: contactLabelFr(card.addressLabel).isEmpty
                    ? 'Adresse'
                    : contactLabelFr(card.addressLabel),
                onTap: () => _openMaps(context),
              ),
            if (card.birthday.isNotEmpty)
              _MethodTile(
                icon: Icons.cake_outlined,
                value: formatContactBirthday(card.birthday),
                label: 'Anniversaire',
              ),
            if (card.notes.isNotEmpty)
              _MethodTile(
                icon: Icons.notes_outlined,
                value: card.notes,
                label: 'Notes',
              ),
          ],
        ),
      ),
    );
  }
}

class _ContactAvatar extends StatelessWidget {
  const _ContactAvatar({required this.name, required this.radius, this.photoUrl});

  final String name;
  final double radius;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final photo = photoUrl;
    return CircleAvatar(
      radius: radius,
      backgroundColor: scheme.primaryContainer,
      foregroundColor: scheme.onPrimaryContainer,
      backgroundImage: photo == null ? null : NetworkImage(photo),
      child: photo == null
          ? Text(
              contactInitials(name),
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    color: scheme.onPrimaryContainer,
                    fontWeight: FontWeight.w600,
                  ),
            )
          : null,
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.phone,
    required this.email,
    required this.address,
    required this.onCall,
    required this.onSms,
    required this.onMail,
    required this.onMaps,
  });

  final String phone;
  final String email;
  final String address;
  final VoidCallback onCall;
  final VoidCallback onSms;
  final VoidCallback onMail;
  final VoidCallback onMaps;

  @override
  Widget build(BuildContext context) {
    final actions = <Widget>[
      if (phone.isNotEmpty) _RoundAction(icon: Icons.call_outlined, label: 'Appeler', onTap: onCall),
      if (phone.isNotEmpty) _RoundAction(icon: Icons.chat_outlined, label: 'Message', onTap: onSms),
      if (email.isNotEmpty) _RoundAction(icon: Icons.mail_outlined, label: 'E-mail', onTap: onMail),
      if (address.isNotEmpty) _RoundAction(icon: Icons.map_outlined, label: 'Itinéraire', onTap: onMaps),
    ];
    if (actions.isEmpty) return const SizedBox.shrink();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(children: actions),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        children: [
          FilledButton.tonal(
            onPressed: onTap,
            style: FilledButton.styleFrom(
              shape: const CircleBorder(),
              padding: const EdgeInsets.all(16),
              backgroundColor: scheme.secondaryContainer,
              foregroundColor: scheme.onSecondaryContainer,
            ),
            child: Icon(icon),
          ),
          const SizedBox(height: 6),
          Text(label, style: theme.textTheme.labelMedium?.copyWith(color: scheme.onSurface)),
        ],
      ),
    );
  }
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({
    required this.icon,
    required this.value,
    required this.label,
    this.onTap,
  });

  final IconData icon;
  final String value;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListTile(
      leading: Icon(icon, color: scheme.onSurfaceVariant),
      title: Text(value, style: TextStyle(color: scheme.onSurface)),
      subtitle: Text(label, style: TextStyle(color: scheme.onSurfaceVariant)),
      onTap: onTap,
    );
  }
}
