import 'package:cloudity_shared/cloudity_shared.dart';
import 'package:flutter/material.dart';

import 'cook_store.dart';
import 'cook_translate.dart';
import 'cook_units.dart';
import 'ingredient_photo.dart';
import 'mealdb.dart';

String _slotName(String slot) => switch (slot) {
      'breakfast' => 'petit-déjeuner',
      'lunch' => 'déjeuner',
      _ => 'dîner',
    };

/// Détail d’une recette. « S’utiliser » ouvre le menu ici, sans revenir à la liste.
class CookRecipePage extends StatefulWidget {
  const CookRecipePage({
    super.key,
    required this.summary,
    required this.pantry,
    required this.favorite,
    required this.wanted,
    required this.onToggleFav,
    required this.onToggleWant,
    required this.onSchedule,
    required this.onShop,
    this.seed,
    this.suggestedSlot,
  });

  final MealSummary summary;
  final List<CookPantryItem> pantry;
  final bool favorite;
  final bool wanted;
  final Future<void> Function() onToggleFav;
  final Future<void> Function() onToggleWant;
  final Future<void> Function(String slot, MealDetail detail) onSchedule;
  final Future<void> Function(MealDetail detail) onShop;
  final MealDetail? seed;
  final String? suggestedSlot;

  @override
  State<CookRecipePage> createState() => _CookRecipePageState();
}

class _CookRecipePageState extends State<CookRecipePage> {
  MealDetail? _detail;
  String? _error;
  final Set<int> _prepped = {};
  late bool _favorite = widget.favorite;
  late bool _wanted = widget.wanted;

  @override
  void initState() {
    super.initState();
    cookLoadUserFixes();
    if (widget.seed != null) {
      _detail = widget.seed;
      return;
    }
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

  List<CookBalance> _balances(MealDetail detail) {
    final today = DateTime.now();
    return [
      for (final ing in detail.ingredients)
        cookPantryBalance(
          ingredient: ing.name,
          measure: ing.measure,
          pantry: widget.pantry,
          today: today,
        ),
    ];
  }

  Future<void> _correct(String source) async {
    final ctrl = TextEditingController(text: cookToFrenchLearned(source));
    final next = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Corriger la traduction'),
        content: TextField(controller: ctrl, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Annuler')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('Retenir'),
          ),
        ],
      ),
    );
    if (next == null || next.isEmpty) return;
    cookRememberFix(source, next);
    if (mounted) setState(() {});
  }

  Future<void> _use() async {
    final detail = _detail;
    if (detail == null) return;
    final balances = _balances(detail);
    final total = balances.length;
    final missing = balances.where((b) => b.missing).length;
    final have = total - missing;
    final choice = await showSuiteModalBottomSheet<String>(
      context: context,
      builder: (ctx) => Padding(
        padding: suiteBottomSheetPadding(ctx),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('S’utiliser', style: Theme.of(ctx).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              total == 0 ? 'Aucun ingrédient' : '$have/$total au frigo',
              style: TextStyle(color: missing > 0 ? Colors.red : null),
            ),
            for (final b in balances)
              if (b.missing)
                Text(b.name, style: const TextStyle(color: Colors.red)),
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
      await widget.onShop(detail);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ingrédients ajoutés aux courses')),
      );
      return;
    }
    await widget.onSchedule(choice, detail);
    if (!mounted) return;
    final label = switch (choice) {
      'breakfast' => 'petit-déjeuner',
      'lunch' => 'déjeuner',
      _ => 'dîner',
    };
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Ajouté au $label')),
    );
  }

  Future<void> _cookNow() async {
    final detail = _detail;
    if (detail == null) return;
    await widget.onSchedule('dinner', detail);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Ajouté au dîner')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final detail = _detail;
    final balances = detail == null ? const <CookBalance>[] : _balances(detail);
    final total = balances.length;
    final missing = balances.where((b) => b.missing).length;
    final have = total - missing;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Recette'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: detail == null
          ? Center(child: _error != null ? Text(_error!) : const CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              children: [
                if (detail.thumb != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.network(detail.thumb!),
                  ),
                const SizedBox(height: 12),
                CookFrenchText(
                  source: detail.title,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                CookFixHint(onPressed: () => _correct(detail.title)),
                if (detail.category != null || detail.area != null)
                  Text(
                    [detail.category, detail.area]
                        .whereType<String>()
                        .where((s) => s.trim().isNotEmpty)
                        .map(cookToFrenchLearned)
                        .join(' · '),
                  ),
                if (total > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      '$have/$total au frigo',
                      style: TextStyle(
                        color: missing > 0 ? Colors.red : null,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ActionChip(
                      avatar: Icon(_wanted ? Icons.bookmark : Icons.bookmark_border, size: 18),
                      label: const Text('Je veux la faire'),
                      onPressed: () async {
                        await widget.onToggleWant();
                        if (mounted) setState(() => _wanted = !_wanted);
                      },
                    ),
                    ActionChip(
                      avatar: const Icon(Icons.event, size: 18),
                      label: const Text('Programmer'),
                      onPressed: _use,
                    ),
                    if (widget.suggestedSlot != null)
                      ActionChip(
                        avatar: const Icon(Icons.add, size: 18),
                        label: Text('Ajouter à ${_slotName(widget.suggestedSlot!)}'),
                        onPressed: () async {
                          await widget.onSchedule(widget.suggestedSlot!, detail);
                          if (!mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Ajouté à ${_slotName(widget.suggestedSlot!)}')),
                          );
                        },
                      ),
                    ActionChip(
                      avatar: Icon(_favorite ? Icons.favorite : Icons.favorite_border, size: 18),
                      label: const Text('Favori'),
                      onPressed: () async {
                        await widget.onToggleFav();
                        if (mounted) setState(() => _favorite = !_favorite);
                      },
                    ),
                    ActionChip(
                      avatar: const Icon(Icons.restaurant, size: 18),
                      label: const Text('La faire'),
                      onPressed: _cookNow,
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text('Préparer les ingrédients', style: Theme.of(context).textTheme.titleSmall),
                for (var i = 0; i < detail.ingredients.length; i++)
                  _ingredientTile(detail.ingredients[i], balances[i], i),
                const SizedBox(height: 12),
                Text('Préparation', style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 4),
                Text(cookToFrenchLearned(detail.instructions)),
              ],
            ),
      bottomNavigationBar: detail == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: FilledButton(
                  onPressed: _use,
                  child: const Text('S’utiliser'),
                ),
              ),
            ),
    );
  }

  Widget _ingredientTile(({String name, String measure}) ing, CookBalance balance, int index) {
    final measure = cookNormalizeUnits(ing.measure.trim());
    final qty = balance.comparable
        ? '${cookFormatQty(balance.have)}/${cookFormatQty(balance.need)} ${balance.unit}'
        : (balance.inFridge ? 'au frigo' : 'manque');
    final line = [if (measure.isNotEmpty) measure, qty].join(' · ');
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: IngredientPhoto(name: cookToFrench(ing.name)),
      title: CookFrenchText(source: ing.name),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(line, style: TextStyle(color: balance.missing ? Colors.red : null)),
          CookFixHint(onPressed: () => _correct(ing.name)),
        ],
      ),
      trailing: Checkbox(
        value: _prepped.contains(index),
        onChanged: (v) {
          setState(() {
            if (v == true) {
              _prepped.add(index);
            } else {
              _prepped.remove(index);
            }
          });
        },
      ),
    );
  }
}
