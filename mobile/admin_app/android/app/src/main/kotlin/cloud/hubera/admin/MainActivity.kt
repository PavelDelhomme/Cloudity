package cloud.hubera.admin

import android.graphics.Bitmap
import android.graphics.Rect
import android.graphics.pdf.PdfRenderer
import android.os.Build
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterActivity() {
    private var edgeChannel: MethodChannel? = null
    private var edgeDownX = 0f
    private var edgeDownY = 0f

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.post {
            excludeLeftEdge()
            attachEdgeStrip()
        }
    }

    override fun onResume() {
        super.onResume()
        window.decorView.post {
            excludeLeftEdge()
            attachEdgeStrip()
        }
    }

    private fun attachEdgeStrip() {
        val decor = window.decorView as? ViewGroup ?: return
        if (decor.findViewWithTag<View>("hubera-edge") != null) return
        val density = resources.displayMetrics.density
        val edge = (28 * density).toInt().coerceAtLeast(1)
        val strip = View(this)
        strip.tag = "hubera-edge"
        strip.setOnTouchListener { _, ev ->
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    edgeDownX = ev.rawX
                    edgeDownY = ev.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = ev.rawX - edgeDownX
                    val dy = ev.rawY - edgeDownY
                    if (edgeDownX <= edge && dx > 12f * density && kotlin.math.abs(dx) > kotlin.math.abs(dy)) {
                        edgeChannel?.invokeMethod("open", null)
                    }
                    true
                }
                else -> true
            }
        }
        decor.addView(
            strip,
            FrameLayout.LayoutParams(edge, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.START),
        )
    }

    private fun excludeLeftEdge() {
        if (Build.VERSION.SDK_INT < 29) return
        val density = resources.displayMetrics.density
        val width = (28 * density).toInt().coerceAtLeast(1)
        val height = resources.displayMetrics.heightPixels.coerceAtLeast(1)
        ViewCompat.setSystemGestureExclusionRects(
            window.decorView,
            listOf(Rect(0, 0, width, height)),
        )
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        edgeChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "cloud.hubera.admin/edge")
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "hubera/pdf")
            .setMethodCallHandler { call, result ->
                if (call.method != "render") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val path = call.argument<String>("path")
                if (path.isNullOrBlank()) {
                    result.error("path", "missing", null)
                    return@setMethodCallHandler
                }
                try {
                    val file = File(path)
                    val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                    val renderer = PdfRenderer(pfd)
                    val outDir = File(cacheDir, "pdf-preview")
                    outDir.mkdirs()
                    val pages = ArrayList<String>()
                    for (i in 0 until renderer.pageCount) {
                        renderer.openPage(i).use { page ->
                            val dpr = call.argument<Double>("dpr") ?: 2.0
                            val minText = call.argument<Double>("minTextPx") ?: 16.0
                            // Corps d’un PDF A4 ~10 pt : on vise minText px logiques à l’écran.
                            val scale = ((minText * dpr) / 10.0).toFloat().coerceIn(1.8f, 5.5f)
                            val w = (page.width * scale).toInt().coerceIn(1, 4096)
                            val h = (page.height * scale).toInt().coerceIn(1, 8192)
                            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                            page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                            val out = File(outDir, "p$i.png")
                            FileOutputStream(out).use { bmp.compress(Bitmap.CompressFormat.PNG, 90, it) }
                            bmp.recycle()
                            pages.add(out.absolutePath)
                        }
                    }
                    renderer.close()
                    pfd.close()
                    result.success(pages)
                } catch (e: Exception) {
                    result.error("pdf", e.message, null)
                }
            }
    }
}
