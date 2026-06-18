import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
    required this.seedColor,
    required this.home,
  });

  final String title;
  final Color seedColor;
  final Widget home;

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

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: widget.title,
      theme: CloudityAppThemes.light(widget.seedColor),
      darkTheme: CloudityAppThemes.dark(widget.seedColor),
      themeMode: _mode,
      home: widget.home,
    );
  }
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
