import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

class DocsApiException implements Exception {
  DocsApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class DocsApi {
  DocsApi({this.base = 'https://docs.hubera.cloud'});

  final String base;
  String? token;

  Map<String, String> get _headers => {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        if (token != null && token!.isNotEmpty) 'Authorization': 'Bearer $token',
      };

  Uri _u(String path, [Map<String, String>? q]) =>
      Uri.parse('$base$path').replace(queryParameters: q);

  Future<dynamic> _json(http.Response r) {
    if (r.statusCode == 401) throw DocsApiException('auth');
    if (r.statusCode < 200 || r.statusCode >= 300) {
      try {
        final o = jsonDecode(r.body);
        throw DocsApiException((o['error'] ?? 'HTTP ${r.statusCode}').toString());
      } catch (e) {
        if (e is DocsApiException) rethrow;
        throw DocsApiException('HTTP ${r.statusCode}');
      }
    }
    if (r.body.isEmpty) return Future.value(<String, dynamic>{});
    return Future.value(jsonDecode(r.body));
  }

  Future<String> loginSso(String accessToken) async {
    final r = await http.post(
      _u('/api/auth/login/sso'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'access_token': accessToken}),
    );
    final o = await _json(r) as Map<String, dynamic>;
    token = (o['token'] ?? '').toString();
    if (token!.isEmpty) throw DocsApiException('SSO Docs refusé');
    return (o['email'] ?? '').toString();
  }

  Future<Map<String, dynamic>> dashboard() async =>
      await _json(await http.get(_u('/api/dashboard'), headers: _headers)) as Map<String, dynamic>;

  Future<List<dynamic>> tasks() async {
    final o = await _json(await http.get(_u('/api/tasks'), headers: _headers)) as Map<String, dynamic>;
    return (o['tasks'] as List?) ?? const [];
  }

  Future<List<dynamic>> columns() async {
    final o = await _json(await http.get(_u('/api/columns'), headers: _headers)) as Map<String, dynamic>;
    return (o['columns'] as List?) ?? const [];
  }

  Future<void> createTask({
    required String title,
    String body = '',
    String project = 'docs',
    String category = 'feature',
    String columnId = 'todo',
  }) async {
    await _json(
      await http.post(
        _u('/api/tasks'),
        headers: _headers,
        body: jsonEncode({
          'title': title,
          'body': body,
          'project': project,
          'category': category,
          'column_id': columnId,
        }),
      ),
    );
  }

  Future<void> patchTask(String id, Map<String, dynamic> patch) async {
    await _json(await http.patch(_u('/api/tasks/$id'), headers: _headers, body: jsonEncode(patch)));
  }

  Future<List<dynamic>> docs() async {
    final o = await _json(await http.get(_u('/api/docs'), headers: _headers)) as Map<String, dynamic>;
    return (o['files'] as List?) ?? const [];
  }

  Future<String> docFile(String path) async {
    final r = await http.get(
      _u('/api/docs/file', {'path': path}),
      headers: _headers,
    );
    if (r.statusCode == 401) throw DocsApiException('auth');
    if (r.statusCode >= 300) throw DocsApiException('HTTP ${r.statusCode}');
    return r.body;
  }

  Future<void> saveDoc(String path, String markdown) async {
    await _json(
      await http.put(
        _u('/api/docs/file'),
        headers: _headers,
        body: jsonEncode({'path': path, 'markdown': markdown}),
      ),
    );
  }

  Future<List<dynamic>> reports() async {
    final o = await _json(await http.get(_u('/api/reports'), headers: _headers)) as Map<String, dynamic>;
    return (o['reports'] as List?) ?? const [];
  }

  Future<Uint8List> reportBytes(String filename) async {
    final r = await http.get(
      Uri.parse('$base/api/reports/file/${Uri.encodeComponent(filename)}'),
      headers: _headers,
    );
    if (r.statusCode == 401) throw DocsApiException('auth');
    if (r.statusCode >= 300) throw DocsApiException('HTTP ${r.statusCode}');
    return r.bodyBytes;
  }

  Future<Map<String, dynamic>> gantt() async =>
      await _json(await http.get(_u('/api/gantt'), headers: _headers)) as Map<String, dynamic>;

  Future<List<dynamic>> remarks() async {
    final o = await _json(await http.get(_u('/api/remarks'), headers: _headers)) as Map<String, dynamic>;
    return (o['remarks'] as List?) ?? const [];
  }

  Future<void> addRemark({required String app, required String body, String kind = 'retour'}) async {
    await _json(
      await http.post(
        _u('/api/remarks'),
        headers: _headers,
        body: jsonEncode({'app': app, 'body': body, 'kind': kind}),
      ),
    );
  }

  Future<void> patchRemark(String id, {required String app, required String body, required String kind}) async {
    await _json(
      await http.patch(
        _u('/api/remarks/$id'),
        headers: _headers,
        body: jsonEncode({'app': app, 'body': body, 'kind': kind}),
      ),
    );
  }

  Future<File> saveTemp(String name, Uint8List bytes) async {
    final dir = await Directory.systemTemp.createTemp('hubera-docs-');
    final f = File('${dir.path}/$name');
    await f.writeAsBytes(bytes);
    return f;
  }
}
