import 'package:flutter/material.dart';

/// Identité produit Cloudity (une app Flutter = un membre de la suite).
enum ClouditySuiteApp {
  mail,
  drive,
  photos,
  calendar,
  contacts,
  notes,
  tasks,
  pass,
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
        ClouditySuiteApp.admin => '/4dm1n',
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
      ];
}
