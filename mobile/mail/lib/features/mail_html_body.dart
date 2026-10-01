import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'html_to_readable.dart';

/// Corps HTML d’un mail (images distantes, tables, styles inline) dans une WebView.
class MailHtmlBody extends StatefulWidget {
  const MailHtmlBody({super.key, required this.html, this.plainFallback = ''});

  final String html;
  final String plainFallback;

  @override
  State<MailHtmlBody> createState() => _MailHtmlBodyState();
}

class _MailHtmlBodyState extends State<MailHtmlBody> {
  WebViewController? _controller;
  Object? _webViewError;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  @override
  void didUpdateWidget(covariant MailHtmlBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.html != widget.html) {
      _controller?.loadHtmlString(_wrap(widget.html));
    }
  }

  void _boot() {
    try {
      final c = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.disabled)
        ..setBackgroundColor(const Color(0x00000000))
        ..setNavigationDelegate(
          NavigationDelegate(
            onNavigationRequest: (req) {
              if (req.isMainFrame &&
                  req.url != 'about:blank' &&
                  !req.url.startsWith('data:') &&
                  req.url != 'https://mail.hubera.cloud/') {
                return NavigationDecision.prevent;
              }
              return NavigationDecision.navigate;
            },
          ),
        )
        ..loadHtmlString(_wrap(widget.html));
      _controller = c;
    } catch (e) {
      _webViewError = e;
    }
  }

  String _wrap(String html) {
    var body = html;
    body = body.replaceAll(
      RegExp(r'<script[\s\S]*?</script>', caseSensitive: false),
      '',
    );
    return '''<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=2">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 15px; line-height: 1.45; color: #202124; padding: 4px 2px 24px;
    overflow-wrap: anywhere; word-break: break-word;
  }
  img, video { max-width: 100% !important; height: auto !important; }
  table { max-width: 100%; border-collapse: collapse; }
  a { color: #1a73e8; }
  blockquote { margin: 8px 0; padding-left: 12px; border-left: 3px solid #dadce0; color: #5f6368; }
  pre { white-space: pre-wrap; }
</style>
</head><body>$body</body></html>''';
  }

  @override
  Widget build(BuildContext context) {
    final c = _controller;
    if (c == null || _webViewError != null) {
      final plain = widget.plainFallback.trim().isNotEmpty
          ? widget.plainFallback
          : htmlToReadable(widget.html);
      return SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        child: SelectableText(
          plain.isEmpty ? '(aucun corps)' : plain,
        ),
      );
    }
    return WebViewWidget(controller: c);
  }
}
