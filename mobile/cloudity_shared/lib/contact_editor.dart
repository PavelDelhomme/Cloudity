import 'package:flutter/material.dart';

import 'contact_card.dart';
import 'contact_directory.dart';
import 'device_google_contacts.dart';
import 'suite_product_api.dart';

/// Création et modification : les mêmes champs que la fiche, en plein écran.
class ContactEditorScreen extends StatefulWidget {
  const ContactEditorScreen({
    super.key,
    required this.api,
    this.existing,
    this.directory,
    this.accessGranted,
    this.requestAccessOnce,
    this.insertOnDevice,
    this.onDeviceCopyRefused,
  });

  final SuiteProductApi api;
  final Map<String, dynamic>? existing;

  /// `personal` ou `professional`. Absent : le profil n’est pas étiqueté (comportement actuel).
  final String? directory;

  /// Défaut : lecture Android déjà accordée, sans dialogue.
  final Future<bool> Function()? accessGranted;

  /// Défaut : une demande système, sautée si l’autorisation est déjà là.
  final Future<bool> Function()? requestAccessOnce;

  /// Défaut : copie dans le carnet du téléphone. `null` en test pour ne pas écrire.
  final Future<DeviceWriteResult> Function({
    required String name,
    String phone,
    String email,
  })? insertOnDevice;

  /// Appelé seulement si la copie téléphone a été refusée. Absent : pas de message inventé.
  final void Function(String reason)? onDeviceCopyRefused;

  @override
  State<ContactEditorScreen> createState() => _ContactEditorScreenState();
}

class _FieldRow {
  _FieldRow({required this.label, String value = ''})
      : controller = TextEditingController(text: value);

  String label;
  final TextEditingController controller;

  void dispose() => controller.dispose();
}

class _ContactEditorScreenState extends State<ContactEditorScreen> {
  late final TextEditingController _name;
  late final TextEditingController _org;
  late final TextEditingController _job;
  late final TextEditingController _department;
  late final TextEditingController _street;
  late final TextEditingController _postal;
  late final TextEditingController _city;
  late final TextEditingController _notes;
  late final List<_FieldRow> _phones;
  late final List<_FieldRow> _emails;
  late String _addressLabel;
  String _birthday = '';
  bool _busy = false;
  String? _error;
  Map<String, dynamic> _profile = {};

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    final card = existing == null
        ? const ContactCardData(
            name: '',
            organization: '',
            jobTitle: '',
            department: '',
            phones: [],
            emails: [],
            street: '',
            postalCode: '',
            city: '',
            addressLabel: '',
            birthday: '',
            notes: '',
            addressLine: '',
          )
        : ContactCardData.fromItem(existing);
    final rawProfile = existing?['profile'];
    if (rawProfile is Map) _profile = Map<String, dynamic>.from(rawProfile);

