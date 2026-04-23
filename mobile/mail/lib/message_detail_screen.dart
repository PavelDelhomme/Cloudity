import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'auth_api.dart';
import 'user_session.dart';

class MessageDetailScreen extends StatefulWidget {
  const MessageDetailScreen({
    super.key,
    required this.session,
    required this.accountId,
    required this.messageId,
  });

  final UserSession session;
  final int accountId;
  final int messageId;

  @override
  State<MessageDetailScreen> createState() => _MessageDetailScreenState();
}

class _MessageDetailScreenState extends State<MessageDetailScreen> {
  Map<String, dynamic>? _detail;
  String? _error;
  bool _loading = true;

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

  /// Non bloquant : aligne la base avec « lu » quand l’utilisateur ouvre le détail.
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
      final path = '${dir.path}/cloudity_mail_${widget.messageId}_${attId}_$name';
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('cloudity_mail_message_detail'),
      appBar: AppBar(
        title: const Text('Message'),
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
    final subject = d['subject']?.toString() ?? '(sans objet)';
    final from = d['from']?.toString() ?? '';
    final date = d['date_at']?.toString() ?? '';
    final body = d['body_plain']?.toString() ?? '';
    final html = d['body_html']?.toString() ?? '';
    final textBody = body.isNotEmpty ? body : (html.isNotEmpty ? '(HTML — voir sur le web)' : '(aucun corps)');
    final rawAtt = d['attachments'];
    final attachments = rawAtt is List
        ? rawAtt.map((e) => Map<String, dynamic>.from(e as Map)).toList()
        : <Map<String, dynamic>>[];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(subject, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(from, style: Theme.of(context).textTheme.bodyMedium),
        if (date.isNotEmpty) Text(date, style: Theme.of(context).textTheme.bodySmall),
        const Divider(height: 32),
        SelectableText(textBody),
        if (attachments.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text('Pièces jointes', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          ...attachments.map((a) {
            final name = a['filename']?.toString() ?? 'fichier';
            final ct = a['content_type']?.toString() ?? '';
            final sz = a['size_bytes'];
            final sizeStr = sz is int ? '$sz o' : (sz is num ? '${sz.toInt()} o' : '');
            return ListTile(
              dense: true,
              leading: const Icon(Icons.attach_file),
              title: Text(name),
              subtitle: Text([ct, sizeStr].where((s) => s.isNotEmpty).join(' · ')),
              trailing: const Icon(Icons.download_outlined),
              onTap: () => _shareAttachment(a),
            );
          }),
        ],
      ],
    );
  }
}
