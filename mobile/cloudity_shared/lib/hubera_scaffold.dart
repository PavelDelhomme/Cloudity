import 'dart:math' as math;
import 'package:cloudity_auth_broker/cloudity_auth_broker.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'auth/hubera_account_prompt.dart';

MediaQueryData huberaSafeMedia(BuildContext context) {
  final mq = MediaQuery.of(context);
  final p = mq.padding;
  final v = mq.viewPadding;
  return mq.copyWith(
    padding: EdgeInsets.only(
      left: math.max(p.left, v.left),
      top: math.max(p.top, v.top),
      right: math.max(p.right, v.right),
      bottom: math.max(p.bottom, v.bottom),
    ),
  );
}

const Color huberaTeal = Color(0xFF0E4D5C);
const Color huberaOrange = Color(0xFFC9782A);

class HuberaNavDest {
  const HuberaNavDest({required this.id, required this.label, required this.icon});
  final String id;
  final String label;
  final IconData icon;
}

enum HuberaProduct {
  music,
  maps,
  fuel,
  docs,
  calendar,
  drive,
  mail,
  pass,
  jobs,
  id,
}

extension HuberaProductMeta on HuberaProduct {
  String get title => switch (this) {
        HuberaProduct.music => 'Music',
        HuberaProduct.maps => 'Maps',
        HuberaProduct.fuel => 'Fuel',
        HuberaProduct.docs => 'Docs',
        HuberaProduct.calendar => 'Agenda',
        HuberaProduct.drive => 'Drive',
        HuberaProduct.mail => 'Mail',
        HuberaProduct.pass => 'Pass',
        HuberaProduct.jobs => 'Jobs',
        HuberaProduct.id => 'ID',
      };

  String get host => switch (this) {
        HuberaProduct.music => 'music.hubera.cloud',
        HuberaProduct.maps => 'maps.hubera.cloud',
        HuberaProduct.fuel => 'fuel.hubera.cloud',
        HuberaProduct.docs => 'docs.hubera.cloud',
        HuberaProduct.calendar => 'calendar.hubera.cloud',
        HuberaProduct.drive => 'drive.hubera.cloud',
        HuberaProduct.mail => 'mail.hubera.cloud',
        HuberaProduct.pass => 'pass.hubera.cloud',
        HuberaProduct.jobs => 'jobs.hubera.cloud',
        HuberaProduct.id => 'id.hubera.cloud',
      };

  List<String> get androidPackages => switch (this) {
        HuberaProduct.music => const ['cloud.hubera.music', 'ovh.delhomme.ytmusic'],
        HuberaProduct.maps => const ['cloud.hubera.maps', 'ovh.delhomme.maps'],
        HuberaProduct.fuel => const ['cloud.hubera.fuel', 'com.gasoiltracking.app'],
        HuberaProduct.docs => const ['cloud.hubera.docs', 'ovh.delhomme.hubera.docs'],
        HuberaProduct.calendar => const ['cloud.hubera.calendar'],
        HuberaProduct.drive => const ['cloud.hubera.drive'],
        HuberaProduct.mail => const ['cloud.hubera.mail'],
        HuberaProduct.pass => const ['cloud.hubera.pass'],
        HuberaProduct.jobs => const ['cloud.hubera.jobs'],
        HuberaProduct.id => const ['cloud.hubera.id'],
      };

  IconData get icon => switch (this) {
        HuberaProduct.music => Icons.music_note_outlined,
        HuberaProduct.maps => Icons.map_outlined,
        HuberaProduct.fuel => Icons.directions_car_outlined,
        HuberaProduct.docs => Icons.menu_book_outlined,
        HuberaProduct.calendar => Icons.calendar_month_outlined,
        HuberaProduct.drive => Icons.folder_outlined,
        HuberaProduct.mail => Icons.mail_outline,
        HuberaProduct.pass => Icons.lock_outline,
        HuberaProduct.jobs => Icons.work_outline,
        HuberaProduct.id => Icons.person_outline,
      };

  Uri get webUri => Uri.parse('https://$host');
}

