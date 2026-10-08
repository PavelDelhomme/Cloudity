import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'contact_maps.dart';
import 'suite_product_api.dart';
import 'suite_product_editor.dart';
import 'suite_product_home.dart';

/// Fiche contact type Google Contacts : avatar, actions, adresse → Maps.
class ContactFicheScreen extends StatelessWidget {
  const ContactFicheScreen({
    super.key,
    required this.item,
    required this.api,
    required this.onChanged,
  });

  final Map<String, dynamic> item;
  final SuiteProductApi api;
  final Future<void> Function() onChanged;

  String get _name {
    final n = item['display_name']?.toString().trim();
    if (n != null && n.isNotEmpty) return n;
    final name = item['name']?.toString().trim();
    if (name != null && name.isNotEmpty) return name;
    return item['email']?.toString() ?? 'Contact';
  }

  String get _email {
    final e = item['email']?.toString().trim() ?? '';
    if (e == 'locked@vault.local') return '';
    return e;
  }

  String get _phone => item['phone']?.toString().trim() ?? '';

  Map<String, dynamic> get _profile {
    final p = item['profile'];
    return p is Map ? Map<String, dynamic>.from(p) : <String, dynamic>{};
  }

  String get _orgLine {
    final bits = [
      _profile['job_title']?.toString().trim(),
      _profile['organization']?.toString().trim(),
      _profile['department']?.toString().trim(),
    ].where((s) => s != null && s.isNotEmpty).toList();
    return bits.join(' · ');
  }

  String get _address => formatContactAddress(firstContactAddress(item));

  String get _initials {
    final parts = _name.split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    String first(String s) => s.isEmpty ? '' : s.substring(0, 1).toUpperCase();
    if (parts.length == 1) return first(parts.first);
    return '${first(parts.first)}${first(parts.last)}';
  }

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
    final addr = _address;
    if (addr.isEmpty) return;
    final native = Uri.parse(huberaMapsDeepLink(addr));
    if (await canLaunchUrl(native)) {
      await launchUrl(native, mode: LaunchMode.externalApplication);
      return;
    }
    await _launch(context, huberaMapsWebLink(addr));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final notes = _profile['notes']?.toString().trim() ?? '';
    return Scaffold(
      appBar: AppBar(
        title: const Text('Fiche'),
        actions: [
          IconButton(
            tooltip: 'Modifier',
            icon: const Icon(Icons.edit_outlined),
            onPressed: () async {
              final saved = await showSuiteProductEditor(
                context: context,
                product: SuiteProduct.contacts,
                api: api,
                existing: item,
              );
              if (saved) await onChanged();
              if (context.mounted) Navigator.pop(context, true);
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Center(
            child: CircleAvatar(
              radius: 44,
              backgroundColor: theme.colorScheme.primary,
              foregroundColor: theme.colorScheme.onPrimary,
              child: Text(_initials, style: theme.textTheme.headlineSmall),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            _name,
            textAlign: TextAlign.center,
            style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          if (_orgLine.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(_orgLine, textAlign: TextAlign.center, style: theme.textTheme.bodyMedium),
          ],
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              if (_phone.isNotEmpty)
                _ActionChip(
                  icon: Icons.call_outlined,
                  label: 'Appeler',
                  onTap: () => _launch(context, 'tel:$_phone'),
                ),
              if (_email.isNotEmpty)
                _ActionChip(
                  icon: Icons.mail_outlined,
                  label: 'E-mail',
                  onTap: () => _launch(context, 'mailto:$_email'),
                ),
              if (_address.isNotEmpty)
                _ActionChip(
                  icon: Icons.map_outlined,
                  label: 'Maps',
                  onTap: () => _openMaps(context),
                ),
            ],
          ),
          const SizedBox(height: 24),
          if (_phone.isNotEmpty)
            ListTile(
              leading: const Icon(Icons.phone_outlined),
              title: Text(_phone),
              subtitle: const Text('Téléphone'),
              onTap: () => _launch(context, 'tel:$_phone'),
            ),
          if (_email.isNotEmpty)
            ListTile(
              leading: const Icon(Icons.alternate_email),
              title: Text(_email),
              subtitle: const Text('E-mail'),
              onTap: () => _launch(context, 'mailto:$_email'),
            ),
          if (_address.isNotEmpty)
            ListTile(
              leading: const Icon(Icons.place_outlined),
              title: Text(_address),
              subtitle: const Text('Adresse · ouvrir dans Hubera Maps'),
              onTap: () => _openMaps(context),
            ),
          if (notes.isNotEmpty)
            ListTile(
              leading: const Icon(Icons.notes_outlined),
              title: Text(notes),
              subtitle: const Text('Notes'),
            ),
        ],
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        FilledButton.tonal(
          onPressed: onTap,
          style: FilledButton.styleFrom(shape: const CircleBorder(), padding: const EdgeInsets.all(16)),
          child: Icon(icon),
        ),
        const SizedBox(height: 6),
        Text(label, style: Theme.of(context).textTheme.labelMedium),
      ],
    );
  }
}
