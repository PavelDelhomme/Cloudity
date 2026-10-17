import 'dart:async';

import 'package:flutter/material.dart';

import 'calendar_visibility.dart';
import 'cloudity_datetime.dart';

const double kCalendarHourPx = 48;
const int kCalendarStartHour = 0;
const int kCalendarEndHour = 24;

DateTime calendarStartOfDay(DateTime d) => DateTime(d.year, d.month, d.day);

DateTime calendarStartOfWeekMonday(DateTime d) {
  final x = calendarStartOfDay(d);
  return x.subtract(Duration(days: x.weekday - 1));
}

List<DateTime> calendarWeekDays(DateTime anchor) {
  final mon = calendarStartOfWeekMonday(anchor);
  return List.generate(7, (i) => mon.add(Duration(days: i)));
}

class TimedSegment {
  const TimedSegment({required this.startMin, required this.endMin});
  final double startMin;
  final double endMin;
  double get heightMin => endMin - startMin;
}

/// Colonne et nombre de colonnes pour poser des événements sans se chevaucher.
class CalendarEventPlacement {
  const CalendarEventPlacement({required this.column, required this.columnCount});
  final int column;
  final int columnCount;
}

List<CalendarEventPlacement> layoutCalendarEventColumns(List<TimedSegment> segments) {
  final n = segments.length;
  if (n == 0) return const [];
  final columns = List<int>.filled(n, 0);
  final counts = List<int>.filled(n, 1);
  final order = List<int>.generate(n, (i) => i)
    ..sort((a, b) {
      final byStart = segments[a].startMin.compareTo(segments[b].startMin);
      if (byStart != 0) return byStart;
      return segments[a].endMin.compareTo(segments[b].endMin);
    });

  final columnEnds = <double>[];
  for (final i in order) {
    final seg = segments[i];
    var placed = false;
    for (var c = 0; c < columnEnds.length; c++) {
      if (columnEnds[c] <= seg.startMin + 0.01) {
        columns[i] = c;
        columnEnds[c] = seg.endMin;
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns[i] = columnEnds.length;
      columnEnds.add(seg.endMin);
    }
  }

  final cluster = <int>[];
  var clusterEnd = -1.0;
  void flush() {
    if (cluster.isEmpty) return;
    var maxCol = 0;
    for (final i in cluster) {
      if (columns[i] > maxCol) maxCol = columns[i];
    }
    final count = maxCol + 1;
    for (final i in cluster) {
      counts[i] = count;
    }
    cluster.clear();
    clusterEnd = -1.0;
  }

  for (final i in order) {
    final seg = segments[i];
    if (cluster.isNotEmpty && seg.startMin >= clusterEnd - 0.01) flush();
    cluster.add(i);
    if (seg.endMin > clusterEnd) clusterEnd = seg.endMin;
  }
  flush();

  return [
    for (var i = 0; i < n; i++)
      CalendarEventPlacement(column: columns[i], columnCount: counts[i]),
  ];
}

TimedSegment? timedSegmentOnDay({
  required DateTime start,
  required DateTime end,
  required DateTime day,
  bool allDay = false,
}) {
  if (allDay) return null;
  final day0 = calendarStartOfDay(day);
  final day1 = day0.add(const Duration(days: 1));
  final s = start.toLocal();
  var e = end.toLocal();
  if (!e.isAfter(s)) e = s.add(const Duration(hours: 1));
  final clipS = s.isAfter(day0) ? s : day0;
  final clipE = e.isBefore(day1) ? e : day1;
  if (!clipE.isAfter(clipS)) return null;
  var startMin = clipS.difference(day0).inMinutes.toDouble();
  var endMin = clipE.difference(day0).inMinutes.toDouble();
  if (endMin - startMin < 18) endMin = (startMin + 18).clamp(0, 1440);
  return TimedSegment(startMin: startMin, endMin: endMin);
}

TimedSegment? timedSegmentFromItem(Map<String, dynamic> item, DateTime day) {
  final start = parseCloudityDateTime(
    (item['start_at'] ?? item['starts_at'])?.toString(),
  );
  if (start == null) return null;
  final end = parseCloudityDateTime(
        (item['end_at'] ?? item['ends_at'])?.toString(),
      ) ??
      start.add(const Duration(hours: 1));
  final allDay = item['all_day'] == true || cloudityIsAllDay(
    start.toIso8601String(),
    end.toIso8601String(),
  );
  return timedSegmentOnDay(start: start, end: end, day: day, allDay: allDay);
}

bool calendarItemAllDay(Map<String, dynamic> item) {
  if (item['all_day'] == true) return true;
  final start = (item['start_at'] ?? item['starts_at'])?.toString();
  final end = (item['end_at'] ?? item['ends_at'])?.toString();
  return cloudityIsAllDay(start, end);
}

/// Position verticale de la ligne d’heure, en pixels depuis minuit.
double calendarNowLineTop(DateTime now) {
  final minutes = now.hour * 60 + now.minute + now.second / 60.0;
  return (minutes / 60.0) * kCalendarHourPx;
}

DateTime calendarSlotFromOffset(DateTime day, double dy, double columnHeight) {
  final hours = kCalendarEndHour - kCalendarStartHour;
  final h = kCalendarStartHour + (dy.clamp(0, columnHeight) / columnHeight) * hours;
  var hour = h.floor();
  var minute = ((h - hour) * 2).round() * 30;
  if (minute >= 60) {
    hour += 1;
    minute = 0;
  }
  hour = hour.clamp(0, 23);
  return DateTime(day.year, day.month, day.day, hour, minute);
}

class CalendarTimeGrid extends StatefulWidget {
  const CalendarTimeGrid({
    super.key,
    required this.days,
    required this.items,
    required this.accent,
    required this.onEventTap,
    required this.onSlotTap,
    this.itemTitle,
    this.isTask,
    this.showDayHeaders = true,
    this.showAllDay = true,
    this.onDayHeaderTap,
    this.revealHour,
    this.showNowLine = true,
    this.eventColor,
  });

  final List<DateTime> days;
  final List<Map<String, dynamic>> items;
  final Color accent;
  final void Function(Map<String, dynamic> item) onEventTap;
  final void Function(DateTime start) onSlotTap;
  final String Function(Map<String, dynamic> item)? itemTitle;
  final bool Function(Map<String, dynamic> item)? isTask;
  final bool showDayHeaders;

  /// Bandeau des événements journée entière. Le jour unique peut le masquer.
  final bool showAllDay;

  final void Function(DateTime day)? onDayHeaderTap;

  /// Heure amenée près du haut. La grille reste 0h–23h, scrollable.
  final int? revealHour;

  /// Ligne rouge de l’heure actuelle, uniquement sur la colonne d’aujourd’hui.
  final bool showNowLine;

  /// Couleur d’un événement (agenda). Sinon [accent].
  final Color Function(Map<String, dynamic> item)? eventColor;

  @override
  State<CalendarTimeGrid> createState() => _CalendarTimeGridState();
}

class _CalendarTimeGridState extends State<CalendarTimeGrid> {
  late final ScrollController _scroll;
  Timer? _tick;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    final hour = (widget.revealHour ?? 0).clamp(0, 20);
    _scroll = ScrollController(initialScrollOffset: hour * kCalendarHourPx);
    if (widget.showNowLine) {
      _tick = Timer.periodic(const Duration(seconds: 30), (_) {
        if (!mounted) return;
        setState(() => _now = DateTime.now());
      });
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  bool _allDayOn(Map<String, dynamic> item, DateTime day) {
    if (!calendarItemAllDay(item)) return false;
    final start = parseCloudityDateTime(
      (item['start_at'] ?? item['starts_at'])?.toString(),
    );
    if (start == null) return false;
    return calendarStartOfDay(start.toLocal()) == calendarStartOfDay(day);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hours = kCalendarEndHour - kCalendarStartHour;
    final gridH = hours * kCalendarHourPx;
    final today = calendarStartOfDay(_now);
    final line = theme.colorScheme.outlineVariant;
    final hasAllDay = widget.showAllDay &&
        widget.days.any(
          (d) => widget.items.any((it) => _allDayOn(it, d)),
        );
    return Column(
      children: [
        if (widget.showDayHeaders)
          Row(
            children: [
              const SizedBox(width: 48),
              for (final d in widget.days)
                Expanded(
                  child: InkWell(
                    onTap: widget.onDayHeaderTap == null
                        ? null
                        : () => widget.onDayHeaderTap!(d),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(2, 6, 2, 4),
                      child: Column(
                        children: [
                          Text(
                            _wd(d).replaceAll('.', ''),
                            textAlign: TextAlign.center,
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          Container(
                            width: 28,
                            height: 28,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: calendarStartOfDay(d) == today ? widget.accent : null,
                              shape: BoxShape.circle,
                            ),
                            child: Text(
                              '${d.day}',
                              style: theme.textTheme.labelLarge?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: calendarStartOfDay(d) == today
                                    ? theme.colorScheme.onPrimary
                                    : theme.colorScheme.onSurface,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        if (hasAllDay)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(width: 48),
                for (final d in widget.days)
                  Expanded(
                    child: Column(
                      children: [
                        for (final item in widget.items.where((it) => _allDayOn(it, d)))
                          Padding(
                            padding: const EdgeInsets.fromLTRB(2, 0, 2, 2),
                            child: Material(
                              color: _blockColor(item),
                              borderRadius: BorderRadius.circular(4),
                              child: InkWell(
                                onTap: () => widget.onEventTap(item),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 4,
                                    vertical: 3,
                                  ),
                                  child: Text(
                                    widget.itemTitle?.call(item) ??
                                        item['title']?.toString() ??
                                        '',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: widget.isTask?.call(item) == true
                                          ? Colors.white
                                          : theme.colorScheme.onPrimary,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        Expanded(
          child: SingleChildScrollView(
            controller: _scroll,
            padding: const EdgeInsets.only(bottom: 88),
            child: SizedBox(
              height: gridH,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 48,
                    child: Column(
                      children: [
                        for (var h = kCalendarStartHour; h < kCalendarEndHour; h++)
                          SizedBox(
                            height: kCalendarHourPx,
                            child: Align(
                              alignment: Alignment.topRight,
                              child: Padding(
                                padding: const EdgeInsets.only(right: 6, top: 2),
                                child: Text(
                                  '${h.toString().padLeft(2, '0')}:00',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    fontSize: 11,
                                    height: 1,
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  for (final d in widget.days)
                    Expanded(child: _dayColumn(context, d, gridH, line)),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _dayColumn(BuildContext context, DateTime day, double gridH, Color line) {
    final timed = <Map<String, dynamic>>[];
    final segs = <TimedSegment>[];
    for (final item in widget.items) {
      final seg = timedSegmentFromItem(item, day);
      if (seg == null) continue;
      timed.add(item);
      segs.add(seg);
    }
    final places = layoutCalendarEventColumns(segs);
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(left: BorderSide(color: line)),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          return Stack(
            children: [
              SizedBox(height: gridH, width: double.infinity),
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTapUp: (details) {
                    widget.onSlotTap(
                      calendarSlotFromOffset(day, details.localPosition.dy, gridH),
                    );
                  },
                ),
              ),
              for (var h = 0; h < (kCalendarEndHour - kCalendarStartHour); h++)
                Positioned(
                  top: h * kCalendarHourPx,
                  left: 0,
                  right: 0,
                  child: IgnorePointer(
                    child: Container(height: 1, color: line),
                  ),
                ),
              for (var i = 0; i < timed.length; i++)
                _eventBlock(context, timed[i], segs[i], places[i], width),
              if (widget.showNowLine && calendarStartOfDay(day) == calendarStartOfDay(_now))
                _nowLine(),
            ],
          );
        },
      ),
    );
  }

  Color _blockColor(Map<String, dynamic> item) {
    if (widget.isTask?.call(item) == true) return const Color(0xFF188038);
    return widget.eventColor?.call(item) ?? widget.accent;
  }

  Widget _nowLine() {
    final top = calendarNowLineTop(_now);
    return Positioned(
      key: const Key('calendar-now-line'),
      top: top - 4,
      left: 0,
      right: 0,
      height: 10,
      child: const IgnorePointer(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                color: kCalendarNowLine,
                shape: BoxShape.circle,
              ),
              child: SizedBox(width: 8, height: 8),
            ),
            Expanded(
              child: Align(
                alignment: Alignment.centerLeft,
                child: ColoredBox(
                  color: kCalendarNowLine,
                  child: SizedBox(width: double.infinity, height: 2),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _eventBlock(
    BuildContext context,
    Map<String, dynamic> item,
    TimedSegment seg,
    CalendarEventPlacement place,
    double columnWidth,
  ) {
    final theme = Theme.of(context);
    final task = widget.isTask?.call(item) == true;
    final title = widget.itemTitle?.call(item) ?? item['title']?.toString() ?? '';
    final top = (seg.startMin / 60) * kCalendarHourPx;
    final height = (seg.heightMin / 60) * kCalendarHourPx;
    final count = place.columnCount.clamp(1, 6);
    final gap = 3.0;
    final inner = (columnWidth - gap * (count + 1)).clamp(0.0, columnWidth);
    final blockW = inner / count;
    final left = gap + place.column * (blockW + gap);
    return Positioned(
      top: top + 1,
      left: left,
      width: blockW.clamp(0.0, columnWidth),
      height: (height - 2).clamp(16.0, gridMaxHeight),
      child: Material(
        color: _blockColor(item),
        borderRadius: BorderRadius.circular(6),
        child: InkWell(
          onTap: () => widget.onEventTap(item),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
            child: Text(
              title,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: task ? Colors.white : theme.colorScheme.onPrimary,
                fontSize: 12,
                height: 1.15,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

const double gridMaxHeight = 24 * kCalendarHourPx;

String _wd(DateTime d) {
  const names = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  return names[d.weekday - 1];
}