Future<void> openHuberaProduct(HuberaProduct app) async {
  for (final pkg in app.androidPackages) {
    final uri = Uri.parse(
      'intent:#Intent;action=android.intent.action.MAIN;'
      'category=android.intent.category.LAUNCHER;'
      'package=$pkg;end',
    );
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    } catch (_) {
      /* paquet absent */
    }
  }
  if (app != HuberaProduct.maps) {
  if (app != HuberaProduct.maps) {
  if (app != HuberaProduct.maps) {
  if (app != HuberaProduct.maps) {
  if (app != HuberaProduct.maps) {
  if (app != HuberaProduct.maps) {
    try {
      if (await launchUrl(Uri.parse('hubera-${app.name}://open'), mode: LaunchMode.externalApplication)) {
        return;
      }
    } catch (_) {
      /* schéma absent */
    }
  }
  }
  }
  }
  }
  }
  await launchUrl(app.webUri, mode: LaunchMode.externalApplication);
}

class HuberaAccountAvatar extends StatefulWidget {
  const HuberaAccountAvatar({
    super.key,
    required this.onTap,
    this.email,
    this.radius = 16,
    this.onOpenSettings,
    this.onOpenHuberaId,
    this.onAddAccount,
    this.showHuberaId = true,
    this.showAppSettings = true,
  });

  final VoidCallback onTap;
  final String? email;
  final double radius;
  /// Réglages **de cette app** (pas Hubera ID).
  final VoidCallback? onOpenSettings;
  final VoidCallback? onOpenHuberaId;
  final VoidCallback? onAddAccount;

  /// Défaut vrai : les autres apps gardent le lien Hubera ID.
  /// Contacts le coupe : ce n’est pas un réglage du carnet.
  final bool showHuberaId;

  /// Défaut vrai. Agenda le coupe : un seul « Paramètres », celui du drawer.
  final bool showAppSettings;

  @override
  State<HuberaAccountAvatar> createState() => _HuberaAccountAvatarState();
}

class _HuberaAccountAvatarState extends State<HuberaAccountAvatar> {
  List<String> _emails = const [];

  @override
  void initState() {
    super.initState();
    _emails = _knownEmails(widget.email, const []);
    _loadAccounts();
  }

  @override
  void didUpdateWidget(HuberaAccountAvatar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.email != widget.email) {
      _emails = _knownEmails(widget.email, _emails);
    }
  }

  static List<String> _knownEmails(String? current, List<String> extra) {
    final seen = <String>{};
    final emails = <String>[];
    void add(String? raw) {
      final mail = raw?.trim() ?? '';
      if (mail.isEmpty || !seen.add(mail.toLowerCase())) return;
      emails.add(mail);
    }

    add(current);
    for (final mail in extra) {
      add(mail);
    }
    return emails;
  }

  Future<void> _loadAccounts() async {
    final broker = <String>[];
    try {
      for (final account in await CloudityAuthBroker.listAccounts()) {
        broker.add(account.email);
      }
    } catch (_) {}
    if (!mounted) return;
    setState(() => _emails = _knownEmails(widget.email, broker));
  }

  @override
  Widget build(BuildContext context) {
    final email = widget.email;
    final onTap = widget.onTap;
    final radius = widget.radius;
    final onOpenSettings = widget.onOpenSettings;
    final onOpenHuberaId = widget.onOpenHuberaId;
    final onAddAccount = widget.onAddAccount;
    final showHuberaId = widget.showHuberaId;
    final showAppSettings = widget.showAppSettings;
    final letter = (email != null && email!.trim().isNotEmpty)
        ? email!.trim()[0].toUpperCase()
        : 'H';
    final avatar = CircleAvatar(
      radius: radius,
      backgroundColor: huberaTeal.withValues(alpha: 0.15),
      foregroundColor: huberaTeal,
      child: Text(letter, style: const TextStyle(fontWeight: FontWeight.w800)),
    );
    return PopupMenuButton<String>(
      tooltip: 'Compte',
      offset: const Offset(0, 40),
      onOpened: () {
        _loadAccounts();
      },
      onSelected: (v) {
        if (v.startsWith('account:')) {
          HuberaAccountSwitch.requestChooser();
          return;
        }
        switch (v) {
          case 'settings':
            (onOpenSettings ?? onTap)();
          case 'choose':
          case 'add':
            HuberaAccountSwitch.requestChooser();
          case 'id':
            (onOpenHuberaId ?? onTap)();
        }
      },
      itemBuilder: (ctx) => [
        for (final mail in _emails)
          PopupMenuItem(
            value: 'account:$mail',
            child: ListTile(
              dense: true,
              leading: const Icon(Icons.account_circle_outlined),
              title: Text(mail, maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: const Text('Compte Hubera ID'),
            ),
          ),
        if (showAppSettings)
          PopupMenuItem(
            value: 'settings',
            child: ListTile(
              dense: true,
              leading: const Icon(Icons.settings_outlined),
              title: const Text('Réglages de cette app'),
            ),
          ),
        const PopupMenuItem(
          value: 'choose',
          child: ListTile(
            dense: true,
            leading: Icon(Icons.switch_account_outlined),
            title: Text('Choisir un compte'),
          ),
        ),
        const PopupMenuItem(
          value: 'add',
          child: ListTile(
            dense: true,
            leading: Icon(Icons.person_add_outlined),
            title: Text('Ajouter un compte'),
          ),
        ),
        if (showHuberaId)
          const PopupMenuItem(
            value: 'id',
            child: ListTile(
              dense: true,
              leading: Icon(Icons.privacy_tip_outlined),
              title: Text('Hubera ID · confidentialité'),
            ),
          ),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: avatar,
      ),
    );
  }
}

