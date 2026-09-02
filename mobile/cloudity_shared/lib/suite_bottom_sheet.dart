import 'package:flutter/material.dart';

/// Padding standard des bottom sheets suite : clavier + safe area (barre gestuelle).
EdgeInsets suiteBottomSheetPadding(BuildContext context, {
  double horizontal = 20,
  double top = 8,
  double bottomBase = 20,
}) {
  final mq = MediaQuery.of(context);
  return EdgeInsets.fromLTRB(
    horizontal,
    top,
    horizontal,
    bottomBase + mq.viewInsets.bottom + mq.padding.bottom,
  );
}

/// Affiche un [showModalBottomSheet] avec safe area et scroll clavier.
Future<T?> showSuiteModalBottomSheet<T>({
  required BuildContext context,
  required Widget Function(BuildContext ctx) builder,
  bool isScrollControlled = true,
  bool showDragHandle = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    showDragHandle: showDragHandle,
    useSafeArea: true,
    builder: builder,
  );
}
