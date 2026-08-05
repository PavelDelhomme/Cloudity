import 'package:cloudity_shared/cloudity_shared.dart';

export 'package:cloudity_shared/auth/auth_exception.dart';

/// Client gateway — auth H19 dans cloudity_shared ; métier via SuiteProduct*.
class AuthApi extends CloudityAuthClient {
  AuthApi(super.gatewayBase);
}
