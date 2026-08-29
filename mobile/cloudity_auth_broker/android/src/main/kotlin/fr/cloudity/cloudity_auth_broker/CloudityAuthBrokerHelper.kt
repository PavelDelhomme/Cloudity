package fr.cloudity.cloudity_auth_broker

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.util.Base64
import org.json.JSONObject

object CloudityAuthBrokerHelper {

    /** Toutes les apps Cloudity signées avec la même clé (suite Android). */
    private val peerPackages = listOf(
        "fr.cloudity.cloudity_mail",
        "fr.cloudity.cloudity_drive",
        "fr.cloudity.cloudity_photos",
        "com.cloudity.cloudity_pass",
        "fr.cloudity.cloudity_calendar",
        "fr.cloudity.cloudity_contacts",
        "fr.cloudity.cloudity_notes",
        "fr.cloudity.cloudity_tasks",
        "fr.cloudity.admin_app",
    )

    fun authorityFor(packageName: String): String = "$packageName.cloudity.auth"

    fun accountsUri(packageName: String): Uri =
        Uri.parse("content://${authorityFor(packageName)}/accounts")

    private fun allPackages(ctx: Context): List<String> =
        (peerPackages + ctx.packageName).distinct()

    /**
     * Liste une entrée par e-mail en préférant la copie **la plus fraîche**
     * (access JWT avec `exp` le plus élevé, puis `updated_at`).
     *
     * Évite le bug « premier gagne » (souvent Mail avec un refresh déjà rotaté).
     */
    fun listAccounts(ctx: Context): List<Map<String, Any?>> {
        val bestByEmail = linkedMapOf<String, Candidate>()
        for (cand in listAllCopiesInternal(ctx)) {
            val prev = bestByEmail[cand.email]
            if (prev == null || cand.isFresherThan(prev)) {
                bestByEmail[cand.email] = cand
            }
        }
        return bestByEmail.values.map { it.toMap() }
    }

    /** Toutes les copies brutes (tous les ContentProviders peers), pour retry SSO. */
    fun listAllCopies(ctx: Context): List<Map<String, Any?>> =
        listAllCopiesInternal(ctx).map { it.toMap() }

    private fun listAllCopiesInternal(ctx: Context): List<Candidate> {
        val out = mutableListOf<Candidate>()
        for (pkg in allPackages(ctx)) {
            val uri = accountsUri(pkg)
            try {
                ctx.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val emailIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_EMAIL)
                    val gwIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_GATEWAY)
                    val accessIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_ACCESS)
                    val refreshIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_REFRESH)
                    val tenantIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_TENANT)
                    val sourceIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_SOURCE)
                    val updatedIdx = cursor.getColumnIndex(CloudityAuthProvider.COL_UPDATED_AT)
                    while (cursor.moveToNext()) {
                        val email = if (emailIdx >= 0) cursor.getString(emailIdx).orEmpty() else ""
                        val refresh = if (refreshIdx >= 0) cursor.getString(refreshIdx).orEmpty() else ""
                        if (email.isEmpty() || refresh.isEmpty()) continue
                        val access = if (accessIdx >= 0) cursor.getString(accessIdx).orEmpty() else ""
                        out.add(
                            Candidate(
                                email = email,
                                gatewayUrl = if (gwIdx >= 0) cursor.getString(gwIdx).orEmpty() else "",
                                accessToken = access,
                                refreshToken = refresh,
                                tenantId = if (tenantIdx >= 0) cursor.getInt(tenantIdx) else 1,
                                sourcePackage = if (sourceIdx >= 0) {
                                    cursor.getString(sourceIdx).orEmpty().ifEmpty { pkg }
                                } else {
                                    pkg
                                },
                                updatedAt = if (updatedIdx >= 0) cursor.getLong(updatedIdx) else 0L,
                                accessExp = jwtExpSeconds(access),
                            ),
                        )
                    }
                }
            } catch (_: Exception) {
                // App absente ou non signée avec la même clé.
            }
        }
        return out
    }

    /**
     * Écrit la session dans **toutes** les apps peers (même signature).
     * Indispensable : le serveur rotate le refresh à chaque `/auth/refresh` —
     * sans propagation, les autres apps gardent un refresh mort → 401.
     */
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
            put(CloudityAuthProvider.COL_UPDATED_AT, System.currentTimeMillis())
        }
        for (pkg in allPackages(ctx)) {
            try {
                ctx.contentResolver.insert(accountsUri(pkg), values)
            } catch (_: Exception) {
                // Peer non installé / provider indisponible.
            }
        }
    }

    /** Efface le compte chez **tous** les peers (évite un chip SSO avec refresh mort). */
    fun clearAccount(ctx: Context, email: String) {
        for (pkg in allPackages(ctx)) {
            try {
                val uri = Uri.parse("content://${authorityFor(pkg)}/accounts/$email")
                ctx.contentResolver.delete(uri, null, null)
            } catch (_: Exception) {
                // Peer absent.
            }
        }
    }

    /** Décode `exp` JWT (secondes epoch) sans vérifier la signature. */
    private fun jwtExpSeconds(token: String): Long {
        if (token.isEmpty()) return 0L
        return try {
            val parts = token.split('.')
            if (parts.size < 2) return 0L
            var b64 = parts[1].replace('-', '+').replace('_', '/')
            when (b64.length % 4) {
                2 -> b64 += "=="
                3 -> b64 += "="
                1 -> return 0L
            }
            val json = String(Base64.decode(b64, Base64.DEFAULT))
            val obj = JSONObject(json)
            obj.optLong("exp", 0L)
        } catch (_: Exception) {
            0L
        }
    }

    private data class Candidate(
        val email: String,
        val gatewayUrl: String,
        val accessToken: String,
        val refreshToken: String,
        val tenantId: Int,
        val sourcePackage: String,
        val updatedAt: Long,
        val accessExp: Long,
    ) {
        fun isFresherThan(other: Candidate): Boolean {
            if (updatedAt != other.updatedAt) return updatedAt > other.updatedAt
            if (accessExp != other.accessExp) return accessExp > other.accessExp
            // Dernier recours : préférer un access encore valide.
            val now = System.currentTimeMillis() / 1000
            val selfValid = accessExp > now
            val otherValid = other.accessExp > now
            if (selfValid != otherValid) return selfValid
            return false
        }

        fun toMap(): Map<String, Any?> = mapOf(
            "email" to email,
            "gateway_url" to gatewayUrl,
            "access_token" to accessToken,
            "refresh_token" to refreshToken,
            "tenant_id" to tenantId,
            "source_package" to sourcePackage,
            "updated_at" to updatedAt,
        )
    }
}
