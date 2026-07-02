import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'cloudity_design_tokens.dart';
import 'suite_app_catalog.dart';

/// Préférences de thème partagées entre les apps Flutter Cloudity.
class CloudityThemePrefs {
  static const _key = 'cloudity_theme_mode';

  static Future<ThemeMode> load() async {
    final p = await SharedPreferences.getInstance();
    return switch (p.getString(_key)) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  static Future<void> save(ThemeMode mode) async {
    final p = await SharedPreferences.getInstance();
    final value = switch (mode) {
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
      ThemeMode.system => 'system',
    };
    await p.setString(_key, value);
  }
}

/// Thèmes Material 3 homogènes (seed par app).
class CloudityAppThemes {
  static ThemeData light(Color seed) => ThemeData(
    colorScheme: ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.light),
    useMaterial3: true,
  );

  static ThemeData dark(Color seed) => ThemeData(
    colorScheme: ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.dark),
    useMaterial3: true,
  );
}

/// Enveloppe MaterialApp avec thème clair/sombre persisté.
class CloudityThemedApp extends StatefulWidget {
  const CloudityThemedApp({
    super.key,
    required this.title,
    required this.home,
    this.seedColor,
    this.suiteApp,
  }) : assert(seedColor != null || suiteApp != null);

  /// Thème seed explicite (legacy).
  const CloudityThemedApp.forSuite({
    super.key,
    required this.title,
    required this.home,
    required ClouditySuiteApp suiteApp,
  })  : suiteApp = suiteApp,
        seedColor = null;

  final String title;
  final Color? seedColor;
  final ClouditySuiteApp? suiteApp;
  final Widget home;

  Color get effectiveSeedColor {
    if (seedColor != null) return seedColor!;
    if (suiteApp != null) return CloudityDesignTokens.seedColor(suiteApp!);
    return const Color(0xFF2563EB);
  }

  @override
  State<CloudityThemedApp> createState() => CloudityThemedAppState();
}

class CloudityThemedAppState extends State<CloudityThemedApp> {
  ThemeMode _mode = ThemeMode.system;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final mode = await CloudityThemePrefs.load();
    if (!mounted) return;
    setState(() => _mode = mode);
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    await CloudityThemePrefs.save(mode);
    if (!mounted) return;
    setState(() => _mode = mode);
  }

  ThemeMode get themeMode => _mode;

  @override
  Widget build(BuildContext context) {
    final seed = widget.effectiveSeedColor;
    return CloudityThemedAppScope(
      state: this,
      child: MaterialApp(
        title: widget.title,
        theme: CloudityAppThemes.light(seed),
        darkTheme: CloudityAppThemes.dark(seed),
        themeMode: _mode,
        home: widget.home,
      ),
    );
  }
}

/// Accès au cycle thème depuis les écrans Paramètres.
class CloudityThemedAppScope extends InheritedWidget {
  const CloudityThemedAppScope({
    super.key,
    required this.state,
    required super.child,
  });

  final CloudityThemedAppState state;

  static CloudityThemedAppState? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<CloudityThemedAppScope>()?.state;
  }

  @override
  bool updateShouldNotify(CloudityThemedAppScope oldWidget) => state != oldWidget.state;
}

/// Bouton cycle clair / sombre / système pour les écrans Paramètres.
class CloudityThemeModeTile extends StatelessWidget {
  const CloudityThemeModeTile({super.key, required this.mode, required this.onChanged});

  final ThemeMode mode;
  final ValueChanged<ThemeMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: const Icon(Icons.brightness_6_outlined),
      title: const Text('Thème'),
      subtitle: Text(_label(mode)),
      trailing: PopupMenuButton<ThemeMode>(
        onSelected: onChanged,
        itemBuilder: (context) => const [
          PopupMenuItem(value: ThemeMode.system, child: Text('Système')),
          PopupMenuItem(value: ThemeMode.light, child: Text('Clair')),
          PopupMenuItem(value: ThemeMode.dark, child: Text('Sombre')),
        ],
        child: const Icon(Icons.arrow_drop_down),
      ),
    );
  }

  String _label(ThemeMode mode) => switch (mode) {
    ThemeMode.light => 'Clair',
    ThemeMode.dark => 'Sombre',
    ThemeMode.system => 'Système',
  };
}
