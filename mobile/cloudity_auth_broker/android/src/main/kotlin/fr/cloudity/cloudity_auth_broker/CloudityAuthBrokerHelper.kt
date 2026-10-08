package fr.cloudity.cloudity_auth_broker

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.util.Base64
import org.json.JSONObject

object CloudityAuthBrokerHelper {

    /** Apps Hubera + anciens packages encore installés (SSO, même signature). */
    private val peerPackages = listOf(
        "cloud.hubera.mail",
        "cloud.hubera.drive",
        "cloud.hubera.photos",
        "cloud.hubera.pass",
        "cloud.hubera.calendar",
        "cloud.hubera.contacts",
        "cloud.hubera.notes",
        "cloud.hubera.tasks",
        "cloud.hubera.cook",
        "cloud.hubera.admin",
        "cloud.hubera.id",
        "cloud.hubera.music",
        "cloud.hubera.music.dev",
        "cloud.hubera.music.preprod",
        "ovh.delhomme.ytmusic",
        "cloud.hubera.docs",
        "cloud.hubera.maps",
        "ovh.delhomme.maps",
        "cloud.hubera.fuel",
        "cloud.hubera.jobs",
        "cloud.hubera.office",
        "cloud.hubera.row",
        "cloud.hubera.office.docs",
        "cloud.hubera.slides",
        "fr.cloudity.cloudity_mail",
        "fr.cloudity.cloudity_drive",
        "fr.cloudity.cloudity_photos",
        "com.cloudity.cloudity_pass",
        "fr.cloudity.cloudity_calendar",
        "fr.cloudity.cloudity_contacts",
        "fr.cloudity.cloudity_notes",
        "fr.cloudity.cloudity_tasks",
        "fr.cloudity.cloudity_cook",
        "fr.cloudity.admin_app",
    )

    fun authorityFor(packageName: String): String = "$packageName.cloudity.auth"

    fun huberaAuthorityFor(packageName: String): String = "$packageName.hubera.id"

    fun accountsUri(packageName: String): Uri =
        Uri.parse("content://${authorityFor(packageName)}/accounts")

    fun huberaAccountsUri(packageName: String): Uri =
        Uri.parse("content://${huberaAuthorityFor(packageName)}/accounts")

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
                        val access = if (accessIdx >= 0) cursor.getString(accessIdx).orEmpty() else ""
                        if (email.isEmpty() || (refresh.isEmpty() && access.isEmpty())) continue
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
            try {
                ctx.contentResolver.query(huberaAccountsUri(pkg), null, null, null, null)?.use { cursor ->
                    val emailIdx = cursor.getColumnIndex("email")
                    val gwIdx = cursor.getColumnIndex("gateway_url")
                    val accessIdx = cursor.getColumnIndex("access_token")
                    val refreshIdx = cursor.getColumnIndex("refresh_token")
                    val tenantIdx = cursor.getColumnIndex("tenant_id")
                    val sourceIdx = cursor.getColumnIndex("source_package")
                    val updatedIdx = cursor.getColumnIndex("updated_at")
                    while (cursor.moveToNext()) {
                        val email = if (emailIdx >= 0) cursor.getString(emailIdx).orEmpty() else ""
                        val refresh = if (refreshIdx >= 0) cursor.getString(refreshIdx).orEmpty() else ""
                        val access = if (accessIdx >= 0) cursor.getString(accessIdx).orEmpty() else ""
                        if (email.isEmpty() || (refresh.isEmpty() && access.isEmpty())) continue
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
                // Peer Hubera ID absent.
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
        val huberaValues = ContentValues().apply {
            put("email", email)
            put("access_token", accessToken)
            put("refresh_token", refreshToken)
            put("gateway_url", gatewayUrl)
            put("tenant_id", tenantId)
            put("issuer", "cloudity")
            put("updated_at", System.currentTimeMillis())
        }
        for (pkg in allPackages(ctx)) {
            try {
                ctx.contentResolver.insert(accountsUri(pkg), values)
            } catch (_: Exception) {
                // Peer non installé / provider indisponible.
            }
            try {
                ctx.contentResolver.insert(huberaAccountsUri(pkg), huberaValues)
            } catch (_: Exception) {
                // Peer Hubera ID absent.
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
            try {
                ctx.contentResolver.delete(huberaAccountsUri(pkg).buildUpon().appendPath(email).build(), null, null)
            } catch (_: Exception) {
                // Peer Hubera ID absent.
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
