import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import 'auth_api.dart';
import 'user_session.dart';

enum DrivePreviewKind { image, text, pdf, office, archive, other }

DrivePreviewKind drivePreviewKind({required String name, String? mimeType}) {
  final lower = name.toLowerCase();
  final mime = (mimeType ?? '').toLowerCase().split(';').first.trim();
  if (mime.startsWith('image/') ||
      RegExp(r'\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$').hasMatch(lower)) {
    return DrivePreviewKind.image;
  }
  if (mime.startsWith('text/') ||
      mime == 'application/json' ||
      mime == 'application/xml' ||
      RegExp(
        r'\.(txt|md|markdown|csv|json|xml|log|yaml|yml)$',
      ).hasMatch(lower)) {
    return DrivePreviewKind.text;
  }
  if (mime == 'application/pdf' || lower.endsWith('.pdf')) {
    return DrivePreviewKind.pdf;
  }
  if (_isOfficeFile(lower, mime)) return DrivePreviewKind.office;
  if (RegExp(r'\.(zip|tar|gz|tgz|7z|rar)$').hasMatch(lower)) {
    return DrivePreviewKind.archive;
  }
  return DrivePreviewKind.other;
}

bool _isOfficeFile(String lowerName, String mime) {
  if (mime.contains('wordprocessingml') ||
      mime.contains('spreadsheetml') ||
      mime.contains('presentationml') ||
      mime == 'application/msword' ||
      mime == 'application/vnd.ms-excel' ||
      mime == 'application/vnd.ms-powerpoint' ||
      mime == 'application/vnd.oasis.opendocument.text' ||
      mime == 'application/vnd.oasis.opendocument.spreadsheet') {
    return true;
  }
  return RegExp(r'\.(docx?|xlsx?|pptx?|odt|ods|odp)$').hasMatch(lowerName);
}

class DriveFilePreviewPage extends StatefulWidget {
  const DriveFilePreviewPage({
    super.key,
    required this.session,
    required this.node,
  });

  final UserSession session;
  final Map<String, dynamic> node;

  @override
  State<DriveFilePreviewPage> createState() => _DriveFilePreviewPageState();
}

class _DriveFilePreviewPageState extends State<DriveFilePreviewPage> {
  DriveFileDownload? _download;
  bool _loading = true;
  bool _openingExternal = false;
  String? _error;

