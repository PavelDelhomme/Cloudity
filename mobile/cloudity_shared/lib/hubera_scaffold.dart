import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

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
        HuberaProduct.docs => const ['cloud.hubera.docs'],
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
  await launchUrl(app.webUri, mode: LaunchMode.externalApplication);
}

class HuberaAccountAvatar extends StatelessWidget {
  const HuberaAccountAvatar({super.key, required this.onTap, this.email, this.radius = 16});

  final VoidCallback onTap;
  final String? email;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final letter = (email != null && email!.trim().isNotEmpty)
        ? email!.trim()[0].toUpperCase()
        : 'H';
    return IconButton(
      tooltip: 'Compte',
      onPressed: onTap,
      icon: CircleAvatar(
        radius: radius,
        backgroundColor: huberaTeal.withValues(alpha: 0.15),
        foregroundColor: huberaTeal,
        child: Text(letter, style: const TextStyle(fontWeight: FontWeight.w800)),
      ),
    );
  }
}

class HuberaAppSwitcher extends StatelessWidget {
  const HuberaAppSwitcher({super.key, this.current});

  final HuberaProduct? current;

  @override
  Widget build(BuildContext context) {
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
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView(
                children: [
                  ...navItems,
                  const Divider(height: 1),
                  HuberaAppSwitcher(current: current),
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        centerTitle: false,
        actions: [
          ...appBarActions,
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
      body: body,
      floatingActionButton: floatingActionButton,
      bottomNavigationBar: bottomDestinations.isEmpty
          ? null
          : NavigationBar(
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
    );
  }
}
