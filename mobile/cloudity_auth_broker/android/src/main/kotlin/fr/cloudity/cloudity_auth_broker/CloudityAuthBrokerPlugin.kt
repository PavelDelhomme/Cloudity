package fr.cloudity.cloudity_auth_broker

import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class CloudityAuthBrokerPlugin : FlutterPlugin, MethodChannel.MethodCallHandler {

    private lateinit var channel: MethodChannel
    private lateinit var appContext: android.content.Context

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        appContext = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, "cloudity_auth_broker")
        channel.setMethodCallHandler(this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "listAccounts" -> result.success(CloudityAuthBrokerHelper.listAccounts(appContext))
            "saveSession" -> {
                val email = call.argument<String>("email")?.trim().orEmpty()
                if (email.isEmpty()) {
                    result.error("invalid", "email required", null)
                    return
                }
                CloudityAuthBrokerHelper.saveSession(
                    appContext,
                    email,
                    call.argument<String>("gateway_url").orEmpty(),
                    call.argument<String>("access_token").orEmpty(),
                    call.argument<String>("refresh_token").orEmpty(),
                    call.argument<Int>("tenant_id") ?: 1,
                )
                result.success(null)
            }
            "clearAccount" -> {
                val email = call.argument<String>("email")?.trim().orEmpty()
                if (email.isNotEmpty()) {
                    CloudityAuthBrokerHelper.clearAccount(appContext, email)
                }
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }
}
