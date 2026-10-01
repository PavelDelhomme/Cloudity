import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter/material.dart';

import 'cook_store.dart';
import 'mealdb.dart';

class CookHomeScreen extends StatefulWidget {
  const CookHomeScreen({
    super.key,
    required this.gatewayBase,
    required this.accessToken,
    required this.userEmail,
    required this.onLogout,
  });

  final String gatewayBase;
  final String accessToken;
  final String? userEmail;
  final Future<void> Function() onLogout;

  @override
  State<CookHomeScreen> createState() => _CookHomeScreenState();
}

class _CookHomeScreenState extends State<CookHomeScreen> {
  late final CookStore _store = CookStore(
    gatewayBase: widget.gatewayBase,
    accessToken: widget.accessToken,
  );
  CookData _data = CookData();
  bool _loading = true;
  bool _saving = false;
  String? _error;
  bool _showSettings = false;
  int _tab = 0;
  DateTime _planDay = DateTime.now();

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _store.load();
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _persist() async {
    setState(() => _saving = true);
    try {
      await _store.save(_data);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SuiteDrawerScaffold(
      currentApp: ClouditySuiteApp.cook,
      title: _showSettings ? 'Paramètres' : 'Hubera Cook',
      gatewayUrl: widget.gatewayBase,
      userEmail: widget.userEmail,
      showSettings: _showSettings,
      navItems: [
        ListTile(
          leading: const Icon(Icons.kitchen_outlined),
          title: const Text('Frigo'),
          selected: !_showSettings && _tab == 0,
          onTap: () {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _tab = 0;
            });
          },
        ),
        ListTile(
          leading: const Icon(Icons.menu_book_outlined),
          title: const Text('Recettes'),
          selected: !_showSettings && _tab == 1,
          onTap: () {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _tab = 1;
            });
          },
        ),
        ListTile(
          leading: const Icon(Icons.calendar_view_week_outlined),
          title: const Text('Planning'),
          selected: !_showSettings && _tab == 2,
          onTap: () {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _tab = 2;
            });
          },
        ),
        ListTile(
          leading: const Icon(Icons.shopping_cart_outlined),
          title: const Text('Courses'),
          selected: !_showSettings && _tab == 3,
          onTap: () {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _tab = 3;
            });
          },
        ),
      ],
      appBarActions: [
        if (_saving)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 12),
            child: SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        IconButton(icon: const Icon(Icons.refresh), onPressed: _reload),
      ],
      onOpenSettings: () => setState(() => _showSettings = true),
      onCloseSettings: () => setState(() => _showSettings = false),
      onLogout: widget.onLogout,
      settingsBody: SuiteSettingsPanel(
        gatewayUrl: widget.gatewayBase,
        appName: 'Hubera Cook',
        webAppPath: '/app/',
        onLogout: () => widget.onLogout(),
      ),
      floatingActionButton: _showSettings || _tab == 1
          ? null
          : FloatingActionButton(
              onPressed: switch (_tab) {
                0 => _addPantry,
                3 => _addShop,
                _ => _suggestPlan,
              },
              tooltip: _tab == 0
                  ? 'Ajouter au frigo'
                  : (_tab == 3 ? 'Ajouter à la liste' : 'Proposer des repas'),
              child: const Icon(Icons.add),
            ),
      body: _showSettings
          ? const SizedBox.shrink()
          : Column(
              children: [
                Expanded(child: _buildBody()),
                NavigationBar(
                  selectedIndex: _tab,
                  onDestinationSelected: (i) => setState(() => _tab = i),
                  destinations: const [
                    NavigationDestination(icon: Icon(Icons.kitchen_outlined), selectedIcon: Icon(Icons.kitchen), label: 'Frigo'),
                    NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'Recettes'),
                    NavigationDestination(icon: Icon(Icons.calendar_view_week_outlined), selectedIcon: Icon(Icons.calendar_view_week), label: 'Menu'),
                    NavigationDestination(icon: Icon(Icons.shopping_cart_outlined), selectedIcon: Icon(Icons.shopping_cart), label: 'Courses'),
                  ],
                ),
              ],
            ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return CloudityErrorBody(message: _error!, onRetry: _reload);
    }
    return IndexedStack(
      index: _tab,
      children: [
        _PantryTab(items: _data.pantry, onAdd: _addPantry, onRemove: _removePantry),
        _RecipesTab(
          pantry: _data.pantry,
          favorites: _data.favorites,
          onOpen: _openRecipe,
          onToggleFav: _toggleFav,
        ),
        _PlanTab(
          day: _planDay,
          data: _data,
          onDay: (d) => setState(() => _planDay = d),
          onPick: _pickMealForSlot,
          onClear: _clearSlot,
        ),
        _ShopTab(
          items: _data.shopping,
          onAdd: _addShop,
          onChanged: () {
            setState(() {});
            _persist();
          },
          onGenerate: _generateShopping,
        ),
      ],
    );
  }

  Future<void> _addPantry() async {
    final name = TextEditingController();
    final qty = TextEditingController();
    final unit = TextEditingController();
    final ok = await showSuiteModalBottomSheet<bool>(
      context: context,
      builder: (ctx) => Padding(
        padding: suiteBottomSheetPadding(ctx),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Ajouter au frigo', style: Theme.of(ctx).textTheme.titleMedium),
            const SizedBox(height: 12),
            TextField(
              controller: name,
              autofocus: true,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Ingrédient', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: qty,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Qté', border: OutlineInputBorder()),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: unit,
                    decoration: const InputDecoration(labelText: 'Unité', hintText: 'g, pcs…', border: OutlineInputBorder()),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, name.text.trim().isNotEmpty),
              child: const Text('Ajouter'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    setState(() {
      _data.pantry.add(CookPantryItem(
        id: cookNewId(),
        name: name.text.trim(),
        qty: qty.text.trim(),
        unit: unit.text.trim(),
      ));
    });
    await _persist();
  }

  Future<void> _removePantry(CookPantryItem item) async {
    setState(() => _data.pantry.removeWhere((e) => e.id == item.id));
    await _persist();
  }

  Future<void> _addShop() async {
    final name = TextEditingController();
    final ok = await showSuiteModalBottomSheet<bool>(
      context: context,
      builder: (ctx) => Padding(
        padding: suiteBottomSheetPadding(ctx),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Liste de courses', style: Theme.of(ctx).textTheme.titleMedium),
            const SizedBox(height: 12),
            TextField(
              controller: name,
              autofocus: true,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'À acheter', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, name.text.trim().isNotEmpty),
              child: const Text('Ajouter'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    setState(() {
      _data.shopping.add(CookShopItem(id: cookNewId(), name: name.text.trim()));
    });
    await _persist();
  }

  Future<void> _toggleFav(String id) async {
    setState(() {
      if (_data.favorites.contains(id)) {
        _data.favorites.remove(id);
      } else {
        _data.favorites.add(id);
      }
    });
    await _persist();
  }

  Future<void> _openRecipe(MealSummary meal, {String? slot}) async {
    final detail = await showDialog<MealDetail>(
      context: context,
      builder: (ctx) => _RecipeDialog(summary: meal),
    );
    if (detail == null || !mounted) return;
    if (slot != null) {
      _setSlot(slot, CookMeal(mealId: detail.id, title: detail.title, thumb: detail.thumb));
      return;
    }
    final choice = await showSuiteModalBottomSheet<String>(
      context: context,
      builder: (ctx) => Padding(
        padding: suiteBottomSheetPadding(ctx),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.wb_twilight_outlined),
              title: const Text('Petit-déjeuner'),
              onTap: () => Navigator.pop(ctx, 'breakfast'),
            ),
            ListTile(
              leading: const Icon(Icons.wb_sunny_outlined),
              title: const Text('Déjeuner'),
              onTap: () => Navigator.pop(ctx, 'lunch'),
            ),
            ListTile(
              leading: const Icon(Icons.nights_stay_outlined),
              title: const Text('Dîner'),
              onTap: () => Navigator.pop(ctx, 'dinner'),
            ),
            ListTile(
              leading: const Icon(Icons.shopping_cart_outlined),
              title: const Text('Ajouter les ingrédients aux courses'),
              onTap: () => Navigator.pop(ctx, 'shop'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    if (choice == 'shop') {
      setState(() {
        for (final ing in detail.ingredients) {
          final label = ing.measure.isEmpty ? ing.name : '${ing.measure} ${ing.name}';
          if (_data.shopping.any((s) => s.name.toLowerCase() == label.toLowerCase())) continue;
          _data.shopping.add(CookShopItem(id: cookNewId(), name: label));
        }
      });
      await _persist();
      return;
    }
    _setSlot(choice, CookMeal(mealId: detail.id, title: detail.title, thumb: detail.thumb));
  }

  void _setSlot(String slot, CookMeal meal) {
    final key = cookDayKey(_planDay);
    setState(() {
      _data.plan.putIfAbsent(key, () => {});
      _data.plan[key]![slot] = meal;
      _tab = 2;
    });
    _persist();
  }

  Future<void> _clearSlot(String slot) async {
    final key = cookDayKey(_planDay);
    setState(() => _data.plan[key]?.remove(slot));
    await _persist();
  }

  Future<void> _pickMealForSlot(String slot) async {
    final names = _data.pantry.map((e) => e.name).toList();
    List<MealSummary> list;
    try {
      list = names.isEmpty ? await mealDbRandomBatch() : await mealDbSuggestFromPantry(names);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      return;
    }
    if (!mounted) return;
    final picked = await showSuiteModalBottomSheet<MealSummary>(
      context: context,
      builder: (ctx) => Padding(
        padding: suiteBottomSheetPadding(ctx),
        child: SizedBox(
          height: 420,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Choisir un repas', style: Theme.of(ctx).textTheme.titleMedium),
              const SizedBox(height: 8),
              Expanded(
                child: ListView(
                  children: [
                    for (final m in list)
                      ListTile(
                        leading: m.thumb != null
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.network(m.thumb!, width: 44, height: 44, fit: BoxFit.cover),
                              )
                            : const Icon(Icons.restaurant),
                        title: Text(m.title),
                        onTap: () => Navigator.pop(ctx, m),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (picked != null) await _openRecipe(picked, slot: slot);
  }

  Future<void> _suggestPlan() async {
    await _pickMealForSlot('lunch');
  }

  Future<void> _generateShopping() async {
    final key = cookDayKey(_planDay);
    final day = _data.plan[key] ?? {};
    final pantryNames = _data.pantry.map((e) => e.name.toLowerCase()).toSet();
    for (final meal in day.values) {
      final id = meal.mealId;
      if (id == null || id.isEmpty) continue;
      final detail = await mealDbLookup(id);
      if (detail == null) continue;
      for (final ing in detail.ingredients) {
        if (pantryNames.any((p) => ing.name.toLowerCase().contains(p) || p.contains(ing.name.toLowerCase()))) {
          continue;
        }
        final label = ing.measure.isEmpty ? ing.name : '${ing.measure} ${ing.name}';
        if (_data.shopping.any((s) => s.name.toLowerCase() == label.toLowerCase())) continue;
        _data.shopping.add(CookShopItem(id: cookNewId(), name: label));
      }
    }
    setState(() {});
    await _persist();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Courses générées à partir du planning du jour (moins le frigo).')),
      );
    }
  }
}

class _PantryTab extends StatelessWidget {
  const _PantryTab({
    required this.items,
    required this.onAdd,
    required this.onRemove,
  });

  final List<CookPantryItem> items;
  final VoidCallback onAdd;
  final Future<void> Function(CookPantryItem) onRemove;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          Icon(Icons.kitchen_outlined, size: 56, color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.5)),
          const SizedBox(height: 12),
          Text('Frigo vide', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              'Ajoute ce que tu as : Hubera Cook propose ensuite des recettes et complète la liste de courses.',
              textAlign: TextAlign.center,
            ),
          ),
          Center(child: FilledButton.icon(onPressed: onAdd, icon: const Icon(Icons.add), label: const Text('Ajouter'))),
        ],
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.only(bottom: 88),
      itemCount: items.length,
      itemBuilder: (ctx, i) {
        final item = items[i];
        final qty = [item.qty, item.unit].where((s) => s.trim().isNotEmpty).join(' ');
        return ListTile(
          leading: const Icon(Icons.inventory_2_outlined),
          title: Text(item.name),
          subtitle: qty.isEmpty ? null : Text(qty),
          trailing: IconButton(
            icon: const Icon(Icons.delete_outline),
            onPressed: () => onRemove(item),
          ),
        );
      },
    );
  }
}

class _RecipesTab extends StatefulWidget {
  const _RecipesTab({
    required this.pantry,
    required this.favorites,
    required this.onOpen,
    required this.onToggleFav,
  });

  final List<CookPantryItem> pantry;
  final List<String> favorites;
  final Future<void> Function(MealSummary meal) onOpen;
  final Future<void> Function(String id) onToggleFav;

  @override
  State<_RecipesTab> createState() => _RecipesTabState();
}

class _RecipesTabState extends State<_RecipesTab> {
  final _query = TextEditingController();
  List<MealSummary> _meals = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadSuggested();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _loadSuggested() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final names = widget.pantry.map((e) => e.name).toList();
      final list = names.isEmpty ? await mealDbRandomBatch() : await mealDbSuggestFromPantry(names);
      if (!mounted) return;
      setState(() {
        _meals = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _search() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await mealDbSearch(_query.text);
      if (!mounted) return;
      setState(() {
        _meals = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: TextField(
            controller: _query,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _search(),
            decoration: InputDecoration(
              hintText: 'Chercher une recette…',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: IconButton(icon: const Icon(Icons.tune), onPressed: _loadSuggested, tooltip: 'Selon le frigo'),
              border: const OutlineInputBorder(),
              isDense: true,
            ),
          ),
        ),
        if (_loading) const LinearProgressIndicator(),
        if (_error != null)
          Padding(padding: const EdgeInsets.all(12), child: Text(_error!)),
        Expanded(
          child: _meals.isEmpty && !_loading
              ? const Center(child: Text('Aucune recette'))
              : GridView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 88),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    childAspectRatio: 0.78,
                  ),
                  itemCount: _meals.length,
                  itemBuilder: (ctx, i) {
                    final m = _meals[i];
                    final fav = widget.favorites.contains(m.id);
                    return Card(
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => widget.onOpen(m),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              child: m.thumb == null
                                  ? const ColoredBox(color: Color(0x11000000), child: Icon(Icons.restaurant))
                                  : Image.network(m.thumb!, fit: BoxFit.cover),
                            ),
                            Padding(
                              padding: const EdgeInsets.fromLTRB(8, 8, 0, 4),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(m.title, maxLines: 2, overflow: TextOverflow.ellipsis),
                                  ),
                                  IconButton(
                                    icon: Icon(fav ? Icons.favorite : Icons.favorite_border, size: 20),
                                    onPressed: () => widget.onToggleFav(m.id),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _PlanTab extends StatelessWidget {
  const _PlanTab({
    required this.day,
    required this.data,
    required this.onDay,
    required this.onPick,
    required this.onClear,
  });

  final DateTime day;
  final CookData data;
  final ValueChanged<DateTime> onDay;
  final Future<void> Function(String slot) onPick;
  final Future<void> Function(String slot) onClear;

  @override
  Widget build(BuildContext context) {
    final key = cookDayKey(day);
    final slots = data.plan[key] ?? {};
    Widget card(String slot, String label, IconData icon) {
      final meal = slots[slot];
      return Card(
        child: ListTile(
          leading: Icon(icon),
          title: Text(label),
          subtitle: Text(meal?.title?.trim().isNotEmpty == true ? meal!.title! : 'Rien de prévu'),
          trailing: meal?.isEmpty == false
              ? IconButton(icon: const Icon(Icons.close), onPressed: () => onClear(slot))
              : const Icon(Icons.add),
          onTap: () => onPick(slot),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 88),
      children: [
        Row(
          children: [
            IconButton(
              onPressed: () => onDay(day.subtract(const Duration(days: 1))),
              icon: const Icon(Icons.chevron_left),
            ),
            Expanded(
              child: Text(
                '${day.day.toString().padLeft(2, '0')}/${day.month.toString().padLeft(2, '0')}/${day.year}',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            IconButton(
              onPressed: () => onDay(day.add(const Duration(days: 1))),
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
        const SizedBox(height: 8),
        card('breakfast', 'Petit-déjeuner', Icons.wb_twilight_outlined),
        card('lunch', 'Déjeuner', Icons.wb_sunny_outlined),
        card('dinner', 'Dîner', Icons.nights_stay_outlined),
        const SizedBox(height: 12),
        Text(
          'Les recettes programmées se synchronisent avec ton compte Hubera ID. '
          'La liste de courses se complète à partir du planning, moins ce que tu as déjà au frigo.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _ShopTab extends StatelessWidget {
  const _ShopTab({
    required this.items,
    required this.onAdd,
    required this.onChanged,
    required this.onGenerate,
  });

  final List<CookShopItem> items;
  final VoidCallback onAdd;
  final VoidCallback onChanged;
  final Future<void> Function() onGenerate;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: OutlinedButton.icon(
            onPressed: onGenerate,
            icon: const Icon(Icons.auto_awesome),
            label: const Text('Générer depuis le planning du jour'),
          ),
        ),
        Expanded(
          child: items.isEmpty
              ? ListView(
                  children: const [
                    SizedBox(height: 80),
                    Center(child: Text('Liste de courses vide')),
                  ],
                )
              : ListView.builder(
                  padding: const EdgeInsets.only(bottom: 88),
                  itemCount: items.length,
                  itemBuilder: (ctx, i) {
                    final item = items[i];
                    return CheckboxListTile(
                      value: item.done,
                      title: Text(
                        item.name,
                        style: TextStyle(
                          decoration: item.done ? TextDecoration.lineThrough : null,
                        ),
                      ),
                      onChanged: (v) {
                        item.done = v ?? false;
                        onChanged();
                      },
                      secondary: IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          items.removeAt(i);
                          onChanged();
                        },
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _RecipeDialog extends StatefulWidget {
  const _RecipeDialog({required this.summary});
  final MealSummary summary;

  @override
  State<_RecipeDialog> createState() => _RecipeDialogState();
}

class _RecipeDialogState extends State<_RecipeDialog> {
  MealDetail? _detail;
  String? _error;

  @override
  void initState() {
    super.initState();
    mealDbLookup(widget.summary.id).then((d) {
      if (!mounted) return;
      setState(() {
        _detail = d;
        if (d == null) _error = 'Recette introuvable';
      });
    }).catchError((e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    });
  }

  @override
  Widget build(BuildContext context) {
    final d = _detail;
    return AlertDialog(
      title: Text(widget.summary.title),
      content: SizedBox(
        width: 420,
        child: d == null
            ? SizedBox(
                height: 120,
                child: _error != null ? Text(_error!) : const Center(child: CircularProgressIndicator()),
              )
            : SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (d.thumb != null)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.network(d.thumb!),
                      ),
                    if (d.category != null || d.area != null) ...[
                      const SizedBox(height: 8),
                      Text([d.category, d.area].whereType<String>().join(' · ')),
                    ],
                    const SizedBox(height: 12),
                    Text('Ingrédients', style: Theme.of(context).textTheme.titleSmall),
                    for (final ing in d.ingredients)
                      Text('• ${ing.measure.isEmpty ? ing.name : '${ing.measure} ${ing.name}'}'),
                    const SizedBox(height: 12),
                    Text('Préparation', style: Theme.of(context).textTheme.titleSmall),
                    Text(d.instructions),
                  ],
                ),
              ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Fermer')),
        if (d != null)
          FilledButton(onPressed: () => Navigator.pop(context, d), child: const Text('Utiliser')),
      ],
    );
  }
}
