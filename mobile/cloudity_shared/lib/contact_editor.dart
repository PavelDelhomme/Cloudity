import 'dart:async';

import 'package:flutter/material.dart';

import 'contact_address_search.dart';
import 'contact_card.dart';
import 'contact_directory.dart';
import 'device_google_contacts.dart';
import 'suite_product_api.dart';

/// Création et modification. Même logique que le formulaire Google Contacts
/// vu sur le téléphone : nom replié, puis prénom et nom, champs ajoutés à la demande.
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
    this.searchAddresses,
  });

  final SuiteProductApi api;
  final Map<String, dynamic>? existing;
  final String? directory;
  final Future<bool> Function()? accessGranted;
  final Future<bool> Function()? requestAccessOnce;
  final Future<DeviceWriteResult> Function({
    required String name,
    String phone,
    String email,
  })? insertOnDevice;
  final void Function(String reason)? onDeviceCopyRefused;

  /// Défaut : la recherche d’adresses de Hubera Maps (Photon, puis Nominatim).
  final Future<List<ContactAddressHit>> Function(String query)? searchAddresses;

  @override
  State<ContactEditorScreen> createState() => _ContactEditorScreenState();
}

class _FieldRow {
  _FieldRow({required this.label, String custom = '', String value = ''})
      : controller = TextEditingController(text: value),
        customController = TextEditingController(text: custom);

  String label;
  final TextEditingController controller;
  final TextEditingController customController;

  String get custom => customController.text;

  void dispose() {
    controller.dispose();
    customController.dispose();
  }
}

class _AddressRow {
  _AddressRow({
    this.label = 'home',
    String custom = '',
    String street = '',
    String postal = '',
    String city = '',
    String country = '',
  })  : customController = TextEditingController(text: custom),
        street = TextEditingController(text: street),
        postal = TextEditingController(text: postal),
        city = TextEditingController(text: city),
        country = TextEditingController(text: country);

  String get custom => customController.text;

  String label;
  final TextEditingController customController;
  final TextEditingController street;
  final TextEditingController postal;
  final TextEditingController city;
  final TextEditingController country;

  bool get isEmpty =>
      street.text.trim().isEmpty &&
      postal.text.trim().isEmpty &&
      city.text.trim().isEmpty &&
      country.text.trim().isEmpty;

  VoidCallback? onStreet;

  void dispose() {
    if (onStreet != null) street.removeListener(onStreet!);
    customController.dispose();
    street.dispose();
    postal.dispose();
    city.dispose();
    country.dispose();
  }
}

