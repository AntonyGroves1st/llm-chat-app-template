package com.tsunamiredalerts.app

import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.net.URI

class ApiRouter(
	private val feeds: FeedClient = FeedClient(),
) {
	fun handle(uri: URI, method: String): WebResourceResponse {
		if (method != "GET" && !uri.path.endsWith("/chat")) {
			return jsonResponse(405, """{"error":"Method not allowed"}""")
		}
		if (uri.path.endsWith("/chat")) {
			return chatResponse()
		}

		val preview = uri.query?.contains("preview=1") == true
		return try {
			val snapshot = feeds.snapshot(preview)
			val body = when {
				uri.path.endsWith("/status") -> snapshot.sliceJson("status")
				uri.path.endsWith("/alerts") -> snapshot.sliceJson("alerts")
				uri.path.endsWith("/earthquakes") -> snapshot.sliceJson("earthquakes")
				uri.path.endsWith("/news") -> snapshot.sliceJson("news")
				uri.path.endsWith("/updates") -> snapshot.sliceJson("updates")
				else -> snapshot.toJson()
			}.toString()
			jsonResponse(200, body)
		} catch (error: Exception) {
			jsonResponse(502, """{"error":"Failed to load tsunami feeds"}""")
		}
	}

	private fun chatResponse(): WebResourceResponse {
		val payload = """
			data: {"response":"Safety chat in the APK uses official dashboard feeds. For live warnings follow tsunami.gov and local emergency officials. Move inland or to high ground if a red alert is active."}

			data: [DONE]

		""".trimIndent().replace("\n", "\r\n") + "\r\n"
		return WebResourceResponse(
			"text/event-stream",
			"UTF-8",
			200,
			"OK",
			mapOf(
				"Cache-Control" to "no-cache",
				"Access-Control-Allow-Origin" to "*",
			),
			ByteArrayInputStream(payload.toByteArray(Charsets.UTF_8)),
		)
	}

	private fun jsonResponse(status: Int, body: String): WebResourceResponse {
		val reason = if (status == 200) "OK" else "Error"
		return WebResourceResponse(
			"application/json",
			"UTF-8",
			status,
			reason,
			mapOf(
				"Cache-Control" to "public, max-age=15",
				"Access-Control-Allow-Origin" to "*",
			),
			ByteArrayInputStream(body.toByteArray(Charsets.UTF_8)),
		)
	}
}
