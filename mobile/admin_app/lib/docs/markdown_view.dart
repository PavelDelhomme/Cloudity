import 'package:flutter/material.dart';

class MarkdownView extends StatelessWidget {
  const MarkdownView(this.source, {super.key});

  final String source;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final ink = dark ? const Color(0xFFF8FAFC) : const Color(0xFF0F172A);
    final paper = dark ? const Color(0xFF0F172A) : const Color(0xFFFFFFFF);
    final codeBg = dark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9);
    final line = dark ? const Color(0xFF334155) : const Color(0xFFE2E8F0);
    final blocks = _parse(source);
    final body = TextStyle(fontSize: 17, height: 1.55, color: ink);
    return ColoredBox(
      color: paper,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final b in blocks) ...[
            if (b is _H)
              Padding(
                padding: const EdgeInsets.only(top: 18, bottom: 8),
                child: Text(
                  b.text,
                  style: TextStyle(
                    color: ink,
                    fontWeight: FontWeight.w700,
                    height: 1.3,
                    fontSize: switch (b.level) {
                      1 => 26,
                      2 => 22,
                      _ => 19,
                    },
                  ),
                ),
              )
            else if (b is _P)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: SelectableText.rich(_inline(b.text, theme, ink), style: body),
              )
            else if (b is _Li)
              Padding(
                padding: const EdgeInsets.only(bottom: 8, left: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('•  ', style: body),
                    Expanded(child: SelectableText.rich(_inline(b.text, theme, ink), style: body)),
                  ],
                ),
              )
            else if (b is _Table)
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Table(
                  border: TableBorder.all(color: line),
                  defaultVerticalAlignment: TableCellVerticalAlignment.middle,
                  children: [
                    for (var r = 0; r < b.rows.length; r++)
                      TableRow(
                        decoration: BoxDecoration(color: r == 0 ? codeBg : paper),
                        children: [
                          for (final cell in b.rows[r])
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                              child: Text(
                                cell,
                                style: body.copyWith(fontSize: 15, fontWeight: r == 0 ? FontWeight.w700 : FontWeight.w400),
                              ),
                            ),
                        ],
                      ),
                  ],
                ),
              )
            else if (b is _Code)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.symmetric(vertical: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: codeBg,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: SelectableText(
                  b.text,
                  style: TextStyle(fontFamily: 'monospace', fontSize: 15, height: 1.45, color: ink),
                ),
              )
            else if (b is _Quote)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.symmetric(vertical: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: codeBg,
                  borderRadius: BorderRadius.circular(8),
                  border: Border(left: BorderSide(color: ink, width: 3)),
                ),
                child: SelectableText.rich(
                  _inline(b.text, theme, ink),
                  style: body.copyWith(fontStyle: FontStyle.italic),
                ),
              )
            else
              Divider(color: line, height: 28),
          ],
        ],
      ),
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

class _Table extends _B {
  _Table(this.rows);
  final List<List<String>> rows;
}

List<String> _cells(String line) {
  final raw = line.trim();
  final body = raw.startsWith('|') ? raw.substring(1) : raw;
  final cut = body.endsWith('|') ? body.substring(0, body.length - 1) : body;
  return cut.split('|').map((c) => c.trim()).toList();
}

bool _isSep(String line) => RegExp(r'^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$').hasMatch(line.trim());

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
    if (line.trim().startsWith('|') && i + 1 < lines.length && _isSep(lines[i + 1])) {
      final rows = <List<String>>[_cells(line)];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.add(_cells(lines[i]));
        i++;
      }
      out.add(_Table(rows));
      continue;
    }
    out.add(_P(line));
    i++;
  }
  return out;
}

TextSpan _inline(String text, ThemeData theme, Color ink) {
  final re = RegExp(r'(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))');
  final children = <InlineSpan>[];
  var last = 0;
  final base = TextStyle(fontSize: 17, height: 1.55, color: ink);
  for (final m in re.allMatches(text)) {
    if (m.start > last) children.add(TextSpan(text: text.substring(last, m.start)));
    final t = m.group(0)!;
    if (t.startsWith('**')) {
      children.add(TextSpan(text: t.substring(2, t.length - 2), style: const TextStyle(fontWeight: FontWeight.bold)));
    } else if (t.startsWith('`')) {
      children.add(TextSpan(
        text: t.substring(1, t.length - 1),
        style: TextStyle(fontFamily: 'monospace', color: ink, backgroundColor: theme.brightness == Brightness.dark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9)),
      ));
    } else if (t.startsWith('[')) {
      final label = t.substring(t.indexOf('[') + 1, t.indexOf(']'));
      final link = theme.brightness == Brightness.dark ? const Color(0xFF93C5FD) : const Color(0xFF1D4ED8);
      children.add(TextSpan(text: label, style: TextStyle(color: link, fontWeight: FontWeight.w600)));
    } else {
      children.add(TextSpan(text: t.substring(1, t.length - 1), style: const TextStyle(fontStyle: FontStyle.italic)));
    }
    last = m.end;
  }
  if (last < text.length) children.add(TextSpan(text: text.substring(last)));
  return TextSpan(style: base, children: children);
}
