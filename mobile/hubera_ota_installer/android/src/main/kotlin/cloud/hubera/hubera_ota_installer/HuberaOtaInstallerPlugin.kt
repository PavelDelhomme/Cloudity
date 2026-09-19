package cloud.hubera.hubera_ota_installer

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File

class HuberaOtaInstallerPlugin :
    FlutterPlugin,
    MethodChannel.MethodCallHandler,
    ActivityAware {

    private lateinit var channel: MethodChannel
    private lateinit var legacyChannel: MethodChannel
    private lateinit var appContext: android.content.Context
    private var activity: Activity? = null

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        appContext = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, "hubera_ota_installer")
        channel.setMethodCallHandler(this)
        legacyChannel = MethodChannel(binding.binaryMessenger, "cloudity_ota_installer")
        legacyChannel.setMethodCallHandler(this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
        legacyChannel.setMethodCallHandler(null)
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activity = binding.activity
    }

    override fun onDetachedFromActivityForConfigChanges() {
        activity = null
    }

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
        activity = binding.activity
    }

    override fun onDetachedFromActivity() {
        activity = null
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "canInstallPackages" -> result.success(canInstallPackages())
            "openInstallPermissionSettings" -> {
                openInstallPermissionSettings()
                result.success(null)
            }
            "installApk" -> {
                val path = call.argument<String>("path")?.trim().orEmpty()
                if (path.isEmpty()) {
                    result.error("invalid", "path required", null)
                    return
                }
                try {
                    installApk(path)
                    result.success(true)
                } catch (e: Exception) {
                    result.error("install_failed", e.message ?: "install failed", null)
                }
            }
            else -> result.notImplemented()
        }
    }

    private fun canInstallPackages(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        return appContext.packageManager.canRequestPackageInstalls()
    }

    private fun openInstallPermissionSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${appContext.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val ctx = activity ?: appContext
        ctx.startActivity(intent)
    }

    private fun installApk(path: String) {
        if (!canInstallPackages()) {
            openInstallPermissionSettings()
            throw IllegalStateException(
                "Autorise l’installation d’apps pour ${appContext.packageName}, puis réessaie.",
            )
        }
        val file = File(path)
        if (!file.isFile || file.length() <= 0L) {
            throw IllegalArgumentException("APK introuvable ou vide")
        }
        val authority = "${appContext.packageName}.hubera.ota"
        val uri = FileProvider.getUriForFile(appContext, authority, file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
        }
        val resInfo = appContext.packageManager.queryIntentActivities(
            intent,
            PackageManager.MATCH_DEFAULT_ONLY,
        )
        for (ri in resInfo) {
            appContext.grantUriPermission(
                ri.activityInfo.packageName,
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        }
        val ctx = activity ?: appContext
        ctx.startActivity(intent)
    }
}
