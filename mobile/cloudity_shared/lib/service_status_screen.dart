import 'package:flutter/material.dart';

/// Écran plein page quand la stack Cloudity n’est pas joignable (make up en cours).
class CloudityServiceStatusScreen extends StatelessWidget {
  const CloudityServiceStatusScreen({
    super.key,
    required this.title,
    required this.message,
    this.detail,
    this.onRetry,
  });

  final String title;
  final String message;
  final String? detail;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.cloud_off, size: 48, color: Theme.of(context).colorScheme.error),
                  const SizedBox(height: 16),
                  Text(title, style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Text(message, textAlign: TextAlign.center),
                  if (detail != null) ...[
                    const SizedBox(height: 12),
                    Text(detail!, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
                  ],
                  if (onRetry != null) ...[
                    const SizedBox(height: 20),
                    FilledButton(onPressed: onRetry, child: const Text('Réessayer')),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
