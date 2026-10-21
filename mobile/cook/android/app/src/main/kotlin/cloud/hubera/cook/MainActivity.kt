package cloud.hubera.cook

import android.graphics.Rect
import android.os.Bundle
import androidx.core.view.ViewCompat
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.post { excludeLeftEdge() }
    }

    override fun onResume() {
        super.onResume()
        window.decorView.post { excludeLeftEdge() }
    }

    private fun excludeLeftEdge() {
        val density = resources.displayMetrics.density
        val width = (28 * density).toInt().coerceAtLeast(1)
        val height = resources.displayMetrics.heightPixels
        ViewCompat.setSystemGestureExclusionRects(
            window.decorView,
            listOf(Rect(0, 0, width, height)),
        )
    }
}
