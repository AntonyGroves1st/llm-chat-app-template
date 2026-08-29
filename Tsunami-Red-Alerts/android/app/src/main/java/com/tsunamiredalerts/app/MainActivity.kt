package com.tsunamiredalerts.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import java.net.URI

class MainActivity : AppCompatActivity() {
	private val apiRouter = ApiRouter()

	@SuppressLint("SetJavaScriptEnabled")
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		val webView = WebView(this)
		setContentView(webView)

		val assetLoader = WebViewAssetLoader.Builder()
			.setDomain(ASSET_HOST)
			.addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
			.build()

		webView.settings.apply {
			javaScriptEnabled = true
			domStorageEnabled = true
			databaseEnabled = true
			allowFileAccess = false
			allowContentAccess = false
			mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
			cacheMode = WebSettings.LOAD_DEFAULT
			userAgentString = "$userAgentString TsunamiRedAlerts/1.0"
		}
		webView.webViewClient = object : WebViewClient() {
			override fun shouldInterceptRequest(
				view: WebView,
				request: WebResourceRequest,
			): WebResourceResponse? {
				val url = request.url
				if (url.host == ASSET_HOST && url.path?.startsWith("/api/") == true) {
					return apiRouter.handle(URI.create(url.toString()), request.method)
				}
				return assetLoader.shouldInterceptRequest(url)
			}
		}
		webView.loadUrl("https://$ASSET_HOST/index.html")
	}

	companion object {
		private const val ASSET_HOST = "appassets.androidplatform.net"
	}
}
