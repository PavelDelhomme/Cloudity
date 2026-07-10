import 'package:flutter/material.dart';

/// Extrait le domaine d'une URL Pass (aligné web `passDomainFromUrl`).
String? passDomainFromUrl(String? raw) {
  if (raw == null || raw.trim().isEmpty) return null;
  try {
    final withScheme = raw.contains('://') ? raw : 'https://$raw';
    final uri = Uri.parse(withScheme);
    final host = uri.host.replaceFirst(RegExp(r'^www\.'), '');
    return host.isEmpty ? null : host;
  } catch (_) {
    return null;
  }
}

/// Favicon via proxy gateway : GET `/mail/favicon?domain=`.
class PassFavicon extends StatefulWidget {
  const PassFavicon({
    super.key,
    required this.gatewayBase,
    this.url,
    this.title,
    this.size = 24,
  });

  final String gatewayBase;
  final String? url;
  final String? title;
  final double size;

  @override
  State<PassFavicon> createState() => _PassFaviconState();
}

class _PassFaviconState extends State<PassFavicon> {
  bool _failed = false;

  @override
  Widget build(BuildContext context) {
    final domain = passDomainFromUrl(widget.url);
    final letter = (widget.title?.trim().isNotEmpty == true
            ? widget.title!.trim()[0]
            : domain?.isNotEmpty == true
                ? domain![0]
                : '?')
        .toUpperCase();

    if (domain == null || _failed) {
      return Container(
        width: widget.size,
        height: widget.size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          letter,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w600),
        ),
      );
    }

    final base = widget.gatewayBase.trim().replaceAll(RegExp(r'/$'), '');
    final src = '$base/mail/favicon?domain=${Uri.encodeComponent(domain)}';
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: Image.network(
        src,
        width: widget.size,
        height: widget.size,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) {
          if (!_failed) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) setState(() => _failed = true);
            });
          }
          return Container(
            width: widget.size,
            height: widget.size,
            alignment: Alignment.center,
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            child: Text(letter, style: Theme.of(context).textTheme.labelSmall),
          );
        },
      ),
    );
  }
}
