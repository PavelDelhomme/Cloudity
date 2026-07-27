import 'dart:async';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter/material.dart';

import 'package:cloudity_shared/cloudity_shared.dart';

/// Parse une URI `otpauth://totp/...` (secret base32).
OtpAuthParams? parseOtpauthUri(String uri) {
  try {
    final u = Uri.parse(uri.trim());
    if (u.scheme != 'otpauth' || u.host != 'totp') return null;
    final secret = u.queryParameters['secret']?.trim();
    if (secret == null || secret.isEmpty) return null;
    final digits = int.tryParse(u.queryParameters['digits'] ?? '') ?? 6;
    final period = int.tryParse(u.queryParameters['period'] ?? '') ?? 30;
    final issuer = u.queryParameters['issuer'];
    final label = Uri.decodeComponent(u.path.replaceFirst('/', ''));
    return OtpAuthParams(
      secretBase32: secret,
      digits: digits.clamp(6, 8),
      period: period.clamp(15, 120),
      issuer: issuer,
      accountName: label.contains(':') ? label.split(':').last : label,
    );
  } catch (_) {
    return null;
  }
}

class OtpAuthParams {
  const OtpAuthParams({
    required this.secretBase32,
    required this.digits,
    required this.period,
    this.issuer,
    this.accountName,
  });

  final String secretBase32;
  final int digits;
  final int period;
  final String? issuer;
  final String? accountName;
}

Future<String> generateTotp(OtpAuthParams params, [DateTime? now]) async {
  final secret = _decodeBase32(params.secretBase32);
  final t = ((now ?? DateTime.now()).millisecondsSinceEpoch ~/ 1000) ~/ params.period;
  final counter = ByteData(8)..setInt64(0, t, Endian.big);
  final hmac = Hmac(Sha1());
  final mac = await hmac.calculateMac(counter.buffer.asUint8List(), secretKey: SecretKey(secret));
  final bytes = mac.bytes;
  final offset = bytes.last & 0x0f;
  final binary = ((bytes[offset] & 0x7f) << 24) |
      ((bytes[offset + 1] & 0xff) << 16) |
      ((bytes[offset + 2] & 0xff) << 8) |
      (bytes[offset + 3] & 0xff);
  final mod = _pow10(params.digits);
  return (binary % mod).toString().padLeft(params.digits, '0');
}

int totpSecondsRemaining(OtpAuthParams params, [DateTime? now]) {
  final epoch = (now ?? DateTime.now()).millisecondsSinceEpoch ~/ 1000;
  return params.period - (epoch % params.period);
}

int _pow10(int n) {
  var v = 1;
  for (var i = 0; i < n; i++) {
    v *= 10;
  }
  return v;
}

List<int> _decodeBase32(String input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  final cleaned = input.toUpperCase().replaceAll(RegExp(r'[^A-Z2-7]'), '');
  final out = <int>[];
  var buffer = 0;
  var bits = 0;
  for (var i = 0; i < cleaned.length; i++) {
    final val = alphabet.indexOf(cleaned[i]);
    if (val < 0) continue;
    buffer = (buffer << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.add((buffer >> bits) & 0xff);
    }
  }
  return out;
}

/// Affiche le code TOTP + copie auto si activée dans les préférences Pass.
class PassTotpDisplay extends StatefulWidget {
  const PassTotpDisplay({
    super.key,
    required this.otpauthUri,
    required this.prefs,
  });

  final String otpauthUri;
  final PassAppSettings prefs;

  @override
  State<PassTotpDisplay> createState() => _PassTotpDisplayState();
}

class _PassTotpDisplayState extends State<PassTotpDisplay> {
  OtpAuthParams? get _parsed => parseOtpauthUri(widget.otpauthUri);

  String? _code;
  String? _error;
  int _secondsLeft = 30;
  String? _lastAutoCopied;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _tick();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  @override
  void didUpdateWidget(covariant PassTotpDisplay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.prefs.totpAutoCopy != widget.prefs.totpAutoCopy ||
        oldWidget.prefs.clipboardEnabled != widget.prefs.clipboardEnabled) {
      _lastAutoCopied = null;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _tick() async {
    final parsed = _parsed;
    if (parsed == null) {
      if (mounted) setState(() => _error = 'URI TOTP invalide');
      return;
    }
    try {
      final code = await generateTotp(parsed);
      if (!mounted) return;
      setState(() {
        _code = code;
        _error = null;
        _secondsLeft = totpSecondsRemaining(parsed);
      });
      if (widget.prefs.clipboardEnabled &&
          widget.prefs.totpAutoCopy &&
          code != _lastAutoCopied) {
        _lastAutoCopied = code;
        await PassClipboard.copy(code, prefs: widget.prefs);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _code = null;
      });
    }
  }

  Future<void> _copy() async {
    if (_code == null) return;
    if (!widget.prefs.clipboardEnabled) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Copie presse-papier désactivée (Paramètres → Pass)')),
      );
      return;
    }
    final ttl = widget.prefs.clipboardClearMs > 0
        ? Duration(milliseconds: widget.prefs.clipboardClearMs)
        : null;
    await PassClipboard.copy(_code!, prefs: widget.prefs, ttlOverride: ttl);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Code TOTP copié')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final parsed = _parsed;
    if (parsed == null) {
      return Text('URI TOTP invalide', style: TextStyle(color: Theme.of(context).colorScheme.error));
    }
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${parsed.issuer ?? '2FA'}${parsed.accountName != null ? ' · ${parsed.accountName}' : ''}',
                style: Theme.of(context).textTheme.labelSmall,
              ),
              Text(
                _error ?? _code ?? '······',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontFamily: 'monospace',
                      letterSpacing: 2,
                    ),
              ),
            ],
          ),
        ),
        Text('${_secondsLeft}s', style: Theme.of(context).textTheme.labelSmall),
        IconButton(
          tooltip: 'Copier le code TOTP',
          icon: const Icon(Icons.copy),
          onPressed: _code == null ? null : _copy,
        ),
      ],
    );
  }
}
