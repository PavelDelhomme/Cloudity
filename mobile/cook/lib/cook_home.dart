import 'dart:async';

import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter/material.dart';

import 'cook_ingredient_fields.dart';
import 'cook_recipe.dart';
import 'cook_store.dart';
import 'cook_translate.dart';
import 'ingredient_photo.dart';
import 'mealdb.dart';

class CookHomeScreen extends StatefulWidget {
  const CookHomeScreen({
    super.key,
    required this.gatewayBase,
    required this.accessToken,
    required this.userEmail,
    required this.onLogout,
    this.refreshAccess,
  });

  final String gatewayBase;
  final String accessToken;
  final String? userEmail;
  final Future<void> Function() onLogout;

  /// Renouvelle le jeton. `null` ou vide = session morte.
  final Future<String?> Function()? refreshAccess;

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
  bool _favoritesOnly = false;
  DateTime _planDay = DateTime.now();

  @override
  void initState() {
    super.initState();
    cookLoadUserFixes();
    _reload();
  }

  Future<void> _reload() async {
    final cached = await CookStore.readCache();
    if (!mounted) return;
    setState(() {
      if (cached != null) _data = cached;
      _loading = cached == null;
      _error = null;
    });
    try {
      if (_store.accessToken.trim().isEmpty && widget.refreshAccess != null) {
        final next = await widget.refreshAccess!();
        if (next != null && next.trim().isNotEmpty) {
          _store.accessToken = next.trim();
        }
      }
      final result = await _store.load(refresh: widget.refreshAccess);
      if (!mounted) return;
      setState(() {
        _data = result.data;
        _loading = false;
        _error = null;
      });
      if (result.needsAccount) HuberaAccountSwitch.requestChooser();
    } on CookSessionRejected {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = null;
      });
      HuberaAccountSwitch.requestChooser();
    } catch (e) {
      if (!mounted) return;
      final text = e.toString();
      if (text.contains('(401)')) {
        setState(() {
          _loading = false;
          _error = null;
        });
        HuberaAccountSwitch.requestChooser();
        return;
      }
      if (cached != null) {
        setState(() => _loading = false);
        return;
      }
      setState(() {
        _error = text;
        _loading = false;
      });
    }
  }

  Future<void> _persist() async {
    setState(() => _saving = true);
    try {
      await _store.save(_data);
    } on CookSessionRejected {
      if (mounted) HuberaAccountSwitch.requestChooser();
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
          selected: !_showSettings && _tab == 1 && !_favoritesOnly,
          onTap: () {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _favoritesOnly = false;
              _tab = 1;
            });
          },
        ),
        ListTile(
          leading: const Icon(Icons.favorite_outline),
          title: const Text('Favoris'),
          selected: !_showSettings && _tab == 1 && _favoritesOnly,
          onTap: () {
            Navigator.pop(context);
            setState(() {
              _showSettings = false;
              _favoritesOnly = true;
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
      onCloseSettings: () => setState(() {
        _showSettings = false;
        _tab = cookTabAfterSettingsBack();
      }),
      onConsumeBack: () {
        if (_showSettings) {
          setState(() {
            _showSettings = false;
            _tab = cookTabAfterSettingsBack();
          });
          return true;
        }
        final next = cookTabAfterSystemBack(_tab);
        if (next == null) return false;
        setState(() => _tab = next);
        return true;
      },
      onLogout: widget.onLogout,
      showAppSwitcher: false,
      showHuberaIdLink: false,
      flushBottomBar: true,
      fabClearance: 72,
      settingsBody: SuiteSettingsPanel(
        gatewayUrl: widget.gatewayBase,
        appName: 'Cook',
        webAppPath: '/app/',
        ownAppSettings: true,
        accountEmail: widget.userEmail,
        onCheckUpdate: () => cloudityCheckUpdateManually(
          context,
          gatewayBase: widget.gatewayBase,
          appSlug: ClouditySuiteApp.cook.otaAppSlug,
          appName: 'Hubera Cook',
          huberaHost: ClouditySuiteApp.cook.huberaHost,
        ),
        onLogout: () => widget.onLogout(),
      ),
      selectedBottomId: '$_tab',
      onBottomSelected: (id) => setState(() => _tab = int.tryParse(id) ?? 0),
      bottomDestinations: const [
        HuberaNavDest(id: '0', label: 'Frigo', icon: Icons.kitchen_outlined),
        HuberaNavDest(id: '1', label: 'Recettes', icon: Icons.menu_book_outlined),
        HuberaNavDest(id: '2', label: 'Menu', icon: Icons.calendar_view_week_outlined),
        HuberaNavDest(id: '3', label: 'Courses', icon: Icons.shopping_cart_outlined),
      ],
      floatingActionButton: cookFabHandlesTap(settings: _showSettings, tab: _tab)
          ? FloatingActionButton(
              heroTag: 'cook-list-fab',
              onPressed: switch (_tab) {
                0 => _addPantry,
                1 => _openRecipeSearch,
                3 => _addShop,
                _ => _suggestPlan,
              },
              tooltip: switch (_tab) {
                0 => 'Ajouter au frigo',
                1 => 'Chercher une recette',
                3 => 'Ajouter à la liste',
                _ => 'Proposer des repas',
              },
              child: Icon(_tab == 1 ? Icons.search : Icons.add),
            )
          : null,
      body: _showSettings ? const SizedBox.shrink() : _buildBody(),
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
        _PantryTab(
          items: _data.pantry,
          onAdd: _addPantry,
          onEdit: _editPantry,
          onRemove: _removePantry,
        ),
        _RecipesTab(
          pantry: _data.pantry,
          favorites: _data.favorites,
          favoritesOnly: _favoritesOnly,
          onOpen: _openRecipe,
          onToggleFav: _toggleFav,
        ),
        _PlanTab(
          day: _planDay,
          data: _data,
          onDay: (d) => setState(() => _planDay = d),
          onPick: _pickMealForSlot,
          onClear: _clearMeal,
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

  List<String> get _knownUnits => [for (final item in _data.pantry) item.unit];

  Future<CookIngredientDraft?> _askIngredient({
    required String title,
    required String confirm,
    String name = '',
    String qty = '',
    String unit = '',
    bool focusQty = false,
    bool opened = false,
    String openedOn = '',
    int keepDays = 0,
    String bestBefore = '',
  }) {
    final nameCtrl = TextEditingController(text: name);
    final qtyCtrl = TextEditingController(text: qty);
    final unitCtrl = TextEditingController(text: unit);
    final openedOnCtrl = TextEditingController(text: openedOn);
    final keepCtrl = TextEditingController(text: keepDays > 0 ? '$keepDays' : '');
    final bestCtrl = TextEditingController(text: bestBefore);
    var openedNow = opened;
    return showSuiteModalBottomSheet<CookIngredientDraft>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => Padding(
          padding: suiteBottomSheetPadding(ctx),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(title, style: Theme.of(ctx).textTheme.titleMedium),
                const SizedBox(height: 12),
                CookIngredientFields(
                  name: nameCtrl,
                  qty: qtyCtrl,
                  unit: unitCtrl,
                  knownUnits: _knownUnits,
                  focusQty: focusQty,
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Produit ouvert'),
                  subtitle: const Text('Une crème fraîche ouverte se garde quelques jours.'),
                  value: openedNow,
                  onChanged: (v) {
                    setLocal(() {
                      openedNow = v;
                      if (v && openedOnCtrl.text.trim().isEmpty) {
                        openedOnCtrl.text = cookDayKey(DateTime.now());
                      }
                    });
                  },
                ),
                if (openedNow) ...[
                  TextField(
                    controller: openedOnCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Ouvert le (aaaa-mm-jj)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: keepCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Se garde encore (jours)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ] else
                  TextField(
                    controller: bestCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Date limite (aaaa-mm-jj)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () {
                    final trimmed = nameCtrl.text.trim();
                    if (trimmed.isEmpty) return;
                    Navigator.pop(
                      ctx,
                      CookIngredientDraft(
                        name: trimmed,
                        qty: qtyCtrl.text.trim(),
                        unit: unitCtrl.text.trim(),
                        opened: openedNow,
                        openedOn: openedOnCtrl.text.trim(),
                        keepDays: int.tryParse(keepCtrl.text.trim()) ?? 0,
                        bestBefore: bestCtrl.text.trim(),
                      ),
                    );
                  },
                  child: Text(confirm),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _addPantry() async {
    final draft = await _askIngredient(title: 'Ajouter au frigo', confirm: 'Ajouter');
    if (draft == null) return;
    setState(() {
      _data.pantry.add(CookPantryItem(
        id: cookNewId(),
        name: draft.name,
        qty: draft.qty,
        unit: draft.unit,
        opened: draft.opened,
        openedOn: draft.openedOn,
        keepDays: draft.keepDays,
        bestBefore: draft.bestBefore,
      ));
    });
    await _persist();
  }

  Future<void> _editPantry(CookPantryItem item) async {
    final draft = await _askIngredient(
      title: 'Modifier la quantité',
      confirm: 'Enregistrer',
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      focusQty: true,
      opened: item.opened,
      openedOn: item.openedOn,
      keepDays: item.keepDays,
      bestBefore: item.bestBefore,
    );
    if (draft == null) return;
    setState(() {
      item.name = draft.name;
      item.qty = draft.qty;
      item.unit = draft.unit;
      item.opened = draft.opened;
      item.openedOn = draft.openedOn;
      item.keepDays = draft.keepDays;
      item.bestBefore = draft.bestBefore;
    });
    await _persist();
  }

  Future<void> _removePantry(CookPantryItem item) async {
    setState(() => _data.pantry.removeWhere((e) => e.id == item.id));
    await _persist();
  }

  Future<void> _addShop() async {
    final name = TextEditingController();
    var other = false;
    final ok = await showSuiteModalBottomSheet<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => Padding(
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
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Pas alimentaire'),
                subtitle: const Text('Reste dans la liste, le planning ne l’efface pas.'),
                value: other,
                onChanged: (v) => setLocal(() => other = v),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, name.text.trim().isNotEmpty),
                child: const Text('Ajouter'),
              ),
            ],
          ),
        ),
      ),
    );
    if (ok != true) return;
    setState(() {
      _data.shopping.add(CookShopItem(
        id: cookNewId(),
        name: name.text.trim(),
        kind: other ? 'other' : 'food',
      ));
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

  Future<void> _toggleWant(String id) async {
    setState(() {
      if (_data.wanted.contains(id)) {
        _data.wanted.remove(id);
      } else {
        _data.wanted.add(id);
      }
    });
    await _persist();
  }

  Future<void> _openRecipe(MealSummary meal, {String? slot}) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (ctx) => CookRecipePage(
          summary: meal,
          pantry: _data.pantry,
          favorite: _data.favorites.contains(meal.id),
          wanted: _data.wanted.contains(meal.id),
          suggestedSlot: slot,
          onToggleFav: () => _toggleFav(meal.id),
          onToggleWant: () => _toggleWant(meal.id),
          onSchedule: (chosen, detail) => _appendMeal(chosen, detail),
          onShop: _shopFromDetail,
        ),
      ),
    );
  }

  Future<void> _appendMeal(String slot, MealDetail detail) async {
    final key = cookDayKey(_planDay);
    setState(() {
      cookAppendMeal(
        _data.plan,
        key,
        slot,
        CookMeal(
          mealId: detail.id,
          title: cookToFrenchLearned(detail.title),
          thumb: detail.thumb,
        ),
      );
    });
    await _persist();
  }

  Future<void> _shopFromDetail(MealDetail detail) async {
    final needs = cookNeedsForIngredients(
      ingredients: detail.ingredients,
      pantry: _data.pantry,
      existing: _data.shopping,
      today: DateTime.now(),
    );
    setState(() {
      for (var i = 0; i < needs.length; i++) {
        final need = needs[i];
        _data.shopping.add(CookShopItem(
          id: '${cookNewId()}-$i',
          name: need.label,
          ingredient: need.ingredient,
          qty: need.qty,
          unit: need.unit,
          kind: 'food',
        ));
      }
    });
    await _persist();
  }

  Future<void> _clearMeal(String slot, CookMeal meal) async {
    final key = cookDayKey(_planDay);
    setState(() => _data.plan[key]?[slot]?.remove(meal));
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
                        title: CookFrenchText(source: m.title),
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

  Future<void> _openRecipeSearch() async {
    setState(() => _tab = 1);
    final query = TextEditingController();
    final text = await showSuiteModalBottomSheet<String>(
      context: context,
      builder: (ctx) => Padding(
        padding: suiteBottomSheetPadding(ctx),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Chercher une recette', style: Theme.of(ctx).textTheme.titleMedium),
            const SizedBox(height: 12),
            TextField(
              controller: query,
              autofocus: true,
              textInputAction: TextInputAction.search,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Recette ou ingrédient',
                border: OutlineInputBorder(),
              ),
              onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, query.text.trim()),
              child: const Text('Chercher'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || text == null || text.isEmpty) return;
    List<MealSummary> list;
    try {
      list = await mealDbSearch(text);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      return;
    }
    if (!mounted || list.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Aucune recette')),
        );
      }
      return;
    }
    await _openRecipe(list.first);
  }

  Future<void> _generateShopping(CookShopHorizon horizon) async {
    final mealsById = <String, List<({String name, String measure})>>{};
    final ids = <String>{};
    for (final day in cookHorizonDays(_planDay, horizon)) {
      final slots = _data.plan[cookDayKey(day)];
      if (slots == null) continue;
      for (final meals in slots.values) {
        for (final meal in meals) {
          final id = meal.mealId;
          if (id != null && id.isNotEmpty) ids.add(id);
        }
      }
    }
    for (final id in ids) {
      final detail = await mealDbLookup(id);
      if (detail == null) continue;
      mealsById[id] = detail.ingredients;
    }
    final needs = cookShoppingNeeds(
      plan: _data.plan,
      pantry: _data.pantry,
      anchor: _planDay,
      horizon: horizon,
      mealsById: mealsById,
      existing: _data.shopping,
      today: DateTime.now(),
    );
    setState(() {
      for (var i = 0; i < needs.length; i++) {
        final need = needs[i];
        _data.shopping.add(CookShopItem(
          id: '${cookNewId()}-$i',
          name: need.label,
          ingredient: need.ingredient,
          qty: need.qty,
          unit: need.unit,
          kind: 'food',
        ));
      }
    });
    await _persist();
    if (mounted) {
      final span = horizon == CookShopHorizon.week ? 'la semaine' : 'le mois';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            needs.isEmpty
                ? 'Rien à ajouter pour $span (frigo encore bon, ou planning vide).'
                : 'Courses générées depuis le planning de $span, moins le frigo encore bon.',
          ),
        ),
      );
    }
  }
}