  String get _name => widget.node['name']?.toString() ?? 'Fichier';
  int? get _id =>
      widget.node['id'] is num ? (widget.node['id'] as num).toInt() : null;
  String? get _nodeMime => widget.node['mime_type']?.toString();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final id = _id;
    if (id == null) {
      setState(() {
        _loading = false;
        _error = 'Fichier invalide.';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.session.refreshIfNeeded();
      final download = await widget.session.api.downloadDriveNode(
        accessToken: widget.session.accessToken,
        nodeId: id,
      );
      if (!mounted) return;
      setState(() {
        _download = download;
        _loading = false;
      });
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message == 'non_autorisé' ? 'Session expirée.' : e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Prévisualisation impossible : $e';
      });
    }
  }

  Future<File> _writeTempFile(Uint8List bytes) async {
    final dir = await getTemporaryDirectory();
    final safeName = _name.replaceAll(RegExp(r'[\\/:*?"<>|]+'), '_');
    final file = File('${dir.path}/cloudity_drive_$safeName');
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  Future<void> _openExternal() async {
    final download = _download;
    if (download == null) return;
    setState(() => _openingExternal = true);
    try {
      final file = await _writeTempFile(download.bytes);
      final result = await OpenFilex.open(file.path);
      if (!mounted) return;
      if (result.type != ResultType.done) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(result.message)));
      }
    } finally {
      if (mounted) setState(() => _openingExternal = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final download = _download;
    final kind = drivePreviewKind(
      name: _name,
      mimeType: download?.mimeType ?? _nodeMime,
    );
    return Scaffold(
      appBar: AppBar(
        title: Text(_name, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          if (download != null)
            IconButton(
              tooltip: 'Ouvrir avec une application',
              onPressed: _openingExternal ? null : _openExternal,
              icon: _openingExternal
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.open_in_new),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? _PreviewError(message: _error!, onRetry: _load)
          : _buildPreview(kind, download!),
    );
  }

  Widget _buildPreview(DrivePreviewKind kind, DriveFileDownload download) {
    return switch (kind) {
      DrivePreviewKind.image => _ImagePreview(
        bytes: download.bytes,
        name: _name,
      ),
      DrivePreviewKind.text => _TextPreview(bytes: download.bytes),
      DrivePreviewKind.pdf => _ExternalPreviewPrompt(
        icon: Icons.picture_as_pdf_outlined,
        title: 'PDF prêt à ouvrir',
        subtitle:
            'Cloudity a téléchargé le fichier. Ouvre-le avec le lecteur PDF du téléphone.',
        buttonLabel: 'Ouvrir le PDF',
        onOpen: _openExternal,
        busy: _openingExternal,
      ),
      DrivePreviewKind.office => _ExternalPreviewPrompt(
        icon: Icons.description_outlined,
        title: 'Document Office prêt',
        subtitle:
            'L’édition Office mobile arrivera ensuite. Pour l’instant, ouvre ce fichier avec l’application du téléphone.',
        buttonLabel: 'Ouvrir le document',
        onOpen: _openExternal,
        busy: _openingExternal,
      ),
      DrivePreviewKind.archive => _ExternalPreviewPrompt(
        icon: Icons.folder_zip_outlined,
        title: 'Archive prête',
        subtitle: 'Ouvre cette archive avec une application compatible.',
        buttonLabel: 'Ouvrir l’archive',
        onOpen: _openExternal,
        busy: _openingExternal,
      ),
      DrivePreviewKind.other => _ExternalPreviewPrompt(
        icon: Icons.insert_drive_file_outlined,
        title: 'Fichier téléchargé',
        subtitle:
            'Aucune prévisualisation intégrée pour ce format. Tu peux l’ouvrir avec une application installée.',
        buttonLabel: 'Ouvrir avec…',
        onOpen: _openExternal,
        busy: _openingExternal,
      ),
    };
  }
}

class _ImagePreview extends StatelessWidget {
  const _ImagePreview({required this.bytes, required this.name});

  final Uint8List bytes;
  final String name;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: InteractiveViewer(
          minScale: 0.7,
          maxScale: 5,
          child: Image.memory(
            bytes,
            fit: BoxFit.contain,
            semanticLabel: name,
            errorBuilder: (context, error, stackTrace) => const _ExternalFormatHint(
              icon: Icons.image_not_supported_outlined,
              text:
                  'Cette image n’est pas rendue par Flutter. Utilise “Ouvrir avec…”',
            ),
          ),
        ),
      ),
    );
  }
}

class _TextPreview extends StatelessWidget {
  const _TextPreview({required this.bytes});

  final Uint8List bytes;

  @override
  Widget build(BuildContext context) {
    final text = _decodeText(bytes);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SelectableText(
          text,
          style: const TextStyle(fontFamily: 'monospace', height: 1.35),
        ),
      ],
    );
  }
}

String _decodeText(Uint8List bytes) {
  try {
    return const Utf8Decoder(allowMalformed: true).convert(bytes);
  } catch (_) {
    return latin1.decode(bytes, allowInvalid: true);
  }
}

class _ExternalPreviewPrompt extends StatelessWidget {
  const _ExternalPreviewPrompt({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.buttonLabel,
    required this.onOpen,
    required this.busy,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String buttonLabel;
  final VoidCallback onOpen;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 64),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(subtitle, textAlign: TextAlign.center),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: busy ? null : onOpen,
              icon: busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.open_in_new),
              label: Text(buttonLabel),
            ),
          ],
        ),
      ),
    );
  }
}

class _PreviewError extends StatelessWidget {
  const _PreviewError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.error_outline,
              size: 56,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Réessayer')),
          ],
        ),
      ),
    );
  }
}

class _ExternalFormatHint extends StatelessWidget {
  const _ExternalFormatHint({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: Colors.white70, size: 56),
        const SizedBox(height: 12),
        Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white),
        ),
      ],
    );
  }
}
