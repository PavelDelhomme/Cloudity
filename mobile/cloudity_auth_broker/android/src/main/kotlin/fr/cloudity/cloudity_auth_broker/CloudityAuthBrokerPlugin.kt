package fr.cloudity.cloudity_auth_broker

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

class CloudityAuthBrokerPlugin : FlutterPlugin, MethodChannel.MethodCallHandler {

    private lateinit var channel: MethodChannel
    private lateinit var appContext: android.content.Context
    private val brokerExecutor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "hubera-id-broker").apply { isDaemon = true }
    }
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        appContext = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, "cloudity_auth_broker")
        channel.setMethodCallHandler(this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
        brokerExecutor.shutdown()
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "listAccounts" -> offMain(result) { CloudityAuthBrokerHelper.listAccounts(appContext) }
            "freshAccount" -> {
                val email = call.argument<String>("email").orEmpty()
                offMain(result) { CloudityAuthBrokerHelper.freshAccount(appContext, email) }
            }
            "listAllAccountCopies" -> offMain(result) { CloudityAuthBrokerHelper.listAllCopies(appContext) }
            "listHuberaDeviceAccounts" -> offMain(result) {
                CloudityAuthBrokerHelper.listHuberaDeviceAccounts(appContext)
            }
            "listAccountManagerAccounts" -> offMain(result) {
                CloudityAuthBrokerHelper.listAccountManagerAccounts(appContext)
            }
            "saveSession" -> {
                val email = call.argument<String>("email")?.trim().orEmpty()
                if (email.isEmpty()) {
                    result.error("invalid", "email required", null)
                    return
                }
                val gateway = call.argument<String>("gateway_url").orEmpty()
                val access = call.argument<String>("access_token").orEmpty()
                val refresh = call.argument<String>("refresh_token").orEmpty()
                val tenant = call.argument<Int>("tenant_id") ?: 1
                offMain(result) {
                    CloudityAuthBrokerHelper.saveSession(
                        appContext,
                        email,
                        gateway,
                        access,
                        refresh,
                        tenant,
                    )
                    null
                }
            }
            "clearAccount" -> {
                val email = call.argument<String>("email")?.trim().orEmpty()
                offMain(result) {
                    if (email.isNotEmpty()) {
                        CloudityAuthBrokerHelper.clearAccount(appContext, email)
                    }
                    null
                }
            }
            "idInstalled" -> result.success(isHuberaIdInstalled(appContext))
            "idVersionCode" -> result.success(huberaIdVersionCode(appContext))
            "openIdInstall" -> {
                openHuberaIdInstall(appContext)
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    /** Les inserts SSO vers les autres apps ne doivent pas geler le fil UI. */
    private fun offMain(result: MethodChannel.Result, work: () -> Any?) {
        brokerExecutor.execute {
            try {
                val value = work()
                mainHandler.post { result.success(value) }
            } catch (e: Exception) {
                mainHandler.post { result.error("broker", e.message ?: "broker", null) }
            }
        }
    }

    private fun isHuberaIdInstalled(ctx: android.content.Context): Boolean =
        huberaIdVersionCode(ctx) >= 0

    /** -1 si le paquet n’est pas là. Ne désinstalle rien et n’efface pas la session. */
    private fun huberaIdVersionCode(ctx: android.content.Context): Int =
        runCatching {
            val info = ctx.packageManager.getPackageInfo(HUBERA_ID_PACKAGE, 0)
            if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toInt() else @Suppress("DEPRECATION") info.versionCode
        }.getOrDefault(-1)

    private fun openHuberaIdInstall(ctx: android.content.Context) {
        val launch = ctx.packageManager.getLaunchIntentForPackage(HUBERA_ID_PACKAGE)
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(launch)
            return
        }
        val page = Intent(Intent.ACTION_VIEW, Uri.parse(HUBERA_ID_INSTALL)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { ctx.startActivity(page) }
    }

    companion object {
        private const val HUBERA_ID_PACKAGE = "cloud.hubera.id"
        private const val HUBERA_ID_INSTALL = "https://id.hubera.cloud/"
    }
}
