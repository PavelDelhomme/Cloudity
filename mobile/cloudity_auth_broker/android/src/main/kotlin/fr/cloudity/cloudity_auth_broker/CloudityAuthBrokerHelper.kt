package fr.cloudity.cloudity_auth_broker

import android.content.ContentValues
import android.content.Context
import android.net.Uri

object CloudityAuthBrokerHelper {

    private val peerPackages = listOf(
        "fr.cloudity.cloudity_photos",
        "fr.cloudity.cloudity_drive",
        "fr.cloudity.cloudity_mail",
        "com.cloudity.cloudity_pass",
    )

    fun authorityFor(packageName: String): String = "$packageName.cloudity.auth"

    fun accountsUri(packageName: String): Uri =
        Uri.parse("content://${authorityFor(packageName)}/accounts")

    fun listAccounts(ctx: Context): List<Map<String, Any?>> {
        val seen = linkedSetOf<String>()
        val out = mutableListOf<Map<String, Any?>>()
        val packages = (peerPackages + ctx.packageName).distinct()
        for (pkg in packages) {
            val uri = accountsUri(pkg)
            try {
                ctx.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val emailIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_EMAIL)
                    val gwIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_GATEWAY)
                    val accessIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_ACCESS)
                    val refreshIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_REFRESH)
                    val tenantIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_TENANT)
                    val sourceIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_SOURCE)
                    while (cursor.moveToNext()) {
                        val email = if (emailIdx >= 0) cursor.getString(emailIdx) else ""
                        if (email.isEmpty() || !seen.add(email)) continue
                        out.add(
                            mapOf(
                                "email" to email,
                                "gateway_url" to if (gwIdx >= 0) cursor.getString(gwIdx) else "",
                                "access_token" to if (accessIdx >= 0) cursor.getString(accessIdx) else "",
                                "refresh_token" to if (refreshIdx >= 0) cursor.getString(refreshIdx) else "",
                                "tenant_id" to if (tenantIdx >= 0) cursor.getInt(tenantIdx) else 1,
                                "source_package" to if (sourceIdx >= 0) cursor.getString(sourceIdx) else pkg,
                            ),
                        )
                    }
                }
            } catch (_: Exception) {
                // App Cloudity absente ou non signée avec la même clé.
            }
        }
        return out
    }

    fun saveSession(
        ctx: Context,
        email: String,
        gatewayUrl: String,
        accessToken: String,
        refreshToken: String,
        tenantId: Int,
    ) {
        val values = ContentValues().apply {
            put(CloudityAuthProvider.COL_EMAIL, email)
            put(CloudityAuthProvider.COL_GATEWAY, gatewayUrl)
            put(CloudityAuthProvider.COL_ACCESS, accessToken)
            put(CloudityAuthProvider.COL_REFRESH, refreshToken)
            put(CloudityAuthProvider.COL_TENANT, tenantId)
        }
        ctx.contentResolver.insert(accountsUri(ctx.packageName), values)
    }

    fun clearAccount(ctx: Context, email: String) {
        val uri = Uri.parse("content://${authorityFor(ctx.packageName)}/accounts/$email")
        ctx.contentResolver.delete(uri, null, null)
    }
}