class CookEmptyPantry extends StatelessWidget {
  const CookEmptyPantry({super.key, required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const SizedBox(height: 80),
        Icon(
          Icons.kitchen_outlined,
          size: 56,
          color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.5),
        ),
        const SizedBox(height: 12),
        Text(
          'Frigo vide',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const Padding(
          padding: EdgeInsets.all(16),
          child: Text(
            'Ajoute ce que tu as : Hubera Cook propose ensuite des recettes et complète la liste de courses.',
            textAlign: TextAlign.center,
          ),
        ),
        Center(
          child: FilledButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add),
            label: const Text('Ajouter'),
          ),
        ),
      ],
    );
  }
}

class _PantryTab extends StatelessWidget {
  const _PantryTab({
    required this.items,
    required this.onAdd,
    required this.onEdit,
    required this.onRemove,
  });

  final List<CookPantryItem> items;
  final VoidCallback onAdd;
  final Future<void> Function(CookPantryItem) onEdit;
  final Future<void> Function(CookPantryItem) onRemove;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return CookEmptyPantry(onAdd: onAdd);
    }
    return ListView.builder(
      padding: const EdgeInsets.only(bottom: 88),
      itemCount: items.length,
      itemBuilder: (ctx, i) {
        final item = items[i];
        final qty = [item.qty, item.unit].where((s) => s.trim().isNotEmpty).join(' ');
        final status = cookPantryStatusLine(item, DateTime.now());
        final subtitle = [if (qty.isNotEmpty) qty, if (status.isNotEmpty) status].join(' · ');
        return ListTile(
          leading: IngredientPhoto(name: item.name),
          title: Text(item.name),
          subtitle: Text(subtitle.isEmpty ? 'Toucher pour la quantité' : subtitle),
          onTap: () => onEdit(item),
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
    this.favoritesOnly = false,
  });

  final List<CookPantryItem> pantry;
  final List<String> favorites;
  final bool favoritesOnly;
  final Future<void> Function(MealSummary meal) onOpen;
  final Future<void> Function(String id) onToggleFav;

  @override
  State<_RecipesTab> createState() => _RecipesTabState();
}

