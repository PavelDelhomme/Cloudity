package fr.cloudity.cloudity_auth_broker

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.SharedPreferences
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject

/**
 * Stocke les sessions Cloudity pour l'app hôte ; lisible par les autres apps
 * signées avec la même clé via [android:readPermission] signature.
 */
class CloudityAuthProvider : ContentProvider() {

    override fun onCreate(): Boolean = true

    private fun prefs(ctx: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(ctx)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            ctx,
            "cloudity_auth_broker_v1",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private fun loadAll(ctx: Context): MutableMap<String, JSONObject> {
        val raw = prefs(ctx).getString(KEY_ACCOUNTS, "{}") ?: "{}"
        val root = JSONObject(raw)
        val out = linkedMapOf<String, JSONObject>()
        for (key in root.keys()) {
            out[key] = root.getJSONObject(key)
        }
        return out
    }

    private fun saveAll(ctx: Context, accounts: Map<String, JSONObject>) {
        val root = JSONObject()
        for ((k, v) in accounts) {
            root.put(k, v)
        }
        prefs(ctx).edit().putString(KEY_ACCOUNTS, root.toString()).apply()
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor? {
        val ctx = context ?: return null
        val cols = arrayOf(COL_EMAIL, COL_GATEWAY, COL_ACCESS, COL_REFRESH, COL_TENANT, COL_SOURCE)
        val cursor = MatrixCursor(cols)
        val accounts = loadAll(ctx)
        val filterEmail = uri.pathSegments.getOrNull(1)
        for ((email, obj) in accounts) {
            if (filterEmail != null && filterEmail != email) continue
            cursor.addRow(
                arrayOf(
                    email,
                    obj.optString(COL_GATEWAY, ""),
                    obj.optString(COL_ACCESS, ""),
                    obj.optString(COL_REFRESH, ""),
                    obj.optInt(COL_TENANT, 1),
                    ctx.packageName,
                ),
            )
        }
        return cursor
    }

    override fun getType(uri: Uri): String? = "vnd.android.cursor.dir/vnd.cloudity.auth.account"

    override fun insert(uri: Uri, values: ContentValues?): Uri? {
        val ctx = context ?: return null
        val email = values?.getAsString(COL_EMAIL)?.trim().orEmpty()
        if (email.isEmpty()) return null
        val accounts = loadAll(ctx)
        val obj = JSONObject()
        obj.put(COL_GATEWAY, values?.getAsString(COL_GATEWAY).orEmpty())
        obj.put(COL_ACCESS, values?.getAsString(COL_ACCESS).orEmpty())
        obj.put(COL_REFRESH, values?.getAsString(COL_REFRESH).orEmpty())
        obj.put(COL_TENANT, values?.getAsInteger(COL_TENANT) ?: 1)
        accounts[email] = obj
        saveAll(ctx, accounts)
        return Uri.parse("content://${ctx.packageName}.cloudity.auth/accounts/$email")
    }

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int {
        val ctx = context ?: return 0
        val accounts = loadAll(ctx)
        val email = uri.pathSegments.getOrNull(1)
        if (email != null) {
            if (accounts.remove(email) != null) {
                saveAll(ctx, accounts)
                return 1
            }
            return 0
        }
        accounts.clear()
        saveAll(ctx, accounts)
        return 1
    }

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int {
        insert(uri, values)
        return 1
    }

    companion object {
        private const val KEY_ACCOUNTS = "accounts_json"
        const val COL_EMAIL = "email"
        const val COL_GATEWAY = "gateway_url"
        const val COL_ACCESS = "access_token"
        const val COL_REFRESH = "refresh_token"
        const val COL_TENANT = "tenant_id"
        const val COL_SOURCE = "source_package"
    }
}