class _ContactEditorScreenState extends State<ContactEditorScreen> {
  late final TextEditingController _singleName;
  late final TextEditingController _prefix;
  late final TextEditingController _given;
  late final TextEditingController _middle;
  late final TextEditingController _family;
  late final TextEditingController _suffix;
  late final TextEditingController _phonetic;
  late final TextEditingController _nickname;
  late final TextEditingController _fileAs;
  late final TextEditingController _org;
  late final TextEditingController _job;
  late final TextEditingController _department;
  late final TextEditingController _relation;
  late final TextEditingController _website;
  late final TextEditingController _labels;
  late final TextEditingController _notes;
  late final List<_FieldRow> _phones;
  late final List<_FieldRow> _emails;
  late final List<_AddressRow> _addresses;
  late final List<_FieldRow> _customs;
  late bool _nameExpanded;
  late bool _showPrefix;
  late bool _showMiddle;
  late bool _showSuffix;
  late bool _showPhonetic;
  late bool _showNickname;
  late bool _showFileAs;
  late bool _showJob;
  late bool _showDepartment;
  late bool _showRelation;
  late bool _showWebsite;
  late bool _showLabels;
  late bool _showBirthday;
  String _birthday = '';
  bool _busy = false;
  String? _error;
  Map<String, dynamic> _profile = {};
  Timer? _addressTimer;
  int _addressGen = 0;
  int? _searchIndex;
  List<ContactAddressHit> _hits = const [];
  bool _suppressSearch = false;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    final card = existing == null ? null : ContactCardData.fromItem(existing);
    final rawProfile = existing?['profile'];
    if (rawProfile is Map) _profile = Map<String, dynamic>.from(rawProfile);
    final parts = card?.nameParts ?? const ContactNameParts();
    _singleName = TextEditingController(text: card?.name ?? '');
    _prefix = TextEditingController(text: parts.prefix);
    _given = TextEditingController(text: parts.given);
    _middle = TextEditingController(text: parts.middle);
    _family = TextEditingController(text: parts.family);
    _suffix = TextEditingController(text: parts.suffix);
    _phonetic = TextEditingController(text: card?.phonetic ?? '');
    _nickname = TextEditingController(text: card?.nickname ?? '');
    _fileAs = TextEditingController(text: card?.fileAs ?? '');
    _org = TextEditingController(text: card?.organization ?? '');
    _job = TextEditingController(text: card?.jobTitle ?? '');
    _department = TextEditingController(text: card?.department ?? '');
    _relation = TextEditingController(text: card?.relation ?? '');
    _website = TextEditingController(text: card?.website ?? '');
    _labels = TextEditingController(text: card?.labels ?? '');
    _notes = TextEditingController(text: card?.notes ?? '');
    _birthday = card?.birthday ?? '';
    _nameExpanded = existing != null && (card?.name.isNotEmpty ?? false);
    _showPrefix = parts.prefix.isNotEmpty;
    _showMiddle = parts.middle.isNotEmpty;
    _showSuffix = parts.suffix.isNotEmpty;
    _showPhonetic = (card?.phonetic ?? '').isNotEmpty;
    _showNickname = (card?.nickname ?? '').isNotEmpty;
    _showFileAs = (card?.fileAs ?? '').isNotEmpty;
    _showJob = (card?.jobTitle ?? '').isNotEmpty;
    _showDepartment = (card?.department ?? '').isNotEmpty;
    _showRelation = (card?.relation ?? '').isNotEmpty;
    _showWebsite = (card?.website ?? '').isNotEmpty;
    _showLabels = (card?.labels ?? '').isNotEmpty;
    _showBirthday = _birthday.isNotEmpty;
    _phones = [
      for (final p in card?.phones ?? const <LabeledValue>[])
        _storedRow(p.label, p.value, fallback: 'mobile', known: kPhoneLabelIds),
      if ((card?.phones ?? const []).isEmpty) _FieldRow(label: 'mobile'),
    ];
    _emails = [
      for (final e in card?.emails ?? const <LabeledValue>[])
        _storedRow(e.label, e.value, fallback: 'home', known: kEmailLabelIds),
    ];
    _addresses = [
      for (final a in card?.addresses ?? const <ContactAddress>[])
        _storedAddress(a),
    ];
    for (final row in _addresses) {
      _bindAddress(row);
    }
    _customs = [
      for (final c in card?.customFields ?? const <ContactCustomField>[])
        if (!c.isEmpty) _FieldRow(label: 'custom', custom: c.label, value: c.value),
    ];
    for (final c in [_singleName, _given, _family, _prefix, _middle, _suffix]) {
      c.addListener(_refresh);
    }
  }

  _FieldRow _storedRow(
    String label,
    String value, {
    required String fallback,
    required List<String> known,
  }) {
    final id = _canonicalLabel(label, known);
    if (id.isEmpty) return _FieldRow(label: fallback, value: value);
    if (id == 'custom') return _FieldRow(label: 'custom', value: value);
    if (!known.contains(id)) return _FieldRow(label: id, value: value);
    return _FieldRow(label: id, value: value);
  }

  _AddressRow _storedAddress(ContactAddress address) {
    final id = _canonicalLabel(address.label, kAddressLabelIds);
    return _AddressRow(
      label: id.isEmpty ? 'home' : id,
      custom: id == 'custom' ? address.label : '',
      street: address.street,
      postal: address.postalCode,
      city: address.city,
      country: address.country,
    );
  }

  String _canonicalLabel(String raw, List<String> known) {
    final id = raw.trim().toLowerCase();
    const alias = {
      'domicile': 'home',
      'bureau': 'work',
      'travail': 'work',
      'pro': 'work',
      'autre': 'other',
      'personnalisé': 'custom',
      'personnalise': 'custom',
      'principal': 'main',
      'fax travail': 'fax_work',
      'fax domicile': 'fax_home',
      'bipeur': 'pager',
    };
    final mapped = alias[id] ?? id;
    if (mapped.isEmpty) return '';
    if (known.contains(mapped)) return mapped;
    return raw.trim();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _addressTimer?.cancel();
    for (final c in [_singleName, _given, _family, _prefix, _middle, _suffix]) {
      c.removeListener(_refresh);
    }
    for (final c in [
      _singleName,
      _prefix,
      _given,
      _middle,
      _family,
      _suffix,
      _phonetic,
      _nickname,
      _fileAs,
      _org,
      _job,
      _department,
      _relation,
      _website,
      _labels,
      _notes,
    ]) {
      c.dispose();
    }
    for (final row in _phones) {
      row.dispose();
    }
    for (final row in _emails) {
      row.dispose();
    }
    for (final row in _addresses) {
      row.dispose();
    }
    for (final row in _customs) {
      row.dispose();
    }
    super.dispose();
  }

  ContactNameParts _parts() {
    if (_nameExpanded) {
      return ContactNameParts(
        prefix: _showPrefix ? _prefix.text.trim() : '',
        given: _given.text.trim(),
        middle: _showMiddle ? _middle.text.trim() : '',
        family: _family.text.trim(),
        suffix: _showSuffix ? _suffix.text.trim() : '',
      );
    }
    return readContactName({'display_name': _singleName.text.trim()});
  }

  String get _title {
    if (!_nameExpanded && _singleName.text.trim().isNotEmpty) {
      return _singleName.text.trim();
    }
    return _parts().display;
  }

  void _expandName() {
    if (_given.text.trim().isEmpty && _family.text.trim().isEmpty) {
      final split = readContactName({'display_name': _singleName.text.trim()});
      _given.text = split.given;
      _family.text = split.family;
    }
    setState(() => _nameExpanded = true);
  }

  String _savedLabel(_FieldRow row) {
    if (row.label == 'custom') {
      final typed = row.custom.trim();
      return typed.isEmpty ? 'other' : typed;
    }
    return row.label;
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
      _showBirthday = true;
    });
  }

  void _bindAddress(_AddressRow row) {
    if (row.onStreet != null) return;
    void listen() {
      final index = _addresses.indexOf(row);
      if (index < 0) return;
      _onAddressTyped(index, row.street.text);
    }

    row.onStreet = listen;
    row.street.addListener(listen);
  }

  void _onAddressTyped(int index, String value) {
    if (_suppressSearch) return;
    _addressTimer?.cancel();
    final q = value.trim();
    if (q.length < 3) {
      setState(() {
        _hits = const [];
        _searchIndex = null;
      });
      return;
    }
    _addressTimer = Timer(const Duration(milliseconds: 300), () async {
      final gen = ++_addressGen;
      try {
        final hits = await (widget.searchAddresses ?? searchHuberaAddresses)(q);
        if (!mounted || gen != _addressGen) return;
        setState(() {
          _hits = hits;
          _searchIndex = index;
        });
      } catch (error) {
        if (!mounted || gen != _addressGen) return;
        debugPrint('address search failed: $error');
        setState(() {
          _hits = const [];
          _searchIndex = null;
        });
      }
    });
  }

  void _applyHit(int index, ContactAddressHit hit) {
    _addressTimer?.cancel();
    _addressGen++;
    final row = _addresses[index];
    _suppressSearch = true;
    row.street.text = hit.street.isNotEmpty ? hit.street : hit.label;
    row.postal.text = hit.postalCode;
    row.city.text = hit.city;
    row.country.text = hit.country;
    _suppressSearch = false;
    setState(() {
      _hits = const [];
      _searchIndex = null;
    });
  }

  Future<void> _save() async {
    final parts = _parts();
    final phones = [
      for (final row in _phones)
        if (row.controller.text.trim().isNotEmpty)
          LabeledValue(label: _savedLabel(row), value: row.controller.text.trim()),
    ];
    final emails = [
      for (final row in _emails)
        if (row.controller.text.trim().contains('@'))
          LabeledValue(label: _savedLabel(row), value: row.controller.text.trim()),
    ];
    final org = _org.text.trim();
    final display = parts.display.isNotEmpty
        ? parts.display
        : (_title.trim().isNotEmpty ? _title.trim() : org);
    if (display.isEmpty && phones.isEmpty && emails.isEmpty) {
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
        if (value.trim().isEmpty) {
          profile.remove(key);
        } else {
          profile[key] = value.trim();
        }
      }

      put('name_prefix', parts.prefix);
      put('given_name', parts.given);
      put('middle_name', parts.middle);
      put('family_name', parts.family);
      put('name_suffix', parts.suffix);
      put('phonetic_name', _showPhonetic ? _phonetic.text : '');
      put('nickname', _showNickname ? _nickname.text : '');
      put('file_as', _showFileAs ? _fileAs.text : '');
      put('organization', _org.text);
      put('job_title', _showJob ? _job.text : '');
      put('department', _showDepartment ? _department.text : '');
      put('relation', _showRelation ? _relation.text : '');
      put('website', _showWebsite ? _website.text : '');
      put('birthday', _showBirthday ? _birthday : '');
      put('notes', _notes.text);
      put('labels', _showLabels ? _labels.text : '');
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
      final addresses = [
        for (final row in _addresses)
          if (!row.isEmpty)
            ContactAddress(
              label: row.label == 'custom'
                  ? (row.custom.trim().isEmpty ? 'other' : row.custom.trim())
                  : row.label,
              street: row.street.text.trim(),
              postalCode: row.postal.text.trim(),
              city: row.city.text.trim(),
              country: row.country.text.trim(),
            ).toJson(),
      ];
      if (addresses.isEmpty) {
        profile.remove('addresses');
      } else {
        profile['addresses'] = addresses;
      }
      final customs = [
        for (final row in _customs)
          if (row.custom.trim().isNotEmpty || row.controller.text.trim().isNotEmpty)
            {'label': row.custom.trim(), 'value': row.controller.text.trim()},
      ];
      if (customs.isEmpty) {
        profile.remove('custom_fields');
      } else {
        profile['custom_fields'] = customs;
      }
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
    } catch (err) {
      if (!mounted) return;
      final raw = err.toString();
      final detail = raw.contains('refresh token')
          ? 'Session expirée. La fiche n’a pas été enregistrée.'
          : raw.replaceFirst('SuiteApiException: ', '').replaceFirst('AuthException: ', '');
      setState(() {
        _busy = false;
        _error = detail.length > 220 ? '${detail.substring(0, 220)}…' : detail;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final creating = widget.existing == null;
    final bottom = 32 + MediaQuery.viewPaddingOf(context).bottom;
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
          Padding(
            padding: const EdgeInsets.only(right: 20),
            child: Center(
              child: FilledButton(
                key: const Key('contact_editor_save_bar'),
                style: FilledButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  shape: const StadiumBorder(),
                ),
                onPressed: _busy ? null : _save,
                child: Text(_busy ? '…' : 'Enregistrer'),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          primary: false,
          padding: EdgeInsets.fromLTRB(8, 8, 8, bottom),
          children: [
            Center(child: _EditorAvatar(name: _title)),
            _addButton(_busy ? '…' : 'Enregistrer', () {
              if (!_busy) _save();
            }),
            if (!_nameExpanded)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: TextField(
                  key: const Key('contact_editor_name'),
                  controller: _singleName,
                  textCapitalization: TextCapitalization.words,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: scheme.onSurface,
                  ),
                  decoration: _hint(theme, 'Nom').copyWith(
                    suffixIcon: IconButton(
                      key: const Key('contact_editor_expand_name'),
                      tooltip: 'Afficher plus',
                      onPressed: _expandName,
                      icon: const Icon(Icons.expand_more),
                    ),
                  ),
                ),
              )
            else ...[
              if (_showPrefix) _nameField(_prefix, 'Préfixe', const Key('contact_editor_prefix')),
              _nameField(_given, 'Prénom', const Key('contact_editor_given')),
              if (_showMiddle)
                _nameField(_middle, 'Deuxième prénom', const Key('contact_editor_middle')),
              _nameField(_family, 'Nom', const Key('contact_editor_family')),
              if (_showSuffix) _nameField(_suffix, 'Suffixe', const Key('contact_editor_suffix')),
              if (_showPhonetic) _plain(_phonetic, 'Prononciation phonétique'),
              if (_showNickname) _plain(_nickname, 'Pseudo'),
              if (_showFileAs) _plain(_fileAs, 'Classer en tant que'),
            ],
            _plain(_org, 'Entreprise'),
            if (_showJob) _plain(_job, 'Intitulé du poste'),
            if (_showDepartment) _plain(_department, 'Service'),
            for (var i = 0; i < _phones.length; i++) _phoneBox(i),
            for (var i = 0; i < _emails.length; i++) _emailBox(i),
            _addButton('Ajouter un numéro', () => setState(() => _phones.add(_FieldRow(label: 'mobile')))),
            if (_emails.isNotEmpty)
              _addButton(
                'Ajouter adresse e-mail',
                () => setState(() => _emails.add(_FieldRow(label: 'home'))),
              ),
            for (var i = 0; i < _addresses.length; i++) _addressBlock(i),
            if (_addresses.isNotEmpty)
              _addButton('Ajouter une adresse', () {
                final row = _AddressRow();
                _bindAddress(row);
                setState(() => _addresses.add(row));
              }),
            if (_showRelation) _plain(_relation, 'Relations'),
            if (_showWebsite) _plain(_website, 'Site Web'),
            for (var i = 0; i < _customs.length; i++) _customBlock(i),
            if (_showLabels) _plain(_labels, 'Libellés'),
            if (_showBirthday)
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
            _plain(_notes, 'Notes'),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text(
                'Ajouter des infos',
                style: theme.textTheme.titleSmall?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ),
            Wrap(
              spacing: 8,
              children: [
                if (_emails.isEmpty)
                  _addButton('E-mail', () => setState(() => _emails.add(_FieldRow(label: 'home')))),
                if (!_showBirthday)
                  _addButton('Anniversaire', () => setState(() => _showBirthday = true)),
                if (_addresses.isEmpty)
                  _addButton('Adresse', () {
                    final row = _AddressRow();
                    _bindAddress(row);
                    setState(() => _addresses.add(row));
                  }),
                if (!_showLabels) _addButton('Libellés', () => setState(() => _showLabels = true)),
                _addButton('Autre', _openMoreFields),
              ],
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

  Future<void> _openMoreFields() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        final items = <(String, String)>[
          if (!_showMiddle) ('middle', 'Deuxième prénom'),
          if (!_showPhonetic) ('phonetic', 'Prononciation phonétique'),
          if (!_showPrefix) ('prefix', 'Préfixe'),
          if (!_showSuffix) ('suffix', 'Suffixe'),
          if (!_showNickname) ('nickname', 'Pseudo'),
          if (!_showFileAs) ('file_as', 'Classer en tant que'),
          if (!_showJob) ('job', 'Intitulé du poste'),
          if (!_showDepartment) ('department', 'Service'),
          if (!_showRelation) ('relation', 'Relations'),
          if (!_showWebsite) ('website', 'Site Web'),
          ('custom', 'Champ personnalisé'),
        ];
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              const ListTile(title: Text('Sélectionner les champs à ajouter')),
              for (final item in items)
                ListTile(
                  title: Text(item.$2),
                  onTap: () => Navigator.pop(context, item.$1),
                ),
            ],
          ),
        );
      },
    );
    if (choice == null || !mounted) return;
    setState(() {
      switch (choice) {
        case 'middle':
          _showMiddle = true;
          _nameExpanded = true;
        case 'phonetic':
          _showPhonetic = true;
        case 'prefix':
          _showPrefix = true;
          _nameExpanded = true;
        case 'suffix':
          _showSuffix = true;
          _nameExpanded = true;
        case 'nickname':
          _showNickname = true;
        case 'file_as':
          _showFileAs = true;
        case 'job':
          _showJob = true;
        case 'department':
          _showDepartment = true;
        case 'relation':
          _showRelation = true;
        case 'website':
          _showWebsite = true;
        case 'custom':
          _customs.add(_FieldRow(label: 'custom'));
      }
    });
  }

  Widget _nameField(TextEditingController controller, String hint, Key key) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: TextField(
        key: key,
        controller: controller,
        textCapitalization: TextCapitalization.words,
        style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.onSurface),
        decoration: _hint(theme, hint),
      ),
    );
  }

  Widget _plain(TextEditingController controller, String hint) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: TextField(
        controller: controller,
        textCapitalization: hint == 'Site Web' ? TextCapitalization.none : TextCapitalization.sentences,
        style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurface),
        decoration: _hint(theme, hint),
      ),
    );
  }

  InputDecoration _hint(ThemeData theme, String hint) {
    final scheme = theme.colorScheme;
    return InputDecoration(
      labelText: hint,
      floatingLabelBehavior: FloatingLabelBehavior.auto,
      contentPadding: const EdgeInsets.fromLTRB(12, 16, 12, 12),
      border: const OutlineInputBorder(),
      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: scheme.outline)),
      focusedBorder: OutlineInputBorder(
        borderSide: BorderSide(color: scheme.primary, width: 2),
      ),
    );
  }

  /// Cadre du numéro, toujours au-dessus de « Ajouter un numéro ».
  Widget _phoneBox(int i) {
    final row = _phones[i];
    final shown = contactLabelFr(row.label);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: InputDecorator(
        decoration: _hint(Theme.of(context), 'Téléphone').copyWith(
          suffixIcon: IconButton(
            tooltip: 'Retirer',
            onPressed: () => setState(() {
              if (_phones.length == 1) {
                row.controller.clear();
              } else {
                _phones.removeAt(i).dispose();
              }
            }),
            icon: const Icon(Icons.remove_circle_outline),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              key: ValueKey('contact_phone_$i'),
              controller: row.controller,
              keyboardType: TextInputType.phone,
              style: Theme.of(context).textTheme.bodyLarge,
              decoration: const InputDecoration(border: InputBorder.none, isDense: true),
            ),
            PopupMenuButton<String>(
              initialValue: kPhoneLabelIds.contains(row.label) ? row.label : null,
              onSelected: (value) => setState(() => row.label = value),
              itemBuilder: (ctx) => [
                for (final id in kPhoneLabelIds)
                  PopupMenuItem(value: id, child: Text(contactLabelFr(id))),
              ],
              child: Text(shown.isEmpty ? 'Mobile' : shown),
            ),
          ],
        ),
      ),
    );
  }

  /// Cadre de l’e-mail, toujours au-dessus de « Ajouter adresse e-mail ».
  Widget _emailBox(int i) {
    final row = _emails[i];
    final shown = contactLabelFr(row.label);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: InputDecorator(
        decoration: _hint(Theme.of(context), 'E-mail').copyWith(
          suffixIcon: IconButton(
            tooltip: 'Retirer',
            onPressed: () => setState(() => _emails.removeAt(i).dispose()),
            icon: const Icon(Icons.remove_circle_outline),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              key: ValueKey('contact_email_$i'),
              controller: row.controller,
              keyboardType: TextInputType.emailAddress,
              style: Theme.of(context).textTheme.bodyLarge,
              decoration: const InputDecoration(border: InputBorder.none, isDense: true),
            ),
            Text(shown.isEmpty ? 'Domicile' : shown),
          ],
        ),
      ),
    );
  }

  Widget _addButton(String label, VoidCallback onPressed) {
    return Align(
      alignment: Alignment.centerLeft,
      child: TextButton(onPressed: onPressed, child: Text(label)),
    );
  }

  Widget _labeledField({
    required _FieldRow row,
    required IconData icon,
    required String hint,
    required TextInputType keyboard,
    required List<String> choices,
    required VoidCallback onRemove,
    VoidCallback? onSubmitted,
  }) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final ids = [
      ...choices,
      if (!choices.contains(row.label) && row.label != 'custom') row.label,
    ];
    final shown = row.label == 'custom'
        ? (row.custom.trim().isEmpty ? 'Personnalisé' : row.custom.trim())
        : contactLabelFr(row.label);
    return ListTile(
      leading: Icon(icon, color: scheme.onSurfaceVariant),
      title: TextField(
        controller: row.controller,
        keyboardType: keyboard,
        textInputAction: onSubmitted == null ? TextInputAction.next : TextInputAction.done,
        onSubmitted: onSubmitted == null ? null : (_) => onSubmitted(),
        style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurface),
        decoration: _hint(theme, hint),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PopupMenuButton<String>(
            initialValue: ids.contains(row.label) ? row.label : null,
            onSelected: (value) => setState(() {
              row.label = value;
              if (value != 'custom') row.customController.text = '';
            }),
            itemBuilder: (ctx) => [
              for (final id in ids)
                PopupMenuItem(value: id, child: Text(contactLabelFr(id))),
            ],
            child: Text(
              shown.isEmpty ? 'Libellé' : shown,
              style: theme.textTheme.labelMedium?.copyWith(color: scheme.primary),
            ),
          ),
          if (row.label == 'custom')
            TextField(
              controller: row.customController,
              decoration: _hint(theme, 'Personnalisé'),
            ),
        ],
      ),
      trailing: IconButton(
        tooltip: 'Retirer',
        onPressed: onRemove,
        icon: Icon(Icons.remove_circle_outline, color: scheme.onSurfaceVariant),
      ),
    );
  }

  Widget _customBlock(int index) {
    final theme = Theme.of(context);
    final row = _customs[index];
    return ListTile(
      leading: Icon(Icons.notes_outlined, color: theme.colorScheme.onSurfaceVariant),
      title: TextField(
        controller: row.controller,
        decoration: _hint(theme, 'Champ personnalisé'),
      ),
      subtitle: TextField(
        controller: row.customController,
        decoration: _hint(theme, 'Libellé'),
      ),
      trailing: IconButton(
        tooltip: 'Retirer',
        onPressed: () => setState(() => _customs.removeAt(index).dispose()),
        icon: Icon(Icons.remove_circle_outline, color: theme.colorScheme.onSurfaceVariant),
      ),
    );
  }

  Widget _addressBlock(int index) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final row = _addresses[index];
    final ids = [
      ...kAddressLabelIds,
      if (!kAddressLabelIds.contains(row.label) && row.label != 'custom') row.label,
    ];
    final shown = row.label == 'custom'
        ? (row.custom.trim().isEmpty ? 'Personnalisé' : row.custom.trim())
        : contactLabelFr(row.label);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ListTile(
          leading: Icon(Icons.place_outlined, color: scheme.onSurfaceVariant),
          title: TextField(
            key: index == 0 ? const Key('contact_editor_street') : null,
            controller: row.street,
            textCapitalization: TextCapitalization.words,
            onChanged: (v) => _onAddressTyped(index, v),
            style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurface),
            decoration: _hint(theme, 'Adresse'),
          ),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  SizedBox(
                    width: 110,
                    child: TextField(
                      controller: row.postal,
                      keyboardType: TextInputType.text,
                      decoration: _hint(theme, 'Code postal'),
                    ),
                  ),
                  Expanded(
                    child: TextField(
                      controller: row.city,
                      textCapitalization: TextCapitalization.words,
                      decoration: _hint(theme, 'Ville'),
                    ),
                  ),
                ],
              ),
              TextField(
                controller: row.country,
                textCapitalization: TextCapitalization.words,
                decoration: _hint(theme, 'Pays'),
              ),
              PopupMenuButton<String>(
                initialValue: ids.contains(row.label) ? row.label : null,
                onSelected: (value) => setState(() {
                  row.label = value;
                  if (value != 'custom') row.customController.text = '';
                }),
                itemBuilder: (ctx) => [
                  for (final id in ids)
                    PopupMenuItem(value: id, child: Text(contactLabelFr(id))),
                ],
                child: Text(
                  shown.isEmpty ? 'Libellé' : shown,
                  style: theme.textTheme.labelMedium?.copyWith(color: scheme.primary),
                ),
              ),
              if (row.label == 'custom')
                TextField(
                  controller: row.customController,
                  decoration: _hint(theme, 'Personnalisé'),
                ),
            ],
          ),
          trailing: IconButton(
            tooltip: 'Retirer',
            onPressed: () => setState(() {
              _addresses.removeAt(index).dispose();
              _hits = const [];
              _searchIndex = null;
            }),
            icon: Icon(Icons.remove_circle_outline, color: scheme.onSurfaceVariant),
          ),
        ),
        if (_searchIndex == index && _hits.isNotEmpty)
          for (final hit in _hits)
            ListTile(
              key: Key('contact_address_hit_${hit.label}'),
              dense: true,
              title: Text(hit.label),
              onTap: () => _applyHit(index, hit),
            ),
      ],
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
