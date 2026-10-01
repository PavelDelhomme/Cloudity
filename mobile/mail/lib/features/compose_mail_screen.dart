import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../api/auth_api.dart';
import 'mail_contacts.dart';
import 'mail_validation.dart';
import '../auth/user_session.dart';

class _PickedAtt {
  const _PickedAtt({required this.name, required this.mime, required this.bytes});
  final String name;
  final String mime;
  final Uint8List bytes;

  String get sizeLabel {
    if (bytes.length < 1024) return '${bytes.length} o';
    if (bytes.length < 1024 * 1024) {
      return '${(bytes.length / 1024).toStringAsFixed(0)} Ko';
    }
    return '${(bytes.length / (1024 * 1024)).toStringAsFixed(1)} Mo';
  }
}

String _mimeForName(String name) {
  final ext = name.contains('.') ? name.split('.').last.toLowerCase() : '';
  return switch (ext) {
    'pdf' => 'application/pdf',
    'png' => 'image/png',
    'jpg' || 'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    'txt' => 'text/plain',
    'html' || 'htm' => 'text/html',
    'csv' => 'text/csv',
    'doc' => 'application/msword',
    'docx' =>
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' =>
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'zip' => 'application/zip',
    'mp3' => 'audio/mpeg',
    'mp4' => 'video/mp4',
    _ => 'application/octet-stream',
  };
}

/// Envoi SMTP — layout type Gmail / Proton (À, objet, corps, PJ).
class ComposeMailScreen extends StatefulWidget {
  const ComposeMailScreen({
    super.key,
    required this.session,
    required this.accountId,
    this.initialTo,
    this.initialSubject,
    this.initialBody,
    this.contacts = const [],
  });

  final UserSession session;
  final int accountId;
  final String? initialTo;
  final String? initialSubject;
  final String? initialBody;
  final List<Map<String, dynamic>> contacts;

  @override
  State<ComposeMailScreen> createState() => _ComposeMailScreenState();
}

class _ComposeMailScreenState extends State<ComposeMailScreen> {
  final _toCtrl = TextEditingController();
  final _ccCtrl = TextEditingController();
  final _subjectCtrl = TextEditingController();
  final _bodyCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final List<_PickedAtt> _atts = [];
  bool _sending = false;
  bool _showCc = false;
  bool _showSmtp = false;
  String? _error;
  late MailContactBook _book;

  @override
  void initState() {
    super.initState();
    _toCtrl.text = widget.initialTo ?? '';
    _subjectCtrl.text = widget.initialSubject ?? '';
    _bodyCtrl.text = widget.initialBody ?? '';
    _book = MailContactBook(widget.contacts);
    _showCc = (widget.initialTo ?? '').isNotEmpty;
    if (widget.contacts.isEmpty) {
      _loadContacts();
    }
  }

  Future<void> _loadContacts() async {
    try {
      await widget.session.refreshIfNeeded();
      final list = await widget.session.api.fetchContacts(widget.session.accessToken);
      if (!mounted) return;
      setState(() => _book = MailContactBook(list));
    } catch (_) {
      /* carnet optionnel */
    }
  }

