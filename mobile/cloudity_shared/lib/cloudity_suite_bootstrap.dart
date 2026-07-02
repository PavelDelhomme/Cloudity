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
