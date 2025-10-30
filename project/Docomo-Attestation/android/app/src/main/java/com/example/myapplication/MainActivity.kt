package com.example.myapplication

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class MainActivity : AppCompatActivity() {

    private lateinit var tvStatus: TextView
    private lateinit var tvOutput: TextView

    // 直近に取得した生JWE/JWSを保持（コピー/共有用）
    private var lastToken: String? = null

    // ===== 追加: サーバ連携用の定数 =====
    // あなたのExpress/Nextの受け口に置き換えてください（例: http://192.168.0.12:3000/api/attest）
    private val serverUrl = "http://192.168.56.1:3000/api/attest"
    private val walletPubkey = "USER_WALLET_PUBKEY" // SASのsubjectにしたいウォレット
    private val taskId = "A-123"                    // 任意の関連ID

    // （任意）サーバ復号を使う場合だけ true にし、URLを書き換え
    private val useServerDecode = true
    private val decodeEndpoint = "http://192.168.1.9:3000/api/decode" // POST {token, packageName}

    private val http by lazy { OkHttpClient() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val btnFetch = findViewById<Button>(R.id.btn_fetch)
        val btnMock = findViewById<Button>(R.id.btn_mock)
        val btnShowRaw = findViewById<Button>(R.id.btn_show_raw)
        val btnCopy = findViewById<Button>(R.id.btn_copy)
        val btnShare = findViewById<Button>(R.id.btn_share)
        val btnDecodeServer = findViewById<Button>(R.id.btn_decode_server)

        tvStatus = findViewById(R.id.tv_status)
        tvOutput = findViewById(R.id.tv_output)

        btnFetch.setOnClickListener {
            lifecycleScope.launch {
                tvStatus.text = "Fetching token..."
                try {
                    // ノンスは簡易ランダム。本番は wallet/pubkey/タスクID と結びつけ推奨
                    val nonce = base64UrlNoPad(randomBytes(16))
                    val token = fetchIntegrityToken(nonce)
                    lastToken = token

                    // 画面に情報表示（ヘッダ or ペイロード）
                    showTokenInfo(token)

                    // ===== 追加: 取得直後にサーバへPOST =====
                    tvStatus.text = "Posting to server..."
                    // Play Integrityは通常JWE(5区切り)なのでpayloadは空でOK。
                    // もし3区切りJWSだった場合のみpayloadを同送します。
                    val payloadJsonIfAny = extractPayloadIfJws(token)
                    val respText = postAttest(token, payloadJsonIfAny, walletPubkey, taskId)
                    Log.d("ATT_POST", respText)

                    tvStatus.text = "Done ✅"
                } catch (e: Exception) {
                    tvStatus.text = "Error: ${e.message}"
                    Log.e("ATT", "error", e)
                }
            }
        }

        // モック（復号後のJSON例）を表示：Play Integrityは呼ばない
        btnMock.setOnClickListener {
            val mockJson = """
                {
                  "requestDetails": {
                    "requestPackageName": "${packageName}",
                    "nonce": "bXktbm9uY2UtYmFzZTY0dXJs",
                    "timestampMillis": "${System.currentTimeMillis()}"
                  },
                  "appIntegrity": {
                    "appRecognitionVerdict": "PLAY_RECOGNIZED",
                    "packageName": "${packageName}",
                    "certificateSha256Digest": ["6a6a1474b5cbbb2b1aa57e0bc3EXAMPLE=="],
                    "versionCode": "1"
                  },
                  "deviceIntegrity": {
                    "deviceRecognitionVerdict": ["MEETS_DEVICE_INTEGRITY"]
                  },
                  "environmentDetails": {
                    "playProtectVerdict": "NO_ISSUES"
                  }
                }
            """.trimIndent()

            tvStatus.text = "Mock JSON (client-side view)"
            tvOutput.text = prettyJsonOrRaw(mockJson)
        }

        // 直近の生トークンを画面に表示（長いので注意）
        btnShowRaw.setOnClickListener {
            val t = lastToken
            if (t.isNullOrBlank()) {
                tvStatus.text = "No token yet"
            } else {
                tvStatus.text = "Raw token shown"
                tvOutput.text = t
            }
        }

        // クリップボードにコピー
        btnCopy.setOnClickListener {
            val t = lastToken
            if (t.isNullOrBlank()) {
                tvStatus.text = "No token to copy"
            } else {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("IntegrityToken", t))
                tvStatus.text = "Copied ✅"
            }
        }

        // 共有メニューを開く（メモアプリやSlack等へ共有）
        btnShare.setOnClickListener {
            val t = lastToken
            if (t.isNullOrBlank()) {
                tvStatus.text = "No token to share"
            } else {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, t)
                }
                startActivity(Intent.createChooser(intent, "Share Integrity Token"))
            }
        }

        // （任意）サーバで復号→JSONを画面表示
        btnDecodeServer.setOnClickListener {
            lifecycleScope.launch {
                val t = lastToken
                if (t.isNullOrBlank()) {
                    tvStatus.text = "No token to decode"
                    return@launch
                }
                if (!useServerDecode) {
                    tvStatus.text = "Server decode disabled (toggle in code)"
                    return@launch
                }
                try {
                    tvStatus.text = "Decoding on server..."
                    val decoded = decodeOnServer(t, packageName)
                    tvOutput.text = prettyJsonOrRaw(decoded)
                    tvStatus.text = "Decoded ✅"
                } catch (e: Exception) {
                    tvStatus.text = "Decode error: ${e.message}"
                    Log.e("ATT", "decode error", e)
                }
            }
        }
    }

    /** Play Integrity の暗号化トークン（通常はJWE, 5区切り）を取得 */
    private suspend fun fetchIntegrityToken(nonce: String): String =
        suspendCancellableCoroutine { cont ->
            val manager = IntegrityManagerFactory.create(this)
            val req = IntegrityTokenRequest.builder()
                .setNonce(nonce)
                // ★ 非Play配布テスト時は Cloud Project Number が必須（末尾LのLong）
                .setCloudProjectNumber(462527156755L)
                .build()
            manager.requestIntegrityToken(req)
                .addOnSuccessListener { res -> cont.resume(res.token()) }
                .addOnFailureListener { e -> cont.resumeWithException(e) }
        }

    /** 取得したトークンを解析して画面に表示（JWEはヘッダだけ表示） */
    private fun showTokenInfo(token: String) {
        val parts = token.split(".")
        val sb = StringBuilder()

        sb.appendLine("rawToken.length = ${token.length}")
        sb.appendLine("parts = ${parts.size} ('.'-separated)")
        sb.appendLine()

        when (parts.size) {
            5 -> {
                // JWE: header, enc key, IV, ciphertext, tag
                sb.appendLine("JWE detected (Play Integrity standard).")
                sb.appendLine("header (decoded):")
                sb.appendLine(prettyJsonOrRaw(base64UrlDecodeToString(parts[0])))
                sb.appendLine()
                sb.appendLine("NOTE: Payload is encrypted and CANNOT be decoded on-device.")
                sb.appendLine("      Use server-side Google Decode API to get JSON.")
            }
            3 -> {
                // 稀にJWS
                sb.appendLine("JWS detected.")
                sb.appendLine("header (decoded):")
                sb.appendLine(prettyJsonOrRaw(base64UrlDecodeToString(parts[0])))
                sb.appendLine()
                sb.appendLine("payload (decoded):")
                sb.appendLine(prettyJsonOrRaw(base64UrlDecodeToString(parts[1])))
            }
            else -> {
                sb.appendLine("Unknown token format. Showing first part decoded as header (best-effort):")
                sb.appendLine(prettyJsonOrRaw(base64UrlDecodeToString(parts[0])))
            }
        }

        tvOutput.text = sb.toString()
        Log.d("ATT_TOKEN", sb.toString())
    }

    /** 3区切りJWSの時だけpayload(JSON文字列)を返す。JWE(5区切り)はnull */
    private fun extractPayloadIfJws(token: String): String? {
        val parts = token.split(".")
        return if (parts.size == 3) {
            try {
                val payloadBytes = Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
                String(payloadBytes, Charsets.UTF_8)
            } catch (_: Exception) { null }
        } else null
    }

    /** /api/attest にPOST（MVP最小。成功時はサーバの応答テキストを返す） */
    private suspend fun postAttest(jws: String, payloadJson: String?, wallet: String, taskId: String): String =
        withContext(Dispatchers.IO) {
            val body = JSONObject().apply {
                put("jws", jws)
                if (payloadJson != null) put("payload_json", payloadJson) // JWS時のみ
                put("wallet_pubkey", wallet)
                put("task_id", taskId)
            }.toString()

            val req = Request.Builder()
                .url(serverUrl)
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()

            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string() ?: ""
                if (!resp.isSuccessful) throw RuntimeException("server ${resp.code}: $text")
                text
            }
        }

    // ---- サーバ復号（任意） ----
    private suspend fun decodeOnServer(token: String, pkg: String): String = withContext(Dispatchers.IO) {
        val json = JSONObject().apply {
            put("token", token)
            put("packageName", pkg)
        }.toString()

        val req = Request.Builder()
            .url(decodeEndpoint)
            .post(json.toRequestBody("application/json".toMediaType()))
            .build()

        http.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) error("HTTP ${resp.code}")
            resp.body?.string() ?: error("empty body")
        }
    }

    // ====== helpers ======
    private fun randomBytes(n: Int): ByteArray =
        ByteArray(n).also { java.security.SecureRandom().nextBytes(it) }

    private fun base64UrlNoPad(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    private fun base64UrlDecodeToString(b64url: String): String =
        try {
            val bytes = Base64.decode(b64url, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
            String(bytes, Charsets.UTF_8)
        } catch (_: Exception) { "(decode failed)" }

    private fun prettyJsonOrRaw(s: String): String = try {
        when {
            s.trim().startsWith("{") -> JSONObject(s).toString(2)
            s.trim().startsWith("[") -> JSONArray(s).toString(2)
            else -> s
        }
    } catch (_: Exception) { s }
}




