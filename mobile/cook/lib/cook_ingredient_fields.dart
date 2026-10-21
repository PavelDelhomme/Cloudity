import 'package:flutter/material.dart';

import 'cook_units.dart';
import 'ingredient_photo.dart';
import 'ingredient_suggest.dart';

class CookIngredientDraft {
  const CookIngredientDraft({
    required this.name,
    required this.qty,
    required this.unit,
    this.opened = false,
    this.openedOn = '',
    this.keepDays = 0,
    this.bestBefore = '',
  });

  final String name;
  final String qty;
  final String unit;
  final bool opened;
  final String openedOn;
  final int keepDays;
  final String bestBefore;
}

/// Photo libre à côté du nom, unité libre avec suggestions.
class CookIngredientFields extends StatefulWidget {
  const CookIngredientFields({
    super.key,
    required this.name,
    required this.qty,
    required this.unit,
    required this.knownUnits,
    this.focusQty = false,
  });

  final TextEditingController name;
  final TextEditingController qty;
  final TextEditingController unit;
  final List<String> knownUnits;
  final bool focusQty;

  @override
  State<CookIngredientFields> createState() => _CookIngredientFieldsState();
}

class _CookIngredientFieldsState extends State<CookIngredientFields> {
  final _unitFocus = FocusNode();
  String _typedName = '';

  @override
  void initState() {
    super.initState();
    _typedName = widget.name.text;
    widget.name.addListener(_onName);
  }

  @override
  void dispose() {
    widget.name.removeListener(_onName);
    _unitFocus.dispose();
    super.dispose();
  }

  void _onName() {
    if (_typedName == widget.name.text) return;
    setState(() => _typedName = widget.name.text);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            IngredientPhoto(name: _typedName),
            const SizedBox(width: 12),
            Expanded(
              child: TextField(
                controller: widget.name,
                autofocus: !widget.focusQty,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Ingrédient',
                  hintText: 'Rechercher',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
          ],
        ),
        _suggestionList(),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: widget.qty,
                autofocus: widget.focusQty,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Qté',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(child: _unitField()),
          ],
        ),
      ],
    );
  }

  Widget _suggestionList() {
    final matches = cookIngredientSuggestions(_typedName);
    if (matches.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Material(
        elevation: 1,
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final name in matches)
              ListTile(
                dense: true,
                leading: IngredientPhoto(name: name, size: 36),
                title: Text(name),
                onTap: () {
                  widget.name.value = TextEditingValue(
                    text: name,
                    selection: TextSelection.collapsed(offset: name.length),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _unitField() {
    return RawAutocomplete<String>(
      textEditingController: widget.unit,
      focusNode: _unitFocus,
      displayStringForOption: (option) => option,
      optionsBuilder: (value) {
        return cookUnitSuggestions(value.text, widget.knownUnits);
      },
      fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
        return TextField(
          controller: controller,
          focusNode: focusNode,
          decoration: const InputDecoration(
            labelText: 'Unité',
            hintText: 'g, ml, pièce…',
            border: OutlineInputBorder(),
          ),
          onSubmitted: (_) => onSubmitted(),
        );
      },
      optionsViewBuilder: (context, onSelected, options) {
        final list = options.toList();
        return Align(
          alignment: Alignment.topLeft,
          child: Material(
            elevation: 4,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 220, maxWidth: 280),
              child: ListView.builder(
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                itemCount: list.length,
                itemBuilder: (context, index) {
                  final option = list[index];
                  return ListTile(
                    dense: true,
                    title: Text(option),
                    onTap: () => onSelected(option),
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }
}
