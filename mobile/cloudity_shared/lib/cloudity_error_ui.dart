import 'package:flutter/material.dart';

/// Affichage utilisateur cohérent pour les erreurs (bannière + bouton réessayer).
class CloudityErrorBanner extends StatelessWidget {
  const CloudityErrorBanner({
    super.key,
    required this.message,
    this.onRetry,
    this.compact = false,
  });

  final String message;
  final VoidCallback? onRetry;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.errorContainer,
      child: Padding(
        padding: EdgeInsets.all(compact ? 12 : 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.error_outline, color: scheme.onErrorContainer),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: TextStyle(color: scheme.onErrorContainer),
              ),
            ),
            if (onRetry != null) ...[
              const SizedBox(width: 8),
              TextButton(onPressed: onRetry, child: const Text('Réessayer')),
            ],
          ],
        ),
      ),
    );
  }
}

void showCloudityErrorSnackBar(BuildContext context, String message) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message),
      behavior: SnackBarBehavior.floating,
      action: SnackBarAction(
        label: 'OK',
        onPressed: () {
          ScaffoldMessenger.of(context).hideCurrentSnackBar();
        },
      ),
    ),
  );
}

/// Corps d'écran erreur avec message + action (listes API, login, etc.).
class CloudityErrorBody extends StatelessWidget {
  const CloudityErrorBody({
    super.key,
    required this.message,
    this.onRetry,
    this.onReport,
  });

  final String message;
  final VoidCallback? onRetry;
  final VoidCallback? onReport;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        CloudityErrorBanner(message: message, onRetry: onRetry, compact: true),
        if (onReport != null) ...[
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: onReport,
            icon: const Icon(Icons.bug_report_outlined),
            label: const Text('Signaler ce problème'),
          ),
        ],
      ],
    );
  }
}
