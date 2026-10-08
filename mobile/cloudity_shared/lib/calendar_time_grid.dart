import 'package:flutter/material.dart';

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

class CalendarTimeGrid extends StatelessWidget {
  const CalendarTimeGrid({
    super.key,
    required this.days,
    required this.items,
    required this.accent,
    required this.onEventTap,
    required this.onSlotTap,
    this.itemTitle,
    this.isTask,
  });

  final List<DateTime> days;
  final List<Map<String, dynamic>> items;
  final Color accent;
  final void Function(Map<String, dynamic> item) onEventTap;
  final void Function(DateTime start) onSlotTap;
  final String Function(Map<String, dynamic> item)? itemTitle;
  final bool Function(Map<String, dynamic> item)? isTask;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hours = kCalendarEndHour - kCalendarStartHour;
    final gridH = hours * kCalendarHourPx;
    final today = calendarStartOfDay(DateTime.now());
    return Column(
      children: [
        Row(
          children: [
            const SizedBox(width: 44),
            for (final d in days)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Text(
                    '${_wd(d)} ${d.day}',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: calendarStartOfDay(d) == today
                          ? accent
                          : theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
          ],
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(width: 44),
            for (final d in days)
              Expanded(
                child: Column(
                  children: [
                    for (final item in items.where((it) {
                      if (!calendarItemAllDay(it)) return false;
                      final start = parseCloudityDateTime(
                        (it['start_at'] ?? it['starts_at'])?.toString(),
                      );
                      if (start == null) return false;
                      return calendarStartOfDay(start.toLocal()) == calendarStartOfDay(d);
                    }))
                      Padding(
                        padding: const EdgeInsets.fromLTRB(2, 0, 2, 2),
                        child: Material(
                          color: isTask?.call(item) == true
                              ? const Color(0xFF188038)
                              : accent,
                          borderRadius: BorderRadius.circular(4),
                          child: InkWell(
                            onTap: () => onEventTap(item),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                              child: Text(
                                itemTitle?.call(item) ?? item['title']?.toString() ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
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
        Expanded(
          child: SingleChildScrollView(
            child: SizedBox(
              height: gridH,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 44,
                    child: Column(
                      children: [
                        for (var h = kCalendarStartHour; h < kCalendarEndHour; h++)
                          SizedBox(
                            height: kCalendarHourPx,
                            child: Text(
                              '${h.toString().padLeft(2, '0')}:00',
                              style: theme.textTheme.labelSmall?.copyWith(
                                fontSize: 10,
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                              textAlign: TextAlign.right,
                            ),
                          ),
                      ],
                    ),
                  ),
                  for (final d in days)
                    Expanded(child: _dayColumn(context, d, gridH)),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _dayColumn(BuildContext context, DateTime day, double gridH) {
    final theme = Theme.of(context);
    final dayItems = items.where((item) {
      final start = parseCloudityDateTime(
        (item['start_at'] ?? item['starts_at'])?.toString(),
      );
      if (start == null) return false;
      final local = start.toLocal();
      return calendarStartOfDay(local) == calendarStartOfDay(day) ||
          timedSegmentFromItem(item, day) != null ||
          (calendarItemAllDay(item) &&
              calendarStartOfDay(local) == calendarStartOfDay(day));
    }).toList();
    return Container(
      decoration: BoxDecoration(
        border: Border(
          left: BorderSide(color: theme.dividerColor.withValues(alpha: 0.4)),
        ),
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapUp: (details) {
                onSlotTap(calendarSlotFromOffset(day, details.localPosition.dy, gridH));
              },
            ),
          ),
          for (var h = 0; h < (kCalendarEndHour - kCalendarStartHour); h++)
            Positioned(
              top: h * kCalendarHourPx,
              left: 0,
              right: 0,
              child: IgnorePointer(
                child: Container(height: 1, color: theme.dividerColor.withValues(alpha: 0.35)),
              ),
            ),
          for (final item in dayItems)
            if (timedSegmentFromItem(item, day) != null)
              _eventBlock(item, timedSegmentFromItem(item, day)!),
        ],
      ),
    );
  }

  Widget _eventBlock(Map<String, dynamic> item, TimedSegment seg) {
    final task = isTask?.call(item) == true;
    final title = itemTitle?.call(item) ?? item['title']?.toString() ?? '';
    final top = (seg.startMin / 60) * kCalendarHourPx;
    final height = (seg.heightMin / 60) * kCalendarHourPx;
    return Positioned(
      top: top,
      left: 2,
      right: 2,
      height: height.clamp(18, 24 * kCalendarHourPx),
      child: Material(
        color: task ? const Color(0xFF188038) : accent,
        borderRadius: BorderRadius.circular(6),
        child: InkWell(
          onTap: () => onEventTap(item),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
            child: Text(
              title,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ),
    );
  }

  String _wd(DateTime d) {
    const names = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
    return names[d.weekday - 1];
  }
}
