import 'dart:async';
import 'dart:collection';

/// Limite les téléchargements d'images Cloudity pour éviter les 429 gateway.
class PhotoLoadQueue {
  PhotoLoadQueue._();
  static final PhotoLoadQueue instance = PhotoLoadQueue._();

  static const int maxConcurrent = 4;

  int _active = 0;
  final Queue<Completer<void>> _waiters = Queue<Completer<void>>();

  Future<T> run<T>(Future<T> Function() job) async {
    await _acquire();
    try {
      return await job();
    } finally {
      _release();
    }
  }

  Future<void> _acquire() async {
    if (_active < maxConcurrent) {
      _active++;
      return;
    }
    final waiter = Completer<void>();
    _waiters.add(waiter);
    await waiter.future;
    _active++;
  }

  void _release() {
    _active = (_active - 1).clamp(0, maxConcurrent);
    if (_waiters.isNotEmpty) {
      _waiters.removeFirst().complete();
    }
  }
}
