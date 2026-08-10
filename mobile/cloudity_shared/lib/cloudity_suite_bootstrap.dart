import 'package:flutter/material.dart';

import 'app_theme.dart';
import 'cloudity_crash_reporter.dart';
import 'cloudity_design_tokens.dart';
import 'suite_app_catalog.dart';

/// Bootstrap commun des apps suite (tokens + crash reporter + MaterialApp).
Future<void> cloudityRunSuiteApp({
  required ClouditySuiteApp product,
  required String title,
  required Widget home,
  Future<void> Function()? beforeRun,
  GlobalKey<CloudityThemedAppState>? appKey,
}) async {
  WidgetsFlutterBinding.ensureInitialized();
  await cloudityLoadDesignTokens();
  if (beforeRun != null) await beforeRun();
  CloudityCrashReporter.configure(product: product);
  CloudityCrashReporter.initialize();
  runApp(
    CloudityThemedApp.forSuite(
      key: appKey,
      title: title,
      suiteApp: product,
      home: home,
    ),
  );
}

/// Racine pour tests widget / integration_test qui pumpent l’app sans [cloudityRunSuiteApp].
/// Charge les design tokens avant [CloudityThemedApp] (évite StateError ensureLoaded).
Widget clouditySuiteTestRoot({
  required ClouditySuiteApp suiteApp,
  required String title,
  required Widget home,
  GlobalKey<CloudityThemedAppState>? appKey,
}) {
  if (CloudityDesignTokens.isLoaded) {
    return CloudityThemedApp.forSuite(
      key: appKey,
      title: title,
      suiteApp: suiteApp,
      home: home,
    );
  }
  return _ClouditySuiteTestRoot(
    suiteApp: suiteApp,
    title: title,
    home: home,
    appKey: appKey,
  );
}

class _ClouditySuiteTestRoot extends StatefulWidget {
  const _ClouditySuiteTestRoot({
    required this.suiteApp,
    required this.title,
    required this.home,
    this.appKey,
  });

  final ClouditySuiteApp suiteApp;
  final String title;
  final Widget home;
  final GlobalKey<CloudityThemedAppState>? appKey;

  @override
  State<_ClouditySuiteTestRoot> createState() => _ClouditySuiteTestRootState();
}

class _ClouditySuiteTestRootState extends State<_ClouditySuiteTestRoot> {
  late final Future<void> _tokens = cloudityLoadDesignTokens();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _tokens,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const SizedBox.shrink();
        }
        return CloudityThemedApp.forSuite(
          key: widget.appKey,
          title: widget.title,
          suiteApp: widget.suiteApp,
          home: widget.home,
        );
      },
    );
  }
}
