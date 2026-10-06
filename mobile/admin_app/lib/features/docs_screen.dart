import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

const docsUrl = 'https://docs.hubera.cloud';

/// Cockpit tâches / PDF / notes — même app que docs.hubera.cloud, dans Admin.
class DocsWebScreen extends StatefulWidget {
  const DocsWebScreen({super.key});

  @override
  State<DocsWebScreen> createState() => _DocsWebScreenState();
}

class _DocsWebScreenState extends State<DocsWebScreen> {
  late final WebViewController _controller;
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF4F7F8))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _loading = false);
          },
        ),
      )
      ..loadRequest(Uri.parse(docsUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tâches · Docs'),
        actions: [
          IconButton(
            tooltip: 'Actualiser',
            onPressed: () => _controller.reload(),
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: 'Ouvrir dans le navigateur',
            onPressed: () => launchUrl(Uri.parse(docsUrl), mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.open_in_browser),
          ),
        ],
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_loading) const LinearProgressIndicator(),
        ],
      ),
    );
  }
}
