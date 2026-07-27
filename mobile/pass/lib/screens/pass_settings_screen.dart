import 'package:flutter/material.dart';

import 'package:cloudity_shared/cloudity_shared.dart';

import '../auth/user_session.dart';

/// Paramètres Pass (presse-papier, TOTP, DAL, auto-lock) — sync compte.
class PassSettingsScreen extends StatefulWidget {
  const PassSettingsScreen({
    super.key,
    required this.session,
    this.onLogout,
  });

  final PassUserSession session;
  final VoidCallback? onLogout;

  @override
  State<PassSettingsScreen> createState() => _PassSettingsScreenState();
}

class _PassSettingsScreenState extends State<PassSettingsScreen> {
  UserPreferencesV1 _prefs = const UserPreferencesV1();
  bool _loading = true;
  bool _saving = false;
  String? _error;

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
      final api = UserPreferencesApi(
        gatewayBase: widget.session.api.baseUrl,
        accessToken: widget.session.accessToken,
      );
      final prefs = await api.syncToCache();
      if (!mounted) return;
      setState(() {
        _prefs = prefs;
        _loading = false;
      });
      await CloudityThemedAppScope.maybeOf(context)?.reloadTheme();
    } catch (e) {
      final cached = await UserPreferencesStore.loadCached();
      if (!mounted) return;
      setState(() {
        _prefs = cached;
        _loading = false;
        _error = 'Sync serveur impossible — préférences locales : $e';
      });
    }
  }

  Future<void> _savePass(PassAppSettings pass) async {
    setState(() => _saving = true);
    final next = _prefs.copyWith(pass: pass);
    await UserPreferencesStore.saveCached(next);
    setState(() => _prefs = next);
    try {
      final api = UserPreferencesApi(
        gatewayBase: widget.session.api.baseUrl,
        accessToken: widget.session.accessToken,
      );
      final merged = await api.update({'pass': pass.toJson()});
      if (!mounted) return;
      setState(() {
        _prefs = merged;
        _saving = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Enregistrement local OK — sync serveur : $e')),
      );
    }
  }

  Future<void> _saveTheme(ThemeMode mode) async {
    await CloudityThemedAppScope.maybeOf(context)?.setThemeMode(mode);
    final value = switch (mode) {
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
      ThemeMode.system => 'system',
    };
    final apps = Map<String, String>.from(_prefs.themeApps);
    apps['pass'] = value;
    final next = _prefs.copyWith(themeApps: apps);
    await UserPreferencesStore.saveCached(next);
    setState(() => _prefs = next);
    try {
      final api = UserPreferencesApi(
        gatewayBase: widget.session.api.baseUrl,
        accessToken: widget.session.accessToken,
      );
      final merged = await api.update({
        'theme': {'apps': apps},
      });
      if (!mounted) return;
      setState(() => _prefs = merged);
    } catch (_) {
      /* cache local déjà à jour */
    }
  }

  @override
  Widget build(BuildContext context) {
    final themeState = CloudityThemedAppScope.maybeOf(context);
    final pass = _prefs.pass;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Paramètres Pass'),
        actions: [
          if (_saving)
            const Padding(
              padding: EdgeInsets.all(16),
              child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ),
                if (themeState != null)
                  CloudityThemeModeTile(
                    mode: themeState.themeMode,
                    onChanged: _saveTheme,
                  ),
                const SizedBox(height: 8),
                Text('Presse-papier', style: Theme.of(context).textTheme.titleMedium),
                SwitchListTile(
                  title: const Text('Autoriser la copie'),
                  subtitle: const Text('Identifiant, mot de passe, codes TOTP'),
                  value: pass.clipboardEnabled,
                  onChanged: (v) => _savePass(pass.copyWith(clipboardEnabled: v)),
                ),
                ListTile(
                  title: const Text('Effacement automatique'),
                  subtitle: Text(_clipboardLabel(pass.clipboardClearMs)),
                  trailing: DropdownButton<int>(
                    value: _clipboardPreset(pass.clipboardClearMs),
                    items: const [
                      DropdownMenuItem(value: 0, child: Text('Désactivé')),
                      DropdownMenuItem(value: 15000, child: Text('15 s')),
                      DropdownMenuItem(value: 30000, child: Text('30 s')),
                      DropdownMenuItem(value: 60000, child: Text('1 min')),
                      DropdownMenuItem(value: 120000, child: Text('2 min')),
                    ],
                    onChanged: (v) {
                      if (v != null) _savePass(pass.copyWith(clipboardClearMs: v));
                    },
                  ),
                ),
                SwitchListTile(
                  title: const Text('Copier automatiquement le TOTP'),
                  subtitle: const Text('À chaque rotation du code 2FA'),
                  value: pass.totpAutoCopy,
                  onChanged: pass.clipboardEnabled
                      ? (v) => _savePass(pass.copyWith(totpAutoCopy: v))
                      : null,
                ),
                const Divider(height: 32),
                Text('Sécurité', style: Theme.of(context).textTheme.titleMedium),
                ListTile(
                  title: const Text('Verrouillage auto du coffre'),
                  subtitle: Text(_autoLockLabel(pass.autoLockMs)),
                  trailing: DropdownButton<int>(
                    value: _autoLockPreset(pass.autoLockMs),
                    items: const [
                      DropdownMenuItem(value: 0, child: Text('Jamais')),
                      DropdownMenuItem(value: 60000, child: Text('1 min')),
                      DropdownMenuItem(value: 300000, child: Text('5 min')),
                      DropdownMenuItem(value: 600000, child: Text('10 min')),
                      DropdownMenuItem(value: 900000, child: Text('15 min')),
                    ],
                    onChanged: (v) {
                      if (v != null) _savePass(pass.copyWith(autoLockMs: v));
                    },
                  ),
                ),
                SwitchListTile(
                  title: const Text('Digital Asset Links (Android)'),
                  subtitle: const Text('Autofill fiable site ↔ app — cf. doc DAL'),
                  value: pass.digitalAssetLinksEnabled,
                  onChanged: (v) => _savePass(pass.copyWith(digitalAssetLinksEnabled: v)),
                ),
                const Divider(height: 32),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.open_in_browser),
                    title: const Text('Ouvrir Pass sur le web'),
                    subtitle: Text('${widget.session.api.baseUrl}/app/pass'),
                  ),
                ),
                if (widget.onLogout != null) ...[
                  const SizedBox(height: 16),
                  FilledButton.tonalIcon(
                    onPressed: widget.onLogout,
                    icon: const Icon(Icons.logout),
                    label: const Text('Déconnexion'),
                  ),
                ],
              ],
            ),
    );
  }

  int _clipboardPreset(int ms) {
    const presets = [0, 15000, 30000, 60000, 120000];
    if (presets.contains(ms)) return ms;
    return 30000;
  }

  int _autoLockPreset(int ms) {
    const presets = [0, 60000, 300000, 600000, 900000];
    if (presets.contains(ms)) return ms;
    return 300000;
  }

  String _clipboardLabel(int ms) {
    if (ms <= 0) return 'Pas d\'effacement automatique';
    if (ms < 60000) return 'Après ${ms ~/ 1000} secondes';
    return 'Après ${ms ~/ 60000} minute(s)';
  }

  String _autoLockLabel(int ms) {
    if (ms <= 0) return 'Le coffre reste déverrouillé';
    if (ms < 60000) return 'Après ${ms ~/ 1000} s d\'inactivité';
    return 'Après ${ms ~/ 60000} min d\'inactivité';
  }
}
