import 'package:cloudity_cook/ingredient_photo.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('l’URL vise Wikimedia Commons, pas un moteur', () {
    final uri = commonsIngredientSearchUri('tomate');
    expect(uri.host, 'commons.wikimedia.org');
    expect(uri.queryParameters['gsrsearch'], 'tomate');
    expect(cookPhotoQuery('sel'), 'table salt');
    expect(cookPhotoQuery('black eyed peas'), 'black-eyed pea beans');
    expect(commonsTitleLooksLikeAct('File:Black Eyed Peas live at concert.jpg'), isTrue);
    expect(commonsTitleLooksLikeAct('File:BlackEyedPeas.JPG'), isTrue);
    expect(commonsTitleLooksLikeAct('File:Black-eyed pea beans.jpg'), isFalse);
    expect(commonsTitleLooksLikeAct('File:Black-eyed peas salad.jpg'), isFalse);
    expect(cookPhotoQuery('savon'), 'soap');
    expect(
      commonsIngredientSearchUri(cookPhotoQuery('sel')).queryParameters['gsrsearch'],
      'table salt',
    );
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

  test('une photo de concert ne passe pas devant les haricots', () {
    final url = photoUrlFromCommonsJson({
      'query': {
        'pages': {
          '0': {
            'title': 'File:BlackEyedPeas.JPG',
            'index': 0,
            'imageinfo': [
              {
                'thumburl': 'https://upload.wikimedia.org/thumb/band/group.jpg/160px-group.jpg',
                'extmetadata': {
                  'LicenseShortName': {'value': 'CC BY-SA 4.0'},
                },
              },
            ],
          },
          '1': {
            'title': 'File:Black Eyed Peas live at concert.jpg',
            'index': 1,
            'imageinfo': [
              {
                'thumburl': 'https://upload.wikimedia.org/thumb/band/band.jpg/160px-band.jpg',
                'extmetadata': {
                  'LicenseShortName': {'value': 'CC BY-SA 4.0'},
                },
              },
            ],
          },
          '2': {
            'title': 'File:Black-eyed pea beans.jpg',
            'index': 2,
            'imageinfo': [
              {
                'thumburl': 'https://upload.wikimedia.org/thumb/beans/beans.jpg/160px-beans.jpg',
                'extmetadata': {
                  'LicenseShortName': {'value': 'CC BY-SA 4.0'},
                },
              },
            ],
          },
        },
      },
    });
    expect(url, contains('beans.jpg'));
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
