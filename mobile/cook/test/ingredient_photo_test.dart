import 'package:cloudity_cook/ingredient_photo.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('l’URL vise Wikimedia Commons, pas un moteur', () {
    final uri = commonsIngredientSearchUri('tomate');
    expect(uri.host, 'commons.wikimedia.org');
    expect(uri.queryParameters['gsrsearch'], 'tomate');
    expect(uri.toString().contains('google'), isFalse);
  });

  test('garde une vignette CC BY-SA et refuse le NC', () {
    expect(isOpenCommonsLicense('CC BY-SA 4.0'), isTrue);
    expect(isOpenCommonsLicense('CC0'), isTrue);
    expect(isOpenCommonsLicense('Public domain'), isTrue);
    expect(isOpenCommonsLicense('CC BY-NC 4.0'), isFalse);
    expect(isOpenCommonsLicense('CC BY-ND 4.0'), isFalse);
    expect(isOpenCommonsLicense('All rights reserved'), isFalse);
    expect(isOpenCommonsLicense(''), isFalse);

    final url = photoUrlFromCommonsJson({
      'query': {
        'pages': {
          '1': {
            'imageinfo': [
              {
                'thumburl': 'https://upload.wikimedia.org/thumb/a/a.jpg/160px-a.jpg',
                'extmetadata': {
                  'LicenseShortName': {'value': 'CC BY-NC 4.0'},
                },
              },
            ],
          },
          '2': {
            'imageinfo': [
              {
                'thumburl': 'https://upload.wikimedia.org/thumb/b/b.jpg/160px-b.jpg',
                'extmetadata': {
                  'LicenseShortName': {'value': 'CC BY-SA 4.0'},
                },
              },
            ],
          },
        },
      },
    });
    expect(url, contains('b.jpg'));
  });

  test('sans licence ouverte, pas d’URL', () {
    expect(
      photoUrlFromCommonsJson({
        'query': {
          'pages': {
            '1': {
              'imageinfo': [
                {
                  'thumburl': 'https://upload.wikimedia.org/a.pdf',
                  'extmetadata': {
                    'LicenseShortName': {'value': 'Public domain'},
                  },
                },
              ],
            },
          },
        },
      }),
      isNull,
    );
  });
}