    _name = TextEditingController(text: card.name);
    _org = TextEditingController(text: card.organization);
    _job = TextEditingController(text: card.jobTitle);
    _department = TextEditingController(text: card.department);
    _street = TextEditingController(text: card.street);
    _postal = TextEditingController(text: card.postalCode);
    _city = TextEditingController(text: card.city);
    _notes = TextEditingController(text: card.notes);
    _addressLabel = card.addressLabel.isEmpty ? 'home' : card.addressLabel;
    _birthday = card.birthday;
    _phones = [
      for (final p in card.phones)
        _FieldRow(label: p.label.isEmpty ? 'mobile' : p.label, value: p.value),
      if (card.phones.isEmpty) _FieldRow(label: 'mobile'),
    ];
    _emails = [
      for (final e in card.emails)
        _FieldRow(label: e.label.isEmpty ? 'personal' : e.label, value: e.value),
      if (card.emails.isEmpty) _FieldRow(label: 'personal'),
    ];
    _name.addListener(_refreshName);
  }

  void _refreshName() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _name.removeListener(_refreshName);
    _name.dispose();
    _org.dispose();
    _job.dispose();
    _department.dispose();
    _street.dispose();
    _postal.dispose();
    _city.dispose();
    _notes.dispose();
    for (final row in _phones) {
      row.dispose();
    }
    for (final row in _emails) {
      row.dispose();
    }
    super.dispose();
  }

  Future<void> _pickBirthday() async {
    final initial = DateTime.tryParse(_birthday) ?? DateTime(1990, 1, 1);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1900),
      lastDate: DateTime(2100),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _birthday =
          '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    final phones = [
      for (final row in _phones)
        if (row.controller.text.trim().isNotEmpty)
          LabeledValue(label: row.label, value: row.controller.text.trim()),
    ];
    final emails = [
      for (final row in _emails)
        if (row.controller.text.trim().contains('@'))
          LabeledValue(label: row.label, value: row.controller.text.trim()),
    ];
    if (name.isEmpty && phones.isEmpty && emails.isEmpty) {
      setState(() => _error = 'Nom, e-mail ou téléphone requis');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final profile = Map<String, dynamic>.from(_profile);
      void put(String key, String value) {
        if (value.isEmpty) {
          profile.remove(key);
        } else {
          profile[key] = value;
        }
      }

      put('organization', _org.text.trim());
      put('job_title', _job.text.trim());
      put('department', _department.text.trim());
      put('birthday', _birthday.trim());
      put('notes', _notes.text.trim());
      final parts = name.split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toList();
      if (parts.isEmpty) {
        profile.remove('given_name');
        profile.remove('family_name');
      } else {
        profile['given_name'] = parts.first;
        profile['family_name'] = parts.length == 1 ? '' : parts.sublist(1).join(' ');
        if ((profile['family_name'] as String).isEmpty) profile.remove('family_name');
      }
      if (phones.isEmpty) {
        profile.remove('phones');
      } else {
        profile['phones'] = [
          for (final p in phones) {'label': p.label, 'value': p.value},
        ];
      }
      if (emails.isEmpty) {
        profile.remove('emails');
      } else {
        profile['emails'] = [
          for (final e in emails) {'label': e.label, 'value': e.value},
        ];
      }
      final street = _street.text.trim();
      final postal = _postal.text.trim();
      final city = _city.text.trim();
      if (street.isEmpty && postal.isEmpty && city.isEmpty) {
        profile.remove('addresses');
      } else {
        profile['addresses'] = [
          {
            'label': _addressLabel,
            if (street.isNotEmpty) 'street': street,
            if (postal.isNotEmpty) 'postal_code': postal,
            if (city.isNotEmpty) 'city': city,
          },
        ];
      }
      final display = name.isNotEmpty
          ? name
          : (emails.isNotEmpty ? emails.first.value : phones.first.value);
      final phone = phones.isEmpty ? '' : phones.first.value;
      final email = emails.isEmpty ? '' : emails.first.value;
      final id = widget.existing == null ? null : contactItemId(widget.existing!);
      if (id == null) {
        final directory = widget.directory;
        if (directory == 'personal' || directory == 'professional') {
          final extra = profile['extra'] is Map
              ? Map<String, dynamic>.from(profile['extra'] as Map)
              : <String, dynamic>{};
          extra['directory'] = directory;
          profile['extra'] = extra;
        }
        final ready = await (widget.accessGranted ?? DeviceGoogleContacts.accessGranted)();
        var step = contactCreatePermission(alreadyGranted: ready);
        if (step == ContactCreatePermission.askOnce) {
          final asked =
              await (widget.requestAccessOnce ?? DeviceGoogleContacts.requestAccessOnce)();
          step = contactCreatePermission(alreadyGranted: false, asked: asked);
        }
        if (step != ContactCreatePermission.proceed) {
          if (!mounted) return;
          setState(() {
            _busy = false;
            _error = 'Autorisation refusée. Le contact n’a pas été créé.';
          });
          return;
        }
        await widget.api.createContact(
          name: display,
          email: email,
          phone: phone,
          profile: profile,
        );
        final insert = widget.insertOnDevice ?? DeviceGoogleContacts.insertContact;
        final wrote = await insert(name: display, phone: phone, email: email);
        if (!wrote.ok) {
          widget.onDeviceCopyRefused?.call(
            wrote.reason.isEmpty
                ? 'Le téléphone n’a pas enregistré la copie du contact.'
                : wrote.reason,
          );
        }
      } else {
        await widget.api.updateContact(
          id: id,
          name: display,
          email: email,
          phone: phone,
          profile: profile,
        );
      }
      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Enregistrement impossible';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final creating = widget.existing == null;
    final bottom = 32 + MediaQuery.viewPaddingOf(context).bottom;
    final title = _name.text.trim();

    return Scaffold(
      backgroundColor: scheme.surface,
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          tooltip: 'Annuler',
          onPressed: _busy ? null : () => Navigator.pop(context, false),
          icon: const Icon(Icons.close),
        ),
        title: Text(creating ? 'Nouveau contact' : 'Modifier'),
        actions: [
          TextButton(
            onPressed: _busy ? null : _save,
            child: Text(_busy ? '…' : 'Enregistrer'),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: EdgeInsets.fromLTRB(8, 8, 8, bottom),
          children: [
            Center(child: _EditorAvatar(name: title)),
            TextField(
              key: const Key('contact_editor_name'),
              controller: _name,
              textAlign: TextAlign.center,
              textCapitalization: TextCapitalization.words,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: scheme.onSurface,
              ),
              cursorColor: scheme.primary,
              decoration: InputDecoration(
                hintText: 'Nom',
                hintStyle: theme.textTheme.headlineSmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
              ),
            ),
            _plainField(_org, 'Organisation', center: true),
            _plainField(_job, 'Poste', center: true),
            _plainField(_department, 'Service', center: true),
            const SizedBox(height: 8),
            for (final row in _phones)
              _labeledField(
                row: row,
                icon: Icons.call_outlined,
                hint: 'Téléphone',
                keyboard: TextInputType.phone,
                choices: kPhoneLabelIds,
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => setState(() => _phones.add(_FieldRow(label: 'mobile'))),
                child: const Text('Ajouter un numéro'),
              ),
            ),
            for (final row in _emails)
              _labeledField(
                row: row,
                icon: Icons.mail_outlined,
                hint: 'E-mail',
                keyboard: TextInputType.emailAddress,
                choices: kEmailLabelIds,
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => setState(() => _emails.add(_FieldRow(label: 'personal'))),
                child: const Text('Ajouter un e-mail'),
              ),
            ),
            _addressBlock(scheme),
            ListTile(
              leading: Icon(Icons.cake_outlined, color: scheme.onSurfaceVariant),
              title: Text(
                _birthday.isEmpty ? 'Anniversaire' : formatContactBirthday(_birthday),
                style: TextStyle(
                  color: _birthday.isEmpty ? scheme.onSurfaceVariant : scheme.onSurface,
                ),
              ),
              subtitle: _birthday.isEmpty
                  ? null
                  : Text('Anniversaire', style: TextStyle(color: scheme.onSurfaceVariant)),
              onTap: _pickBirthday,
            ),
            ListTile(
              leading: Icon(Icons.notes_outlined, color: scheme.onSurfaceVariant),
              title: TextField(
                controller: _notes,
                minLines: 1,
                maxLines: 4,
                style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurface),
                decoration: InputDecoration(
                  hintText: 'Notes',
                  hintStyle: TextStyle(color: scheme.onSurfaceVariant),
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Text(_error!, style: TextStyle(color: scheme.error)),
              ),
          ],
        ),
      ),
    );
  }

  Widget _plainField(TextEditingController controller, String hint, {bool center = false}) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return TextField(
      controller: controller,
      textAlign: center ? TextAlign.center : TextAlign.start,
      textCapitalization: TextCapitalization.words,
      style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurface),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: scheme.onSurfaceVariant),
        border: InputBorder.none,
        isDense: true,
      ),
    );
  }

  Widget _labeledField({
    required _FieldRow row,
    required IconData icon,
    required String hint,
    required TextInputType keyboard,
    required List<String> choices,
  }) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final label = contactLabelFr(row.label);
    return ListTile(
      leading: Icon(icon, color: scheme.onSurfaceVariant),
      title: TextField(
        controller: row.controller,
        keyboardType: keyboard,
        style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurface),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(color: scheme.onSurfaceVariant),
          border: InputBorder.none,
          isDense: true,
          contentPadding: EdgeInsets.zero,
        ),
      ),
      subtitle: PopupMenuButton<String>(
        initialValue: row.label,
        onSelected: (value) => setState(() => row.label = value),
        itemBuilder: (ctx) => [
          for (final id in choices)
            PopupMenuItem(value: id, child: Text(contactLabelFr(id))),
        ],
        child: Text(
          label.isEmpty ? 'Libellé' : label,
          style: theme.textTheme.labelMedium?.copyWith(color: scheme.primary),
        ),
      ),
    );
  }

  Widget _addressBlock(ColorScheme scheme) {
    final theme = Theme.of(context);
    return ListTile(
      leading: Icon(Icons.place_outlined, color: scheme.onSurfaceVariant),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _street,
            textCapitalization: TextCapitalization.words,
            style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurface),
            decoration: InputDecoration(
              hintText: 'Adresse',
              hintStyle: TextStyle(color: scheme.onSurfaceVariant),
              border: InputBorder.none,
              isDense: true,
              contentPadding: EdgeInsets.zero,
            ),
          ),
          Row(
            children: [
              SizedBox(
                width: 88,
                child: TextField(
                  controller: _postal,
                  keyboardType: TextInputType.number,
                  style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurface),
                  decoration: InputDecoration(
                    hintText: 'Code',
                    hintStyle: TextStyle(color: scheme.onSurfaceVariant),
                    border: InputBorder.none,
                    isDense: true,
                  ),
                ),
              ),
              Expanded(
                child: TextField(
                  controller: _city,
                  textCapitalization: TextCapitalization.words,
                  style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurface),
                  decoration: InputDecoration(
                    hintText: 'Ville',
                    hintStyle: TextStyle(color: scheme.onSurfaceVariant),
                    border: InputBorder.none,
                    isDense: true,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
      subtitle: Text(
        contactLabelFr(_addressLabel).isEmpty ? 'Adresse' : contactLabelFr(_addressLabel),
        style: theme.textTheme.labelMedium?.copyWith(color: scheme.onSurfaceVariant),
      ),
    );
  }
}

class _EditorAvatar extends StatelessWidget {
  const _EditorAvatar({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return CircleAvatar(
      radius: 56,
      backgroundColor: scheme.primaryContainer,
      foregroundColor: scheme.onPrimaryContainer,
      child: Text(
        contactInitials(name),
        style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              color: scheme.onPrimaryContainer,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }
}
