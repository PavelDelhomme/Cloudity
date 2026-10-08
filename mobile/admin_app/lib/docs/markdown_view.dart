import 'package:flutter/material.dart';

class MarkdownView extends StatelessWidget {
  const MarkdownView(this.source, {super.key});

  final String source;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final blocks = _parse(source);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final b in blocks) ...[
          if (b is _H)
            Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 6),
              child: Text(
                b.text,
                style: switch (b.level) {
                  1 => theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                  2 => theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                  _ => theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                },
              ),
            )
          else if (b is _P)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text.rich(_inline(b.text, theme)),
            )
          else if (b is _Li)
            Padding(
              padding: const EdgeInsets.only(bottom: 4, left: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('•  '),
                  Expanded(child: Text.rich(_inline(b.text, theme))),
                ],
              ),
            )
          else if (b is _Code)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.symmetric(vertical: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(b.text, style: theme.textTheme.bodySmall?.copyWith(fontFamily: 'monospace')),
            )
          else if (b is _Quote)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.symmetric(vertical: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text.rich(_inline(b.text, theme), style: const TextStyle(fontStyle: FontStyle.italic)),
            )
          else
            const Divider(),
        ],
      ],
    );
  }
}

sealed class _B {}

class _H extends _B {
  _H(this.level, this.text);
  final int level;
  final String text;
}

class _P extends _B {
  _P(this.text);
  final String text;
}

class _Li extends _B {
  _Li(this.text);
  final String text;
}

class _Code extends _B {
  _Code(this.text);
  final String text;
}

class _Quote extends _B {
  _Quote(this.text);
  final String text;
}

class _Hr extends _B {}

List<_B> _parse(String source) {
  final out = <_B>[];
  final lines = source.replaceAll('\r\n', '\n').split('\n');
  var i = 0;
  while (i < lines.length) {
    final line = lines[i];
    if (line.trim().isEmpty) {
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      final buf = StringBuffer();
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        if (buf.isNotEmpty) buf.writeln();
        buf.write(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      out.add(_Code(buf.toString()));
      continue;
    }
    if (RegExp(r'^---+$').hasMatch(line.trim())) {
      out.add(_Hr());
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      out.add(_H(1, line.substring(2).trim()));
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      out.add(_H(2, line.substring(3).trim()));
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      out.add(_H(3, line.substring(4).trim()));
      i++;
      continue;
    }
    if (line.startsWith('> ')) {
      out.add(_Quote(line.substring(2).trim()));
      i++;
      continue;
    }
    final bullet = RegExp(r'^[-*]\s+(.*)$').firstMatch(line);
    if (bullet != null) {
      out.add(_Li(bullet.group(1)!));
      i++;
      continue;
    }
    out.add(_P(line));
    i++;
  }
  return out;
}

TextSpan _inline(String text, ThemeData theme) {
  final re = RegExp(r'(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))');
  final children = <InlineSpan>[];
  var last = 0;
  for (final m in re.allMatches(text)) {
    if (m.start > last) children.add(TextSpan(text: text.substring(last, m.start)));
    final t = m.group(0)!;
    if (t.startsWith('**')) {
      children.add(TextSpan(text: t.substring(2, t.length - 2), style: const TextStyle(fontWeight: FontWeight.bold)));
    } else if (t.startsWith('`')) {
      children.add(TextSpan(text: t.substring(1, t.length - 1), style: const TextStyle(fontFamily: 'monospace')));
    } else if (t.startsWith('[')) {
      final label = t.substring(t.indexOf('[') + 1, t.indexOf(']'));
      children.add(TextSpan(text: label, style: TextStyle(color: theme.colorScheme.primary, fontWeight: FontWeight.w600)));
    } else {
      children.add(TextSpan(text: t.substring(1, t.length - 1), style: const TextStyle(fontStyle: FontStyle.italic)));
    }
    last = m.end;
  }
  if (last < text.length) children.add(TextSpan(text: text.substring(last)));
  return TextSpan(style: theme.textTheme.bodyLarge, children: children);
}
