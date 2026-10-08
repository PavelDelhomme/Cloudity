import 'package:flutter/material.dart';

/// Identité produit Hubera (une app Flutter = un membre de la suite).
enum ClouditySuiteApp {
  mail,
  drive,
  photos,
  calendar,
  contacts,
  notes,
  tasks,
  pass,
  cook,
  admin,
}

extension ClouditySuiteAppMeta on ClouditySuiteApp {
  String get tokenKey => name;

  String get title => switch (this) {
        ClouditySuiteApp.mail => 'Mail',
        ClouditySuiteApp.drive => 'Drive',
        ClouditySuiteApp.photos => 'Photos',
        ClouditySuiteApp.calendar => 'Agenda',
        ClouditySuiteApp.contacts => 'Contacts',
        ClouditySuiteApp.notes => 'Notes',
        ClouditySuiteApp.tasks => 'Tâches',
        ClouditySuiteApp.pass => 'Pass',
        ClouditySuiteApp.cook => 'Cook',
        ClouditySuiteApp.admin => 'Admin',
      };

  String get runMobileName => switch (this) {
        ClouditySuiteApp.mail => 'Mail',
        ClouditySuiteApp.drive => 'Drive',
        ClouditySuiteApp.photos => 'Photos',
        ClouditySuiteApp.calendar => 'Calendar',
        ClouditySuiteApp.contacts => 'Contacts',
        ClouditySuiteApp.notes => 'Notes',
        ClouditySuiteApp.tasks => 'Tasks',
        ClouditySuiteApp.pass => 'Pass',
        ClouditySuiteApp.cook => 'Cook',
        ClouditySuiteApp.admin => 'Admin',
      };

  String get webPath => switch (this) {
        ClouditySuiteApp.mail => '/app/mail',
        ClouditySuiteApp.drive => '/app/drive',
        ClouditySuiteApp.photos => '/app/photos',
        ClouditySuiteApp.calendar => '/app/calendar',
        ClouditySuiteApp.contacts => '/app/contacts',
        ClouditySuiteApp.notes => '/app/notes',
        ClouditySuiteApp.tasks => '/app/tasks',
        ClouditySuiteApp.pass => '/app/pass',
        ClouditySuiteApp.cook => '/app/',
        ClouditySuiteApp.admin => '/4dm1n',
      };

  /// Package Android (broker / deep-link intents).
  String get androidPackage => switch (this) {
        ClouditySuiteApp.mail => 'cloud.hubera.mail',
        ClouditySuiteApp.drive => 'cloud.hubera.drive',
        ClouditySuiteApp.photos => 'cloud.hubera.photos',
        ClouditySuiteApp.calendar => 'cloud.hubera.calendar',
        ClouditySuiteApp.contacts => 'cloud.hubera.contacts',
        ClouditySuiteApp.notes => 'cloud.hubera.notes',
        ClouditySuiteApp.tasks => 'cloud.hubera.tasks',
        ClouditySuiteApp.pass => 'cloud.hubera.pass',
        ClouditySuiteApp.cook => 'cloud.hubera.cook',
        ClouditySuiteApp.admin => 'cloud.hubera.admin',
      };

  /// Hôte Hubera pour le feed OTA `https://<host>/updates.json` (comme Maps).
  String get huberaHost => switch (this) {
        ClouditySuiteApp.mail => 'mail.hubera.cloud',
        ClouditySuiteApp.drive => 'drive.hubera.cloud',
        ClouditySuiteApp.photos => 'photos.hubera.cloud',
        ClouditySuiteApp.calendar => 'calendar.hubera.cloud',
        ClouditySuiteApp.contacts => 'contacts.hubera.cloud',
        ClouditySuiteApp.notes => 'notes.hubera.cloud',
        ClouditySuiteApp.tasks => 'tasks.hubera.cloud',
        ClouditySuiteApp.pass => 'pass.hubera.cloud',
        ClouditySuiteApp.cook => 'cook.hubera.cloud',
        ClouditySuiteApp.admin => 'cloudity.delhomme.ovh',
      };

  /// Slug manifeste OTA (`version-cloudity_mail.json`).
  String get otaAppSlug => switch (this) {
        ClouditySuiteApp.mail => 'cloudity_mail',
        ClouditySuiteApp.drive => 'cloudity_drive',
        ClouditySuiteApp.photos => 'cloudity_photos',
        ClouditySuiteApp.calendar => 'cloudity_calendar',
        ClouditySuiteApp.contacts => 'cloudity_contacts',
        ClouditySuiteApp.notes => 'cloudity_notes',
        ClouditySuiteApp.tasks => 'cloudity_tasks',
        ClouditySuiteApp.pass => 'cloudity_pass',
        ClouditySuiteApp.cook => 'cloudity_cook',
        ClouditySuiteApp.admin => 'cloudity_admin',
      };

  IconData get icon => switch (this) {
        ClouditySuiteApp.mail => Icons.mail_outline,
        ClouditySuiteApp.drive => Icons.folder_outlined,
        ClouditySuiteApp.photos => Icons.photo_library_outlined,
        ClouditySuiteApp.calendar => Icons.calendar_month_outlined,
        ClouditySuiteApp.contacts => Icons.contacts_outlined,
        ClouditySuiteApp.notes => Icons.sticky_note_2_outlined,
        ClouditySuiteApp.tasks => Icons.check_circle_outline,
        ClouditySuiteApp.pass => Icons.lock_outline,
        ClouditySuiteApp.cook => Icons.restaurant_outlined,
        ClouditySuiteApp.admin => Icons.admin_panel_settings_outlined,
      };

  /// Apps affichées dans le switcher drawer (ordre type Google Workspace).
  static List<ClouditySuiteApp> get consumerApps => [
        ClouditySuiteApp.mail,
        ClouditySuiteApp.drive,
        ClouditySuiteApp.photos,
        ClouditySuiteApp.calendar,
        ClouditySuiteApp.contacts,
        ClouditySuiteApp.notes,
        ClouditySuiteApp.tasks,
        ClouditySuiteApp.pass,
        ClouditySuiteApp.cook,
      ];
}