class _RecipesTabState extends State<_RecipesTab> {
  final _query = TextEditingController();
  List<MealSummary> _meals = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _searching = false;
  int _letterIndex = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadSuggested();
  }

  @override
  void didUpdateWidget(covariant _RecipesTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.favoritesOnly != widget.favoritesOnly) _loadSuggested();
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
      _searching = false;
      _letterIndex = 0;
    });
    try {
      if (widget.favoritesOnly) {
        final list = <MealSummary>[];
        for (final id in widget.favorites) {
          final detail = await mealDbLookup(id);
          if (detail == null) continue;
          list.add(MealSummary(id: detail.id, title: detail.title, thumb: detail.thumb));
        }
        if (!mounted) return;
        setState(() {
          _meals = list;
          _loading = false;
        });
        return;
      }
      final names = widget.pantry.map((e) => e.name).toList();
      final list = names.isEmpty ? await mealDbRandomBatch() : await mealDbSuggestFromPantry(names);
      if (!mounted) return;
      setState(() {
        _meals = list;
        _letterIndex = names.isEmpty ? 1 : 0;
        _loading = false;
      });
      if (_meals.length < 12) unawaited(_loadMore());
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _searching || _letterIndex >= 26) return;
    setState(() => _loadingMore = true);
    try {
      final page = await mealDbLetterPage(_letterIndex);
      if (!mounted) return;
      final seen = _meals.map((m) => m.id).toSet();
      final extra = page.meals.where((m) => seen.add(m.id)).toList();
      setState(() {
        _meals = [..._meals, ...extra];
        _letterIndex = page.nextIndex;
        _loadingMore = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _search() async {
    setState(() {
      _loading = true;
      _error = null;
      _searching = true;
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
          child: Row(
            children: [
              ListenableBuilder(
                listenable: _query,
                builder: (context, _) => IngredientPhoto(name: _query.text),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _query,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => _search(),
                  decoration: InputDecoration(
                    hintText: 'Chercher un ingrédient ou une recette…',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: IconButton(icon: const Icon(Icons.tune), onPressed: _loadSuggested, tooltip: 'Selon le frigo'),
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (_loading) const LinearProgressIndicator(),
        if (_error != null)
          Padding(padding: const EdgeInsets.all(12), child: Text(_error!)),
        Expanded(
          child: _meals.isEmpty && !_loading
              ? const Center(child: Text('Aucune recette'))
              : NotificationListener<ScrollNotification>(
                  onNotification: (n) {
                    if (n.metrics.pixels > n.metrics.maxScrollExtent - 640) {
                      _loadMore();
                    }
                    return false;
                  },
                  child: GridView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 88),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    childAspectRatio: 0.78,
                  ),
                  itemCount: _meals.length + (_loadingMore ? 1 : 0),
                  itemBuilder: (ctx, i) {
                    if (i >= _meals.length) {
                      return const Center(child: Padding(
                        padding: EdgeInsets.all(16),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ));
                    }
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
                                    child: CookFrenchText(source: m.title, maxLines: 2),
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
  final Future<void> Function(String slot, CookMeal meal) onClear;

  @override
  Widget build(BuildContext context) {
    final key = cookDayKey(day);
    final slots = data.plan[key] ?? {};
    Widget card(String slot, String label, IconData icon) {
      final meals = slots[slot] ?? const <CookMeal>[];
      return Card(
        child: Column(
          children: [
            ListTile(
              leading: Icon(icon),
              title: Text(label),
              subtitle: meals.isEmpty ? const Text('Rien de prévu') : Text('${meals.length} prévu${meals.length > 1 ? 's' : ''}'),
              trailing: const Icon(Icons.add),
              onTap: () => onPick(slot),
            ),
            for (final meal in meals)
              ListTile(
                title: Text(meal.title?.trim().isNotEmpty == true ? meal.title! : 'Recette'),
                subtitle: _MealCoverage(mealId: meal.mealId, pantry: data.pantry),
                trailing: IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => onClear(slot, meal),
                ),
              ),
          ],
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
          'La liste de courses se complète depuis la semaine ou le mois, moins le frigo encore bon.',
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
  final Future<void> Function(CookShopHorizon horizon) onGenerate;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => onGenerate(CookShopHorizon.week),
                  icon: const Icon(Icons.date_range),
                  label: const Text('Semaine'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => onGenerate(CookShopHorizon.month),
                  icon: const Icon(Icons.calendar_month),
                  label: const Text('Mois'),
                ),
              ),
            ],
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
              : ListView(
                  padding: const EdgeInsets.only(bottom: 88),
                  children: [
                    for (final part in [
                      (
                        title: 'Alimentaire',
                        rows: [for (final item in items) if (item.kind != 'other') item],
                      ),
                      (
                        title: 'Pas alimentaire',
                        rows: [for (final item in items) if (item.kind == 'other') item],
                      ),
                    ])
                      if (part.rows.isNotEmpty) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                          child: Text(part.title, style: Theme.of(context).textTheme.titleSmall),
                        ),
                        for (final item in part.rows)
                          CheckboxListTile(
                            value: item.done,
                            title: Row(
                              children: [
                                Semantics(
                                  label: 'Photo de ${cookShopPhotoName(item)}',
                                  image: true,
                                  child: IngredientPhoto(name: cookShopPhotoName(item), size: 48),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    cookShopTitle(item),
                                    style: TextStyle(
                                      decoration: item.done ? TextDecoration.lineThrough : null,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            subtitle: Text(
                              item.kind == 'other'
                                  ? 'Pas alimentaire'
                                  : (cookShopVisibleQty(item).isEmpty
                                      ? 'À acheter'
                                      : cookShopVisibleQty(item)),
                            ),
                            onChanged: (v) {
                              item.done = v ?? false;
                              onChanged();
                            },
                            secondary: IconButton(
                              icon: const Icon(Icons.close),
                              onPressed: () {
                                items.removeWhere((e) => e.id == item.id);
                                onChanged();
                              },
                            ),
                          ),
                      ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _MealCoverage extends StatefulWidget {
  const _MealCoverage({required this.mealId, required this.pantry});

  final String? mealId;
  final List<CookPantryItem> pantry;

  @override
  State<_MealCoverage> createState() => _MealCoverageState();
}

class _MealCoverageState extends State<_MealCoverage> {
  String _line = '';
  bool _short = false;

  @override
  void initState() {
    super.initState();
    final id = widget.mealId;
    if (id == null || id.isEmpty) return;
    mealDbLookup(id).then((detail) {
      if (!mounted || detail == null) return;
      final balances = [
        for (final ing in detail.ingredients)
          cookPantryBalance(
            ingredient: ing.name,
            measure: ing.measure,
            pantry: widget.pantry,
            today: DateTime.now(),
          ),
      ];
      if (balances.isEmpty) return;
      final missing = balances.where((b) => b.missing).length;
      setState(() {
        _short = missing > 0;
        _line = '${balances.length - missing}/${balances.length} au frigo';
      });
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    if (_line.isEmpty) return const SizedBox.shrink();
    return Text(_line, style: TextStyle(color: _short ? Colors.red : null));
  }
}