  @override
  void dispose() {
    _toCtrl.dispose();
    _ccCtrl.dispose();
    _subjectCtrl.dispose();
    _bodyCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  bool _validRecipients(String raw) {
    final parts = raw.split(RegExp(r'[,;]')).map((s) => s.trim()).where((s) => s.isNotEmpty);
    if (parts.isEmpty) return false;
    return parts.every(isValidRecipientEmail);
  }

  Future<void> _pickFiles() async {
    if (_atts.length >= 5) {
      setState(() => _error = '5 pièces jointes maximum.');
      return;
    }
    final res = await FilePicker.pickFiles(
      allowMultiple: true,
      withData: true,
    );
    if (res == null) return;
    var total = _atts.fold<int>(0, (n, a) => n + a.bytes.length);
    final next = <_PickedAtt>[..._atts];
    for (final f in res.files) {
      if (next.length >= 5) break;
      final bytes = f.bytes;
      if (bytes == null || bytes.isEmpty) continue;
      total = total + bytes.length;
      if (total > 8 * 1024 * 1024) {
        setState(() => _error = 'Pièces jointes trop lourdes (8 Mo max).');
        return;
      }
      next.add(_PickedAtt(
        name: f.name,
        mime: _mimeForName(f.name),
        bytes: bytes,
      ));
    }
    setState(() {
      _atts
        ..clear()
        ..addAll(next);
      _error = null;
    });
  }

  Future<void> _send() async {
    final to = _toCtrl.text.trim();
    if (!_validRecipients(to)) {
      setState(() => _error = 'Adresse destinataire invalide.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    final attachments = _atts
        .map(
          (a) => {
            'filename': a.name,
            'mime': a.mime,
            'data': base64Encode(a.bytes),
          },
        )
        .toList();
    Future<void> once() async {
      await widget.session.refreshIfNeeded();
      final pwd = _passwordCtrl.text.trim();
      await widget.session.api.sendMail(
        accessToken: widget.session.accessToken,
        accountId: widget.accountId,
        to: to,
        cc: _ccCtrl.text.trim(),
        subject: _subjectCtrl.text.trim(),
        body: _bodyCtrl.text,
        password: pwd.isEmpty ? null : pwd,
        attachments: attachments,
      );
    }
    try {
      await once();
    } on AuthException catch (e) {
      if (e.message == 'non_autorisé') {
        try {
          await once();
        } catch (e2) {
          if (mounted) {
            setState(() {
              _error = e2 is AuthException ? e2.message : e2.toString();
              _sending = false;
            });
          }
          return;
        }
      } else {
        if (mounted) {
          setState(() {
            _error = e.message;
            _sending = false;
          });
        }
        return;
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _sending = false;
        });
      }
      return;
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Message envoyé.')),
    );
    Navigator.of(context).pop(true);
  }

  Widget _addrField({
    required String label,
    required TextEditingController controller,
    required String hint,
    String fieldKey = 'to',
  }) {
    final last = controller.text.split(RegExp(r'[,;]')).last.trim();
    final hints = last.isEmpty ? const <({String name, String email})>[] : _book.suggestions(last);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          key: ValueKey('cloudity_mail_compose_$fieldKey'),
          controller: controller,
          decoration: InputDecoration(
            prefixText: '$label  ',
            prefixStyle: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
            hintText: hint,
            border: InputBorder.none,
            isDense: true,
          ),
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          onChanged: (_) => setState(() {}),
        ),
        if (hints.isNotEmpty)
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(bottom: 4),
              itemCount: hints.length,
              separatorBuilder: (_, _) => const SizedBox(width: 6),
              itemBuilder: (context, i) {
                final s = hints[i];
                return ActionChip(
                  label: Text(s.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                  onPressed: () {
                    final bits = controller.text.split(RegExp(r'[,;]'));
                    bits.removeLast();
                    final kept = bits.map((x) => x.trim()).where((x) => x.isNotEmpty).toList();
                    kept.add(s.email);
                    controller.text = '${kept.join(', ')}, ';
                    controller.selection = TextSelection.collapsed(offset: controller.text.length);
                    setState(() {});
                  },
                );
              },
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      key: const ValueKey('cloudity_mail_compose'),
      appBar: AppBar(
        title: const Text('Nouveau message'),
        actions: [
          IconButton(
            tooltip: 'Pièce jointe',
            onPressed: _sending ? null : _pickFiles,
            icon: Badge(
              isLabelVisible: _atts.isNotEmpty,
              label: Text('${_atts.length}'),
              child: const Icon(Icons.attach_file),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilledButton.icon(
              onPressed: _sending ? null : _send,
              icon: _sending
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.send, size: 18),
              label: const Text('Envoyer'),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
            child: Row(
              children: [
                Expanded(
                  child: _addrField(
                    label: 'À',
                    controller: _toCtrl,
                    hint: 'nom ou e-mail',
                    fieldKey: 'to',
                  ),
                ),
                TextButton(
                  onPressed: () => setState(() => _showCc = !_showCc),
                  child: Text(_showCc ? 'Masquer Cc' : 'Cc'),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          if (_showCc) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
              child: _addrField(
                label: 'Cc',
                controller: _ccCtrl,
                hint: 'copie',
                fieldKey: 'cc',
              ),
            ),
            const Divider(height: 1),
          ],
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              key: const ValueKey('cloudity_mail_compose_subject'),
              controller: _subjectCtrl,
              decoration: InputDecoration(
                prefixText: 'Objet  ',
                prefixStyle: TextStyle(
                  color: theme.colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
                hintText: '(sans objet)',
                border: InputBorder.none,
              ),
              textCapitalization: TextCapitalization.sentences,
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: TextField(
              key: const ValueKey('cloudity_mail_compose_body'),
              controller: _bodyCtrl,
              decoration: const InputDecoration(
                hintText: 'Écrire un message',
                border: InputBorder.none,
                contentPadding: EdgeInsets.fromLTRB(16, 12, 16, 12),
              ),
              keyboardType: TextInputType.multiline,
              textCapitalization: TextCapitalization.sentences,
              maxLines: null,
              expands: true,
            ),
          ),
          if (_atts.isNotEmpty)
            SizedBox(
              height: 72,
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                scrollDirection: Axis.horizontal,
                itemCount: _atts.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final a = _atts[i];
                  final isImg = a.mime.startsWith('image/');
                  return InputChip(
                    avatar: Icon(isImg ? Icons.image_outlined : Icons.insert_drive_file_outlined, size: 18),
                    label: Text('${a.name}\n${a.sizeLabel}', maxLines: 2),
                    onDeleted: _sending ? null : () => setState(() => _atts.removeAt(i)),
                  );
                },
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
            ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => setState(() => _showSmtp = !_showSmtp),
              child: Text(_showSmtp ? 'Masquer le mot de passe SMTP' : 'Mot de passe SMTP (optionnel)'),
            ),
          ),
          if (_showSmtp)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: TextField(
                key: const ValueKey('cloudity_mail_compose_password'),
                controller: _passwordCtrl,
                decoration: const InputDecoration(
                  labelText: 'Mot de passe SMTP',
                  helperText: 'Uniquement si la boîte n’a pas de secret enregistré.',
                  border: OutlineInputBorder(),
                ),
                obscureText: true,
                autocorrect: false,
              ),
            ),
        ],
      ),
    );
  }
}
