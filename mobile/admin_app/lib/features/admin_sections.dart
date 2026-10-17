/// Sections de Hubera Admin. Docs (kanban, rapports, Gantt) n’y est pas.
const adminSectionIds = ['home', 'apps', 'users', 'disk', 'errors'];

const adminSectionLabels = {
  'home': 'Tableau',
  'apps': 'Applications',
  'users': 'Utilisateurs',
  'disk': 'Disque',
  'errors': 'Erreurs',
};

bool adminCopiesDocs(Iterable<String> labels) {
  const docs = {'tâches', 'kanban', 'docs', 'rapports', 'gantt', 'retours'};
  return labels.any((label) => docs.contains(label.trim().toLowerCase()));
}
