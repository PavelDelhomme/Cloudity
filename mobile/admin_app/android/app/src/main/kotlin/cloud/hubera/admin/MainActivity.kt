package cloud.hubera.admin

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
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
                            val w = (page.width * 1.4f).toInt().coerceAtLeast(1)
                            val h = (page.height * 1.4f).toInt().coerceAtLeast(1)
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
