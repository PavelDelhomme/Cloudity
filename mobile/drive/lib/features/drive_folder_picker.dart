import 'package:flutter/material.dart';

import '../api/auth_api.dart';
import '../auth/user_session.dart';

/// Destination choisie : [parentId] `null` = racine du Drive.
class DriveFolderPick {
  const DriveFolderPick(this.parentId);
  final int? parentId;
}

/// Sélecteur de dossier (navigation arborescente). `null` = annulé.
Future<DriveFolderPick?> showDriveFolderPicker(
  BuildContext context, {
  required UserSession session,
  required String title,
  int? excludeNodeId,
}) {
  return showModalBottomSheet<DriveFolderPick>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (context) => _DriveFolderPickerSheet(
      session: session,
      title: title,
      excludeNodeId: excludeNodeId,
    ),
  );
}

class _DriveFolderPickerSheet extends StatefulWidget {
  const _DriveFolderPickerSheet({
    required this.session,
    required this.title,
    this.excludeNodeId,
  });

  final UserSession session;
  final String title;
  final int? excludeNodeId;

  @override
  State<_DriveFolderPickerSheet> createState() =>
      _DriveFolderPickerSheetState();
}

class _DriveFolderPickerSheetState extends State<_DriveFolderPickerSheet> {
  final List<int?> _stack = [null];
  final List<String> _names = ['Mon Drive'];
  List<Map<String, dynamic>> _folders = [];
  bool _loading = true;
  String? _error;

  int? get _currentParent => _stack.last;

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
      await widget.session.refreshIfNeeded();
      final nodes = await widget.session.api.fetchDriveNodes(
        accessToken: widget.session.accessToken,
        parentId: _currentParent,
      );
      if (!mounted) return;
      setState(() {
        _folders = nodes.where((node) {
          if (node['is_folder'] != true) return false;
          final id = node['id'];
          if (widget.excludeNodeId != null &&
              id is num &&
              id.toInt() == widget.excludeNodeId) {
            return false;
          }
          return true;
        }).toList();
        _loading = false;
      });
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
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

  void _enterFolder(int id, String name) {
    setState(() {
      _stack.add(id);
      _names.add(name);
    });
    _load();
  }

  void _goUp() {
    if (_stack.length <= 1) return;
    setState(() {
      _stack.removeLast();
      _names.removeLast();
    });
    _load();
  }

  void _selectHere() {
    Navigator.pop(context, DriveFolderPick(_currentParent));
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.sizeOf(context).height * 0.72;
    return SizedBox(
      height: height,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 12, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.title,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                if (_stack.length > 1)
                  IconButton(
                    tooltip: 'Dossier parent',
                    onPressed: _goUp,
                    icon: const Icon(Icons.arrow_upward),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: Text(
              _names.last,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const Divider(height: 1),
          Expanded(child: _buildBody()),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Row(
              children: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Annuler'),
                ),
                const Spacer(),
                FilledButton.icon(
                  onPressed: _loading ? null : _selectHere,
                  icon: const Icon(Icons.drive_file_move_outline),
                  label: const Text('Déplacer ici'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(onPressed: _load, child: const Text('Réessayer')),
            ],
          ),
        ),
      );
    }
    if (_folders.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Aucun sous-dossier. Vous pouvez déplacer l’élément ici.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: _folders.length,
      separatorBuilder: (context, index) =>
          const Divider(height: 1, indent: 56),
      itemBuilder: (context, index) {
        final folder = _folders[index];
        final name = folder['name'] as String? ?? 'Dossier';
        final id = folder['id'] is num ? (folder['id'] as num).toInt() : null;
        return ListTile(
          leading: Icon(Icons.folder_rounded, color: Colors.amber.shade700),
          title: Text(name),
          trailing: const Icon(Icons.chevron_right),
          onTap: id == null ? null : () => _enterFolder(id, name),
        );
      },
    );
  }
}
