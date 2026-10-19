/// Brouillon local d’une tâche dont l’envoi a échoué faute de réseau.
class OfflineTaskDraft {
  const OfflineTaskDraft({
    required this.token,
    required this.title,
    this.notes = '',
    this.dueAt,
    this.priority = 3,
    this.remindAt,
  });

  final String token;
  final String title;
  final String notes;
  final String? dueAt;
  final int priority;
  final String? remindAt;

  Map<String, dynamic> toJson() => {
        'token': token,
        'title': title,
        'notes': notes,
        'priority': priority,
        if (dueAt != null && dueAt!.isNotEmpty) 'due_at': dueAt,
        if (remindAt != null && remindAt!.isNotEmpty) 'remind_at': remindAt,
      };

  static OfflineTaskDraft? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final token = raw['token']?.toString() ?? '';
    final title = raw['title']?.toString().trim() ?? '';
    if (token.isEmpty || title.isEmpty) return null;
    final priority = raw['priority'];
    return OfflineTaskDraft(
      token: token,
      title: title,
      notes: raw['notes']?.toString() ?? '',
      dueAt: raw['due_at']?.toString(),
      priority: priority is int ? priority : int.tryParse('$priority') ?? 3,
      remindAt: raw['remind_at']?.toString(),
    );
  }

  Map<String, dynamic> asListItem() => {
        'id': -(token.hashCode.abs() % 1000000000 + 1),
        'title': title,
        'notes': notes,
        'priority': priority,
        'completed': false,
        if (dueAt != null && dueAt!.isNotEmpty) 'due_at': dueAt,
        '_offline': true,
      };
}

bool sameTaskTitle(Map<String, dynamic> task, OfflineTaskDraft draft) {
  final title = (task['title']?.toString() ?? '').trim();
  return title == draft.title.trim();
}

/// Brouillons qui n’ont pas déjà une tâche serveur au même titre.
List<OfflineTaskDraft> offlineTasksStillMissing(
  List<OfflineTaskDraft> drafts,
  List<Map<String, dynamic>> serverTasks,
) {
  final server = [
    for (final task in serverTasks)
      if (task['_offline'] != true) task,
  ];
  return [
    for (final draft in drafts)
      if (!server.any((task) => sameTaskTitle(task, draft))) draft,
  ];
}

List<Map<String, dynamic>> tasksWithOfflineDrafts(
  List<Map<String, dynamic>> serverTasks,
  List<OfflineTaskDraft> drafts,
) {
  final server = [
    for (final task in serverTasks)
      if (task['_offline'] != true) task,
  ];
  return [
    ...server,
    for (final draft in offlineTasksStillMissing(drafts, server))
      draft.asListItem(),
  ];
}

/// « Faites » ne montre que les tâches cochées. Le reste reste à faire.
List<Map<String, dynamic>> tasksForDoneFilter(
  List<Map<String, dynamic>> items, {
  required bool doneOnly,
}) {
  return [
    for (final item in items)
      if ((item['completed'] == true) == doneOnly) item,
  ];
}
