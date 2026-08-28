import 'package:flutter/material.dart';

import '../cloudity_design_tokens.dart';
import '../suite_app_catalog.dart';

/// Enveloppe visuelle commune des écrans de connexion Cloudity (H19).
///
/// Même structure pour toutes les apps : en-tête dégradé + logo app, carte formulaire.
/// Couleur et icône varient selon [suiteApp].
class CloudityLoginScreenShell extends StatelessWidget {
  const CloudityLoginScreenShell({
    super.key,
    required this.suiteApp,
    required this.productTitle,
    required this.form,
    this.supportingText,
    this.twoFactor = false,
  });

  final ClouditySuiteApp suiteApp;
  final String productTitle;
  final String? supportingText;
  final bool twoFactor;
  final Widget form;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final accent = CloudityDesignTokens.seedColor(suiteApp);
    final accentDark = CloudityDesignTokens.accentDark(suiteApp);
    final radius = CloudityDesignTokens.radius('lg');
    final headline = twoFactor
        ? 'Vérification 2FA — $productTitle'
        : 'Connexion — $productTitle';

    return Scaffold(
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              accent,
              accentDark,
              Color.lerp(accentDark, cs.surface, 0.35)!,
            ],
            stops: const [0, 0.55, 1],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              _LoginHeader(
                suiteApp: suiteApp,
                productTitle: productTitle,
              ),
              Expanded(
                child: Align(
                  alignment: Alignment.topCenter,
                  child: SingleChildScrollView(
                    padding: EdgeInsets.fromLTRB(
                      CloudityDesignTokens.spacing('lg'),
                      CloudityDesignTokens.spacing('md'),
                      CloudityDesignTokens.spacing('lg'),
                      CloudityDesignTokens.spacing('xl'),
                    ),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 440),
                      child: Material(
                        elevation: 0,
                        color: cs.surface.withValues(alpha: 0.97),
                        surfaceTintColor: accent.withValues(alpha: 0.08),
                        shadowColor: Colors.black26,
                        borderRadius: BorderRadius.circular(radius + 4),
                        clipBehavior: Clip.antiAlias,
                        child: Padding(
                          padding: EdgeInsets.all(CloudityDesignTokens.spacing('xl')),
                          child: Theme(
                            data: theme.copyWith(
                              inputDecorationTheme: _loginInputTheme(theme, accent),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Semantics(
                                  header: true,
                                  child: Text(
                                    headline,
                                    style: theme.textTheme.titleLarge?.copyWith(
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: -0.2,
                                    ),
                                  ),
                                ),
                                if (supportingText != null && supportingText!.isNotEmpty) ...[
                                  SizedBox(height: CloudityDesignTokens.spacing('sm')),
                                  Text(
                                    supportingText!,
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      color: cs.onSurfaceVariant,
                                      height: 1.35,
                                    ),
                                  ),
                                ],
                                SizedBox(height: CloudityDesignTokens.spacing('xl')),
                                form,
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static InputDecorationTheme _loginInputTheme(ThemeData theme, Color accent) {
    final cs = theme.colorScheme;
    final r = BorderRadius.circular(CloudityDesignTokens.radius('md'));
    final idle = BorderSide(color: cs.outlineVariant.withValues(alpha: 0.85));
    // Bordure focus fine (évite le « liseré vert » épais Material 3 lors des tests ADB).
    final focus = BorderSide(color: accent.withValues(alpha: 0.75), width: 1.25);

    return InputDecorationTheme(
      filled: true,
      fillColor: cs.surfaceContainerHighest.withValues(alpha: 0.45),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(borderRadius: r, borderSide: idle),
      enabledBorder: OutlineInputBorder(borderRadius: r, borderSide: idle),
      focusedBorder: OutlineInputBorder(borderRadius: r, borderSide: focus),
      errorBorder: OutlineInputBorder(
        borderRadius: r,
        borderSide: BorderSide(color: cs.error.withValues(alpha: 0.8)),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: r,
        borderSide: BorderSide(color: cs.error, width: 1.25),
      ),
      labelStyle: TextStyle(color: cs.onSurfaceVariant),
      floatingLabelStyle: TextStyle(color: accent.withValues(alpha: 0.9)),
    );
  }
}

class _LoginHeader extends StatelessWidget {
  const _LoginHeader({
    required this.suiteApp,
    required this.productTitle,
  });

  final ClouditySuiteApp suiteApp;
  final String productTitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final appName = suiteApp.title;
    final shortProduct = productTitle.replaceFirst(RegExp(r'^Cloudity\s+'), '');

    return Padding(
      padding: EdgeInsets.fromLTRB(
        CloudityDesignTokens.spacing('xl'),
        CloudityDesignTokens.spacing('lg'),
        CloudityDesignTokens.spacing('xl'),
        CloudityDesignTokens.spacing('sm'),
      ),
      child: Column(
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.18),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.35), width: 1.5),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.12),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Icon(
              suiteApp.icon,
              size: 36,
              color: Colors.white,
            ),
          ),
          SizedBox(height: CloudityDesignTokens.spacing('md')),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cloud_outlined, size: 22, color: Colors.white.withValues(alpha: 0.95)),
              const SizedBox(width: 6),
              Text(
                'Cloudity',
                style: theme.textTheme.titleMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.4,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            shortProduct.isNotEmpty ? shortProduct : appName,
            style: theme.textTheme.headlineSmall?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),
        ],
      ),
    );
  }
}

/// Boutons primaire / secondaire alignés sur le design login.
class CloudityLoginActions extends StatelessWidget {
  const CloudityLoginActions({
    super.key,
    required this.primaryLabel,
    required this.onPrimary,
    this.primaryKey,
    this.busy = false,
    this.secondaryLabel,
    this.onSecondary,
    this.secondaryKey,
  });

  final String primaryLabel;
  final VoidCallback? onPrimary;
  final Key? primaryKey;
  final bool busy;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;
  final Key? secondaryKey;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilledButton(
          key: primaryKey,
          onPressed: busy ? null : onPrimary,
          style: FilledButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(CloudityDesignTokens.radius('md')),
            ),
          ),
          child: busy
              ? const SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(primaryLabel),
        ),
        if (secondaryLabel != null && onSecondary != null) ...[
          SizedBox(height: CloudityDesignTokens.spacing('sm')),
          TextButton(
            key: secondaryKey,
            onPressed: busy ? null : onSecondary,
            child: Text(
              secondaryLabel!,
              style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ],
    );
  }
}

/// Section repliable (comptes broker, dev rapide).
class CloudityLoginExtraPanel extends StatelessWidget {
  const CloudityLoginExtraPanel({
    super.key,
    required this.title,
    required this.subtitle,
    required this.children,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      margin: EdgeInsets.only(bottom: CloudityDesignTokens.spacing('lg')),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(CloudityDesignTokens.radius('md')),
        border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.5)),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
          childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          title: Text(title, style: Theme.of(context).textTheme.titleSmall),
          subtitle: Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
          children: children,
        ),
      ),
    );
  }
}
