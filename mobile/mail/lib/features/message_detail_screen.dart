import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../api/auth_api.dart';
import 'compose_mail_screen.dart';
import 'html_to_readable.dart';
import 'mail_contacts.dart';
import 'mail_html_body.dart';
import '../auth/user_session.dart';

class MessageDetailScreen extends StatefulWidget {
  const MessageDetailScreen({
    super.key,
    required this.session,
    required this.accountId,
    required this.messageId,
    this.contacts = const [],
  });

  final UserSession session;
  final int accountId;
  final int messageId;
  final List<Map<String, dynamic>> contacts;

  @override
  State<MessageDetailScreen> createState() => _MessageDetailScreenState();
}

class _MessageDetailScreenState extends State<MessageDetailScreen> {
  Map<String, dynamic>? _detail;
  String? _error;
  bool _loading = true;

  MailContactBook get _book => MailContactBook(widget.contacts);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.session.refreshIfNeeded();
      final d = await widget.session.api.fetchMailMessage(
        accessToken: widget.session.accessToken,
        accountId: widget.accountId,
        messageId: widget.messageId,
      );
      if (!mounted) return;
      setState(() {
        _detail = d;
        _loading = false;
      });
      await _markReadOnServerIfNeeded();
    } on AuthException catch (e) {
      if (e.message == 'non_autorisé') {
        try {
          await widget.session.refreshIfNeeded();
          final d = await widget.session.api.fetchMailMessage(
            accessToken: widget.session.accessToken,
            accountId: widget.accountId,
            messageId: widget.messageId,
          );
          if (!mounted) return;
          setState(() {
            _detail = d;
            _loading = false;
          });
          await _markReadOnServerIfNeeded();
          return;
        } catch (_) {
          if (mounted) setState(() => _error = 'Session expirée.');
        }
      } else {
        if (mounted) setState(() => _error = e.message);
      }
      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _markReadOnServerIfNeeded() async {
    final d = _detail;
    if (d == null) return;
    final r = d['is_read'];
    if (r == true) return;
    Future<void> once() async {
      await widget.session.refreshIfNeeded();
      await widget.session.api.patchMessageRead(
        accessToken: widget.session.accessToken,
        accountId: widget.accountId,
        messageId: widget.messageId,
        read: true,
      );
    }
    try {
      await once();
    } on AuthException catch (e) {
      if (e.message == 'non_autorisé') {
        try {
          await once();
        } catch (_) {
          return;
        }
      } else {
        return;
      }
    } catch (_) {
      return;
    }
    if (!mounted) return;
    setState(() {
      _detail?['is_read'] = true;
    });
  }

  int? _attachmentId(Map<String, dynamic> a) {
    final id = a['id'];
    if (id is int) return id;
    return int.tryParse(id?.toString() ?? '');
  }

  String _safeAttachmentFileName(String raw) {
    var s = raw.replaceAll(RegExp(r'[/\\\x00]'), '_').trim();
    if (s.isEmpty) s = 'piece_jointe';
    return s;
  }

  String _sizeLabel(dynamic sz) {
    final n = sz is int ? sz : (sz is num ? sz.toInt() : 0);
    if (n <= 0) return '';
    if (n < 1024) return '$n o';
    if (n < 1024 * 1024) return '${(n / 1024).toStringAsFixed(0)} Ko';
    return '${(n / (1024 * 1024)).toStringAsFixed(1)} Mo';
  }

  Future<void> _shareAttachment(Map<String, dynamic> a) async {
    final attId = _attachmentId(a);
    if (attId == null || attId <= 0) return;
    final name = _safeAttachmentFileName(a['filename']?.toString() ?? 'fichier');

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Préparation de $name…')),
    );

    Future<Uint8List> load() async {
      await widget.session.refreshIfNeeded();
      return widget.session.api.downloadMailAttachment(
        accessToken: widget.session.accessToken,
        accountId: widget.accountId,
        messageId: widget.messageId,
        attachmentId: attId,
      );
    }

    try {
      Uint8List bytes;
      try {
        bytes = await load();
      } on AuthException catch (e) {
        if (e.message == 'non_autorisé') {
          await widget.session.refreshIfNeeded();
          bytes = await load();
        } else {
          rethrow;
        }
      }

      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/hubera_mail_${widget.messageId}_${attId}_$name';
      final f = File(path);
      await f.writeAsBytes(bytes, flush: true);

      if (!mounted) return;
      ScaffoldMessenger.of(context).hideCurrentSnackBar();

      final ro = context.findRenderObject();
      Rect? origin;
      if (ro is RenderBox) {
        final topLeft = ro.localToGlobal(Offset.zero);
        origin = topLeft & ro.size;
      }

      await Share.shareXFiles(
        [XFile(path, mimeType: a['content_type']?.toString(), name: name)],
        subject: name,
        sharePositionOrigin: origin,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Pièce jointe : $e')),
      );
    }
  }

  Future<void> _move(String folder) async {
    try {
      await widget.session.refreshIfNeeded();
      await widget.session.api.patchMessageFolder(
        accessToken: widget.session.accessToken,
        accountId: widget.accountId,
        messageId: widget.messageId,
        folder: folder,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  void _openReply({required bool all}) {
    final d = _detail;
    if (d == null) return;
    final from = d['from']?.toString() ?? '';
    final to = d['to']?.toString() ?? '';
    final subj = d['subject']?.toString() ?? '';
    final person = _book.resolve(from);
    final re = subj.toLowerCase().startsWith('re:') ? subj : 'Re: $subj';
    var dest = person.email.isNotEmpty ? person.email : from;
    if (all && to.trim().isNotEmpty) {
      dest = [dest, to].where((s) => s.trim().isNotEmpty).join(', ');
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ComposeMailScreen(
          session: widget.session,
          accountId: widget.accountId,
          initialTo: dest,
          initialSubject: re,
          contacts: widget.contacts,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('cloudity_mail_message_detail'),
      appBar: AppBar(
        title: const Text('Message'),
        actions: [
          IconButton(
            tooltip: 'Archiver',
            icon: const Icon(Icons.archive_outlined),
            onPressed: _detail == null ? null : () => _move('archive'),
          ),
          IconButton(
            tooltip: 'Corbeille',
            icon: const Icon(Icons.delete_outline),
            onPressed: _detail == null ? null : () => _move('trash'),
          ),
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'reply') _openReply(all: false);
              if (v == 'reply-all') _openReply(all: true);
              if (v == 'spam') _move('spam');
            },
            itemBuilder: (ctx) => const [
              PopupMenuItem(value: 'reply', child: Text('Répondre')),
              PopupMenuItem(value: 'reply-all', child: Text('Répondre à tous')),
              PopupMenuItem(value: 'spam', child: Text('Signaler spam')),
            ],
          ),
        ],
      ),
      floatingActionButton: _detail == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openReply(all: false),
              icon: const Icon(Icons.reply),
              label: const Text('Répondre'),
            ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        FilledButton(onPressed: _load, child: const Text('Réessayer')),
                      ],
                    ),
                  ),
                )
              : _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    final d = _detail!;
    final theme = Theme.of(context);
    final subject = d['subject']?.toString() ?? '(sans objet)';
    final from = d['from']?.toString() ?? '';
    final to = d['to']?.toString() ?? '';
    final date = d['date_at']?.toString() ?? '';
    final body = d['body_plain']?.toString() ?? '';
    final html = d['body_html']?.toString() ?? '';
    final person = _book.resolve(from);
    final seed = colorForEmail(person.email.isNotEmpty ? person.email : person.primary);
    final rawAtt = d['attachments'];
    final attachments = rawAtt is List
        ? rawAtt.map((e) => Map<String, dynamic>.from(e as Map)).toList()
        : <Map<String, dynamic>>[];
    final hasHtml = html.trim().isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Text(
            subject,
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
        ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          leading: CircleAvatar(
            backgroundColor: Color(seed.value),
            foregroundColor: Colors.white,
            child: Text(person.initial),
          ),
          title: Text(person.primary, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (person.secondary != null)
                Text(person.secondary!, maxLines: 1, overflow: TextOverflow.ellipsis),
              if (to.isNotEmpty)
                Text('À $to', maxLines: 1, overflow: TextOverflow.ellipsis),
              if (date.isNotEmpty) Text(date, style: theme.textTheme.bodySmall),
            ],
          ),
          isThreeLine: true,
        ),
        if (attachments.isNotEmpty)
          SizedBox(
            height: 56,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              scrollDirection: Axis.horizontal,
              itemCount: attachments.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final a = attachments[i];
                final name = a['filename']?.toString() ?? 'fichier';
                final sz = _sizeLabel(a['size_bytes']);
                final ct = a['content_type']?.toString() ?? '';
                final img = ct.startsWith('image/');
                return ActionChip(
                  avatar: Icon(img ? Icons.image_outlined : Icons.attach_file, size: 18),
                  label: Text(sz.isEmpty ? name : '$name · $sz'),
                  onPressed: () => _shareAttachment(a),
                );
              },
            ),
          ),
        const Divider(height: 1),
        Expanded(
          child: hasHtml
              ? MailHtmlBody(
                  html: html,
                  plainFallback: body,
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
                  child: SelectableText(
                    body.isNotEmpty ? body : htmlToReadable(html).isEmpty
                        ? '(aucun corps)'
                        : htmlToReadable(html),
                  ),
                ),
        ),
      ],
    );
  }
}
