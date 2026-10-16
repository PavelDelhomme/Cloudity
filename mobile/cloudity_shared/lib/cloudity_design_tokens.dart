import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'suite_app_catalog.dart';

/// Couleurs et espacements Cloudity (alignés `assets/cloudity_tokens.json` + web).
class CloudityDesignTokens {
  CloudityDesignTokens._();

  static Map<String, dynamic>? _raw;
  static bool _loaded = false;
  static bool _assetLoaded = false;

  /// Couleurs minimales pour peindre le premier frame sans attendre l’asset.
  static Map<String, dynamic> fallbackRaw() => {
        'brand': <String, dynamic>{'primary': '#2563EB'},
        'radius': <String, dynamic>{'sm': 8, 'md': 12, 'lg': 16},
        'spacing': <String, dynamic>{'xs': 4, 'sm': 8, 'md': 12, 'lg': 16, 'xl': 24},
        'apps': <String, dynamic>{
          'mail': <String, dynamic>{'accent': '#0D9488', 'accentDark': '#0F766E'},
          'drive': <String, dynamic>{'accent': '#2563EB', 'accentDark': '#1D4ED8'},
          'photos': <String, dynamic>{'accent': '#FF0033', 'accentDark': '#C40028'},
          'notes': <String, dynamic>{'accent': '#CA8A04', 'accentDark': '#A16207'},
          'calendar': <String, dynamic>{'accent': '#EA580C', 'accentDark': '#C2410C'},
          'contacts': <String, dynamic>{'accent': '#0891B2', 'accentDark': '#0E7490'},
          'tasks': <String, dynamic>{'accent': '#16A34A', 'accentDark': '#15803D'},
          'pass': <String, dynamic>{'accent': '#7C3AED', 'accentDark': '#6D28D9'},
        },
      };

  /// `true` après [ensureLoaded] / [installFallback] / [loadSyncForTests].
  static bool get isLoaded => _loaded && _raw != null;

  /// Premier frame immédiat. [ensureLoaded] remplace ensuite par l’asset.
  static void installFallback() {
    if (_assetLoaded || _loaded) return;
    _raw = fallbackRaw();
    _loaded = true;
  }

  static Future<void> ensureLoaded() async {
    if (_assetLoaded) return;
    final json = await rootBundle.loadString('packages/cloudity_shared/assets/cloudity_tokens.json');
    _raw = jsonDecode(json) as Map<String, dynamic>;
    _loaded = true;
    _assetLoaded = true;
  }

  static void loadSyncForTests(Map<String, dynamic> data) {
    _raw = data;
    _loaded = true;
    _assetLoaded = true;
  }

  static Color _hex(String value) {
    var hex = value.replaceFirst('#', '');
    if (hex.length == 6) hex = 'FF$hex';
    return Color(int.parse(hex, radix: 16));
  }

  static Color seedColor(ClouditySuiteApp app) {
    _ensureSync();
    final apps = _raw!['apps'] as Map<String, dynamic>?;
    final entry = apps?[app.tokenKey] as Map<String, dynamic>?;
    if (entry != null && entry['accent'] is String) {
      return _hex(entry['accent'] as String);
    }
    final brand = _raw!['brand'] as Map<String, dynamic>?;
    if (brand?['primary'] is String) return _hex(brand!['primary'] as String);
    return const Color(0xFF2563EB);
  }

  /// Couleur accent foncée (dégradés login, etc.).
  static Color accentDark(ClouditySuiteApp app) {
    _ensureSync();
    final apps = _raw!['apps'] as Map<String, dynamic>?;
    final entry = apps?[app.tokenKey] as Map<String, dynamic>?;
    if (entry != null && entry['accentDark'] is String) {
      return _hex(entry['accentDark'] as String);
    }
    return seedColor(app);
  }

  static double radius(String size) {
    _ensureSync();
    final radius = _raw!['radius'] as Map<String, dynamic>?;
    final v = radius?[size];
    if (v is num) return v.toDouble();
    return switch (size) {
      'sm' => 8,
      'md' => 12,
      'lg' => 16,
      _ => 12,
    };
  }

  static double spacing(String size) {
    _ensureSync();
    final spacing = _raw!['spacing'] as Map<String, dynamic>?;
    final v = spacing?[size];
    if (v is num) return v.toDouble();
    return switch (size) {
      'xs' => 4,
      'sm' => 8,
      'md' => 12,
      'lg' => 16,
      'xl' => 24,
      _ => 12,
    };
  }

  static void _ensureSync() {
    if (!_loaded || _raw == null) {
      throw StateError('CloudityDesignTokens.ensureLoaded() avant runApp');
    }
  }
}

/// Précharge les tokens — à appeler dans `main()` avant `runApp`.
Future<void> cloudityLoadDesignTokens() => CloudityDesignTokens.ensureLoaded();
