/// Brouillon local d’une note dont l’envoi a échoué faute de réseau.
class OfflineNoteDraft {
  const OfflineNoteDraft({
    required this.token,
    required this.title,
    required this.content,
    this.remindAt,
    this.color = 'default',
    this.pinned = false,
    this.archived = false,
  });

  final String token;
  final String title;
  final String content;
  final String? remindAt;
  final String color;
  final bool pinned;
  final bool archived;

  Map<String, dynamic> toJson() => {
        'token': token,
        'title': title,
        'content': content,
        if (remindAt != null && remindAt!.isNotEmpty) 'remind_at': remindAt,
        'color': color,
        'pinned': pinned,
        'archived': archived,
      };

  static OfflineNoteDraft? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final token = raw['token']?.toString() ?? '';
    final title = raw['title']?.toString().trim() ?? '';
    if (token.isEmpty || title.isEmpty) return null;
    return OfflineNoteDraft(
      token: token,
      title: title,
      content: raw['content']?.toString() ?? '',
      remindAt: raw['remind_at']?.toString(),
      color: raw['color']?.toString().trim().isNotEmpty == true
          ? raw['color'].toString()
          : 'default',
      pinned: raw['pinned'] == true,
      archived: raw['archived'] == true,
    );
  }

  Map<String, dynamic> asListItem() => {
        'id': -(token.hashCode.abs() % 1000000000 + 1),
        'title': title,
        'content': content,
        'color': color,
        'pinned': pinned,
        'archived': archived,
        if (remindAt != null && remindAt!.isNotEmpty) 'remind_at': remindAt,
        'extras': {'client_token': token},
        '_offline': true,
      };
}

bool sameNoteText(Map<String, dynamic> note, OfflineNoteDraft draft) {
  final title = (note['title']?.toString() ?? '').trim();
  final content = note['content']?.toString() ?? '';
  return title == draft.title && content == draft.content;
}

/// Brouillons qui n’ont pas déjà une note serveur au même titre et contenu.
List<OfflineNoteDraft> offlineDraftsStillMissing(
  List<OfflineNoteDraft> drafts,
  List<Map<String, dynamic>> serverNotes,
) {
  final server = [
    for (final note in serverNotes)
      if (note['_offline'] != true) note,
  ];
  return [
    for (final draft in drafts)
      if (!server.any((note) => sameNoteText(note, draft))) draft,
  ];
}

List<Map<String, dynamic>> notesWithOfflineDrafts(
  List<Map<String, dynamic>> serverNotes,
  List<OfflineNoteDraft> drafts,
) {
  final server = [
    for (final note in serverNotes)
      if (note['_offline'] != true) note,
  ];
  return [
    ...server,
    for (final draft in offlineDraftsStillMissing(drafts, server))
      draft.asListItem(),
  ];
}