class HuberaAppSwitcher extends StatelessWidget {
  const HuberaAppSwitcher({super.key, this.current, this.showApps = true});

  final HuberaProduct? current;

  /// Défaut vrai : les autres apps gardent la grille. Mail passe faux.
  final bool showApps;

  @override
  Widget build(BuildContext context) {
    if (!showApps) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Apps Hubera', style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 8),
          GridView.count(
            crossAxisCount: 4,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 0.85,
            children: [
              for (final app in HuberaProduct.values)
                Material(
                  color: app == current
                      ? huberaTeal.withValues(alpha: 0.12)
                      : Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: app == current ? null : () => openHuberaProduct(app),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(app.icon, color: huberaTeal, size: 22),
                        const SizedBox(height: 4),
                        Text(
                          app.title,
                          style: Theme.of(context).textTheme.labelSmall,
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class HuberaDrawerBody extends StatelessWidget {
  const HuberaDrawerBody({
    super.key,
    required this.current,
    required this.versionLabel,
    required this.onAccountTap,
    this.userEmail,
    this.navItems = const [],
    this.footer,
  });

  final HuberaProduct current;
  final String versionLabel;
  final VoidCallback onAccountTap;
  final String? userEmail;
  final List<Widget> navItems;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return Drawer(
      child: SafeArea(
        child: Column(
          children: [
            Container(height: 4, color: huberaOrange),
            ListTile(
              leading: CircleAvatar(
                backgroundColor: huberaTeal.withValues(alpha: 0.15),
                foregroundColor: huberaTeal,
                child: Icon(current.icon),
              ),
              title: Text('Hubera ${current.title}', style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(
                userEmail?.trim().isNotEmpty == true ? userEmail!.trim() : 'Compte Hubera',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: IconButton(
                tooltip: 'Fermer le menu',
                onPressed: () {
                  final nav = Navigator.of(context);
                  if (nav.canPop()) nav.pop();
                },
                icon: const Icon(Icons.close),
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView(
                children: [
                  ...navItems,
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.person_outline),
                    title: const Text('Compte'),
                    onTap: () {
                      Navigator.pop(context);
                      onAccountTap();
                    },
                  ),
                  ListTile(
                    leading: const Icon(Icons.info_outline),
                    title: Text(versionLabel),
                    dense: true,
                  ),
                ],
              ),
            ),
            if (footer != null) footer!,
          ],
        ),
      ),
    );
  }
}

/// Glissement cumulé depuis le bord gauche : ouvre le tiroir.
bool huberaEdgeOpensDrawer({required double drag, required bool drawerOpen}) =>
    !drawerOpen && drag > 12;

class _EdgeDrawer extends StatefulWidget {
  const _EdgeDrawer({required this.child});

  final Widget child;

  @override
  State<_EdgeDrawer> createState() => _EdgeDrawerState();
}

class _EdgeDrawerState extends State<_EdgeDrawer> {
  double _drag = 0;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        Positioned(
          left: 0,
          top: 0,
          bottom: 0,
          width: 28,
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onHorizontalDragStart: (_) => _drag = 0,
            onHorizontalDragUpdate: (details) {
              _drag += details.delta.dx;
              final scaffold = Scaffold.maybeOf(context);
              if (scaffold == null) return;
              if (!huberaEdgeOpensDrawer(drag: _drag, drawerOpen: scaffold.isDrawerOpen)) {
                return;
              }
              scaffold.openDrawer();
              _drag = 0;
            },
            onHorizontalDragEnd: (_) => _drag = 0,
          ),
        ),
      ],
    );
  }
}

/// Scaffold suite : hamburger · titre · compte · drawer · nav bas.
class HuberaScaffold extends StatelessWidget {
  const HuberaScaffold({
    super.key,
    required this.title,
    required this.current,
    required this.versionLabel,
    required this.body,
    required this.onAccountTap,
    this.userEmail,
    this.navItems = const [],
    this.appBarActions = const [],
    this.bottomDestinations = const [],
    this.selectedBottomId,
    this.onBottomSelected,
    this.floatingActionButton,
    this.drawerFooter,
    this.showHuberaApps = true,
  });

  final String title;
  final HuberaProduct current;
  final String versionLabel;
  final Widget body;
  final VoidCallback onAccountTap;
  final String? userEmail;
  final List<Widget> navItems;
  final List<Widget> appBarActions;
  final List<HuberaNavDest> bottomDestinations;
  final String? selectedBottomId;
  final ValueChanged<String>? onBottomSelected;
  final Widget? floatingActionButton;
  final Widget? drawerFooter;

  /// Défaut vrai : les autres apps gardent la grille. Pass le coupe.
  final bool showHuberaApps;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: AppBar(
          title: Text(title),
          centerTitle: false,
          actions: [
            ...appBarActions,
            if (showHuberaApps)
              IconButton(
                tooltip: 'Apps Hubera',
                onPressed: () {
                  showModalBottomSheet<void>(
                    context: context,
                    builder: (_) => SafeArea(
                      child: HuberaAppSwitcher(current: current),
                    ),
                  );
                },
                icon: const Icon(Icons.apps),
              ),
            HuberaAccountAvatar(onTap: onAccountTap, email: userEmail),
          ],
        ),
        drawer: HuberaDrawerBody(
          current: current,
          versionLabel: versionLabel,
          onAccountTap: onAccountTap,
          userEmail: userEmail,
          navItems: navItems,
          footer: drawerFooter,
        ),
        drawerEnableOpenDragGesture: true,
        drawerEdgeDragWidth: 28,
        body: _EdgeDrawer(child: body),
        floatingActionButton: floatingActionButton,
        bottomNavigationBar: bottomDestinations.isEmpty
            ? null
            : Padding(
                padding: EdgeInsets.only(bottom: MediaQuery.viewPaddingOf(context).bottom),
                child: NavigationBar(
                  height: 64,
                  selectedIndex: () {
                    final i = bottomDestinations.indexWhere((d) => d.id == selectedBottomId);
                    return i < 0 ? 0 : i;
                  }(),
                  onDestinationSelected: (i) => onBottomSelected?.call(bottomDestinations[i].id),
                  destinations: [
                    for (final d in bottomDestinations)
                      NavigationDestination(icon: Icon(d.icon), label: d.label),
                  ],
                ),
              ),
    );
  }
}
