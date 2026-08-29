package com.tsunamiredalerts.app

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.ConcurrentHashMap

class FeedClient {
	private val cache = ConcurrentHashMap<String, Pair<Long, String>>()

	fun snapshot(preview: Boolean): FeedSnapshot {
		val nws = runCatching { fetchText(NWS_ALERTS_URL) }.getOrDefault("""{"features":[]}""")
		val usgsDay = runCatching { fetchText(USGS_QUAKES_URL) }.getOrDefault("""{"features":[]}""")
		val usgsSig = runCatching { fetchText(USGS_SIGNIFICANT_URL) }.getOrDefault("""{"features":[]}""")
		val ptwc = runCatching { fetchText(PTWC_ATOM_URL) }.getOrDefault("")
		val ntwc = runCatching { fetchText(NTWC_ATOM_URL) }.getOrDefault("")
		val newsXml = runCatching { fetchText(NEWS_RSS_URL) }.getOrDefault("")

		var alerts = uniqueById(
			mapNwsAlerts(nws) +
				mapTsunamiCenterAlerts(ptwc, "Pacific Tsunami Warning Center") +
				mapTsunamiCenterAlerts(ntwc, "National Tsunami Warning Center"),
		) { it.id }.sortedByDescending { it.publishedAt }

		val earthquakes = uniqueById(
			mapUsgsEarthquakes(usgsDay) + mapUsgsEarthquakes(usgsSig),
		) { it.id }.sortedByDescending { it.publishedAt }.take(40)

		val news = uniqueById(mapNewsItems(newsXml, "Google News")) { it.id }
			.sortedByDescending { it.publishedAt }
			.take(20)

		if (preview) {
			alerts = listOf(previewAlert()) + alerts
		}

		val updates = buildUpdates(alerts, earthquakes, news)
		val status = computeStatus(alerts, earthquakes).withCounts(
			alerts.size,
			earthquakes.size,
			news.size,
			updates.size,
		)
		return FeedSnapshot(alerts, earthquakes, news, updates, status)
	}

	private fun fetchText(url: String): String {
		val cached = cache[url]
		if (cached != null && cached.first > System.currentTimeMillis()) {
			return cached.second
		}
		val connection = (URL(url).openConnection() as HttpURLConnection).apply {
			connectTimeout = 12_000
			readTimeout = 12_000
			setRequestProperty("User-Agent", USER_AGENT)
			setRequestProperty("Accept", "*/*")
		}
		val code = connection.responseCode
		val stream = if (code in 200..299) connection.inputStream else connection.errorStream
		val body = stream.bufferedReader().use { it.readText() }
		if (code !in 200..299) {
			throw IllegalStateException("Upstream $code")
		}
		cache[url] = System.currentTimeMillis() + CACHE_TTL_MS to body
		return body
	}

	companion object {
		private const val USER_AGENT =
			"TsunamiRedAlerts/1.0 (https://github.com/AntonyGroves1st/llm-chat-app-template)"
		private const val CACHE_TTL_MS = 45_000L
		private const val NWS_ALERTS_URL =
			"https://api.weather.gov/alerts/active?event=Tsunami"
		private const val USGS_QUAKES_URL =
			"https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"
		private const val USGS_SIGNIFICANT_URL =
			"https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson"
		private const val PTWC_ATOM_URL = "https://www.tsunami.gov/events/xml/PHEBAtom.xml"
		private const val NTWC_ATOM_URL = "https://www.tsunami.gov/events/xml/PAAQAtom.xml"
		private const val NEWS_RSS_URL =
			"https://news.google.com/rss/search?q=tsunami+OR+%22tsunami+warning%22+OR+%22tsunami+advisory%22+OR+%22pacific+tsunami%22&hl=en-US&gl=US&ceid=US:en"
	}
}

private val ISO_FORMAT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
	timeZone = TimeZone.getTimeZone("UTC")
}

private fun isoNow(): String = ISO_FORMAT.format(Date())

private fun isoFromMillis(value: Long): String = ISO_FORMAT.format(Date(value))

private fun isoFromText(value: String?): String {
	if (value.isNullOrBlank()) return isoFromMillis(0)
	val cleaned = stripTags(value)
	val patterns = listOf(
		"yyyy-MM-dd'T'HH:mm:ss'Z'",
		"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
		"EEE, dd MMM yyyy HH:mm:ss zzz",
		"yyyy.MM.dd HH:mm:ss",
	)
	for (pattern in patterns) {
		runCatching {
			val parser = SimpleDateFormat(pattern, Locale.US).apply {
				timeZone = TimeZone.getTimeZone("UTC")
			}
			return ISO_FORMAT.format(parser.parse(cleaned)!!)
		}
	}
	return isoFromMillis(0)
}

private fun stripTags(html: String): String {
	return html
		.replace(Regex("<!\\[CDATA\\[([\\s\\S]*?)]]>", RegexOption.IGNORE_CASE), "$1")
		.replace("&nbsp;", " ", ignoreCase = true)
		.replace("&amp;", "&")
		.replace("&lt;", "<")
		.replace("&gt;", ">")
		.replace("&quot;", "\"")
		.replace("&#39;", "'")
		.replace("&apos;", "'")
		.replace(Regex("<br\\s*/?>", RegexOption.IGNORE_CASE), "\n")
		.replace(Regex("</p>", RegexOption.IGNORE_CASE), "\n")
		.replace(Regex("<[^>]+>"), " ")
		.replace(Regex("[ \\t]+\\n"), "\n")
		.replace(Regex("\\n{3,}"), "\n\n")
		.replace(Regex("[ \\t]{2,}"), " ")
		.trim()
}

private fun extractTag(xml: String, tag: String): String? {
	val escaped = Regex.escape(tag)
	val match = Regex("<$escaped(?:\\s[^>]*)?>([\\s\\S]*?)</$escaped>", RegexOption.IGNORE_CASE)
		.find(xml)
	return match?.groupValues?.get(1)?.trim()?.let(::stripTags)
}

private fun extractBlocks(xml: String, tag: String): List<String> {
	val escaped = Regex.escape(tag)
	return Regex("<$escaped(?:\\s[^>]*)?>[\\s\\S]*?</$escaped>", RegexOption.IGNORE_CASE)
		.findAll(xml)
		.map { it.value }
		.toList()
}

private fun extractHref(xml: String): String {
	val preferred = Regex("<link\\b[^>]*rel\\s*=\\s*[\"']alternate[\"'][^>]*>", RegexOption.IGNORE_CASE)
		.find(xml)?.value
	val link = preferred ?: Regex("<link\\b[^>]*>", RegexOption.IGNORE_CASE).find(xml)?.value
	val href = link?.let {
		Regex("href\\s*=\\s*[\"']([^\"']+)[\"']", RegexOption.IGNORE_CASE).find(it)?.groupValues?.get(1)
	}
	return href ?: extractTag(xml, "link").orEmpty()
}

private fun stableId(parts: List<String>): String {
	return parts.filter { it.isNotBlank() }.joinToString(":") { it.replace(Regex("\\s+"), "-") }.take(180)
}

private fun <T> uniqueById(items: List<T>, id: (T) -> String): List<T> {
	val seen = HashSet<String>()
	return items.filter { seen.add(id(it)) }
}


private fun rank(level: String): Int = when (level) {
	"warning" -> 4
	"watch" -> 3
	"advisory" -> 2
	"information" -> 1
	else -> 0
}

private fun maxLevel(levels: List<String>): String {
	return levels.maxByOrNull(::rank) ?: "none"
}

fun levelFromText(text: String): String {
	val value = text.lowercase(Locale.US)
	if (
		value.contains("cancellation") ||
		value.contains("canceled") ||
		value.contains("cancelled") ||
		value.contains("no tsunami") ||
		value.contains("not pose a tsunami")
	) {
		return "information"
	}
	if (value.contains("tsunami warning") || (value.contains("warning") && value.contains("tsunami"))) {
		return "warning"
	}
	if (value.contains("tsunami watch") || (value.contains("watch") && value.contains("tsunami"))) {
		return "watch"
	}
	if (value.contains("tsunami advisory") || (value.contains("advisory") && value.contains("tsunami"))) {
		return "advisory"
	}
	if (value.contains("information") || value.contains("statement")) {
		return "information"
	}
	return "none"
}

private fun earthquakeLevel(quake: EarthquakeItem): String {
	return when {
		quake.tsunamiFlag && quake.magnitude >= 7 -> "warning"
		quake.tsunamiFlag -> "advisory"
		quake.magnitude >= 7.5 -> "watch"
		quake.magnitude >= 6.5 -> "information"
		else -> "none"
	}
}

private fun computeStatus(
	alerts: List<AlertItem>,
	earthquakes: List<EarthquakeItem>,
): StatusPayload {
	val alertLevel = maxLevel(alerts.map { it.level })
	val quakeLevel = maxLevel(earthquakes.map(::earthquakeLevel))
	val level = maxLevel(listOf(alertLevel, quakeLevel))
	val leadAlert = alerts.firstOrNull { it.level == level } ?: alerts.firstOrNull()
	val leadQuake = earthquakes.firstOrNull { earthquakeLevel(it) == level }
	val redAlert = level == "warning"
	val headline = when {
		redAlert -> leadAlert?.title ?: "Tsunami warning in effect"
		level == "watch" -> leadAlert?.title ?: "Tsunami watch in effect"
		level == "advisory" -> leadAlert?.title ?: "Tsunami advisory in effect"
		level == "information" -> leadAlert?.title ?: leadQuake?.title ?: "Official tsunami information is available"
		else -> "No active tsunami warning"
	}
	val detail = when {
		redAlert -> leadAlert?.instruction?.ifBlank { null } ?: leadAlert?.summary
			?: "Move inland or to higher ground immediately. Follow local emergency officials."
		level == "none" -> "No NWS tsunami warning, watch, or advisory is active. Continue monitoring official sources."
		else -> leadAlert?.summary ?: leadQuake?.title ?: "Review the latest official bulletins below."
	}
	return StatusPayload(
		level = level,
		redAlert = redAlert,
		headline = headline,
		detail = detail,
		updatedAt = isoNow(),
		alertId = leadAlert?.id ?: leadQuake?.id,
		alerts = 0,
		earthquakes = 0,
		news = 0,
		updates = 0,
	)
}

private fun StatusPayload.withCounts(alerts: Int, earthquakes: Int, news: Int, updates: Int): StatusPayload {
	return copy(alerts = alerts, earthquakes = earthquakes, news = news, updates = updates)
}

private fun previewAlert(): AlertItem {
	return AlertItem(
		id = "preview-red-alert",
		source = "Tsunami Red Alerts",
		title = "PREVIEW · Tsunami warning for coastal test region",
		summary = "This is a preview of the red-alert screen. No official warning is implied. Use the close tab to dismiss the overlay.",
		level = "warning",
		category = "Tsunami Warning",
		region = "Preview coastline",
		instruction = "If this were a real warning: move inland or to high ground immediately, stay away from the shore, and follow local emergency officials.",
		url = "https://www.tsunami.gov/",
		publishedAt = isoNow(),
	)
}

private fun mapNwsAlerts(json: String): List<AlertItem> {
	val features = JSONObject(json).optJSONArray("features") ?: return emptyList()
	return buildList {
		for (index in 0 until features.length()) {
			val feature = features.optJSONObject(index) ?: continue
			val properties = feature.optJSONObject("properties") ?: continue
			val event = properties.optString("event", "Tsunami alert")
			val title = properties.optString("headline").ifBlank { event }
			val published = properties.optString("effective").ifBlank {
				properties.optString("sent")
			}
			add(
				AlertItem(
					id = properties.optString("id").ifBlank { feature.optString("id") },
					source = properties.optString("senderName").ifBlank { "NWS" },
					title = title,
					summary = stripTags(properties.optString("description").ifBlank { title }),
					level = levelFromText("$event $title"),
					category = event,
					region = properties.optString("areaDesc").ifBlank { "Unspecified area" },
					instruction = stripTags(properties.optString("instruction")),
					url = properties.optString("web").ifBlank { "https://www.tsunami.gov/" },
					publishedAt = isoFromText(published.ifBlank { null }),
				),
			)
		}
	}
}

private fun mapUsgsEarthquakes(json: String): List<EarthquakeItem> {
	val features = JSONObject(json).optJSONArray("features") ?: return emptyList()
	return buildList {
		for (index in 0 until features.length()) {
			val feature = features.optJSONObject(index) ?: continue
			val properties = feature.optJSONObject("properties") ?: continue
			val coordinates = feature.optJSONObject("geometry")?.optJSONArray("coordinates")
			add(
				EarthquakeItem(
					id = feature.optString("id"),
					title = properties.optString("title").ifBlank { "M ${properties.optDouble("mag")} earthquake" },
					place = properties.optString("place").ifBlank { "Unknown location" },
					magnitude = properties.optDouble("mag", 0.0),
					depthKm = coordinates?.optDouble(2)?.takeIf { !it.isNaN() },
					tsunamiFlag = properties.optInt("tsunami") == 1,
					url = properties.optString("url").ifBlank { "https://earthquake.usgs.gov/earthquakes/map/" },
					publishedAt = isoFromMillis(properties.optLong("time")),
					significance = properties.optInt("sig"),
				),
			)
		}
	}
}

private fun mapTsunamiCenterAlerts(xml: String, source: String): List<AlertItem> {
	return extractBlocks(xml, "entry").map { block ->
		val title = extractTag(block, "title") ?: "Untitled"
		val summary = extractTag(block, "summary").orEmpty()
		val haystack = "$title $summary"
		val level = levelFromText(haystack).let { if (it == "none") "information" else it }
		AlertItem(
			id = stableId(listOf("twc", source, extractTag(block, "id") ?: title)),
			source = source,
			title = title,
			summary = summary,
			level = level,
			category = Regex("Category:\\s*([^\\n]+)", RegexOption.IGNORE_CASE).find(summary)?.groupValues?.get(1)?.trim()
				?: "Tsunami bulletin",
			region = Regex("Affected Region:\\s*([^\\n]+)", RegexOption.IGNORE_CASE).find(summary)?.groupValues?.get(1)?.trim()
				?: title,
			instruction = "",
			url = extractHref(block).ifBlank { "https://www.tsunami.gov/" },
			publishedAt = isoFromText(extractTag(block, "updated")),
		)
	}
}

private fun isHazardNews(title: String, summary: String): Boolean {
	val text = "$title $summary".lowercase(Locale.US)
	if (
		Regex("(orange|blue|red|pink|political|electoral|election)\\s+tsunami").containsMatchIn(text) ||
		Regex("\\b(vote|election|campaign|party|one nation)\\b").containsMatchIn(text)
	) {
		return false
	}
	return Regex("tsunami warning|tsunami watch|tsunami advisory|tsunami\\.gov").containsMatchIn(text) ||
		(text.contains("tsunami") && Regex("earthquake|seismic|coast|evacuat|wave|pacific|warning|noaa|usgs|bulletin").containsMatchIn(text)) ||
		(text.contains("tsunami") && !Regex("metaphor|landslide victory").containsMatchIn(text))
}

private fun mapNewsItems(xml: String, source: String): List<NewsItem> {
	val blocks = if (xml.contains("<entry")) extractBlocks(xml, "entry") else extractBlocks(xml, "item")
	return blocks.mapNotNull { block ->
		val title = extractTag(block, "title") ?: return@mapNotNull null
		val summary = extractTag(block, "description") ?: extractTag(block, "summary").orEmpty()
		if (!isHazardNews(title, summary)) return@mapNotNull null
		NewsItem(
			id = stableId(listOf("news", source, extractTag(block, "guid") ?: extractTag(block, "id") ?: title)),
			source = source,
			title = title,
			summary = summary,
			url = extractHref(block).ifBlank { extractTag(block, "link").orEmpty() },
			publishedAt = isoFromText(extractTag(block, "pubDate") ?: extractTag(block, "updated")),
		)
	}
}

private fun buildUpdates(
	alerts: List<AlertItem>,
	earthquakes: List<EarthquakeItem>,
	news: List<NewsItem>,
): List<UpdateItem> {
	val items = buildList {
		alerts.forEach { alert ->
			add(
				UpdateItem(
					id = "update:${alert.id}",
					kind = "alert",
					title = alert.title,
					summary = alert.summary,
					source = alert.source,
					url = alert.url,
					publishedAt = alert.publishedAt,
					level = alert.level,
				),
			)
		}
		earthquakes.filter { it.tsunamiFlag || it.magnitude >= 5 }.forEach { quake ->
			add(
				UpdateItem(
					id = "update:${quake.id}",
					kind = "earthquake",
					title = quake.title,
					summary = "${quake.place}${if (quake.tsunamiFlag) " · USGS tsunami flag set" else ""}",
					source = "USGS",
					url = quake.url,
					publishedAt = quake.publishedAt,
				),
			)
		}
		news.forEach { item ->
			add(
				UpdateItem(
					id = "update:${item.id}",
					kind = "news",
					title = item.title,
					summary = item.summary,
					source = item.source,
					url = item.url,
					publishedAt = item.publishedAt,
				),
			)
		}
	}
	return uniqueById(items) { it.id }.sortedByDescending { it.publishedAt }.take(40)
}

fun FeedSnapshot.toJson(): JSONObject {
	fun AlertItem.toJson() = JSONObject()
		.put("id", id)
		.put("source", source)
		.put("title", title)
		.put("summary", summary)
		.put("level", level)
		.put("category", category)
		.put("region", region)
		.put("instruction", instruction)
		.put("url", url)
		.put("publishedAt", publishedAt)

	fun EarthquakeItem.toJson() = JSONObject()
		.put("id", id)
		.put("title", title)
		.put("place", place)
		.put("magnitude", magnitude)
		.put("depthKm", depthKm)
		.put("tsunamiFlag", tsunamiFlag)
		.put("url", url)
		.put("publishedAt", publishedAt)
		.put("significance", significance)

	fun NewsItem.toJson() = JSONObject()
		.put("id", id)
		.put("source", source)
		.put("title", title)
		.put("summary", summary)
		.put("url", url)
		.put("publishedAt", publishedAt)

	fun UpdateItem.toJson() = JSONObject()
		.put("id", id)
		.put("kind", kind)
		.put("title", title)
		.put("summary", summary)
		.put("source", source)
		.put("url", url)
		.put("publishedAt", publishedAt)
		.put("level", level)

	fun StatusPayload.toJson() = JSONObject()
		.put("level", level)
		.put("redAlert", redAlert)
		.put("headline", headline)
		.put("detail", detail)
		.put("updatedAt", updatedAt)
		.put("alertId", alertId)
		.put(
			"counts",
			JSONObject()
				.put("alerts", alerts)
				.put("earthquakes", earthquakes)
				.put("news", news)
				.put("updates", updates),
		)

	return JSONObject()
		.put("alerts", JSONArray(alerts.map { it.toJson() }))
		.put("earthquakes", JSONArray(earthquakes.map { it.toJson() }))
		.put("news", JSONArray(news.map { it.toJson() }))
		.put("updates", JSONArray(updates.map { it.toJson() }))
		.put("status", status.toJson())
}

fun FeedSnapshot.sliceJson(kind: String): JSONObject {
	val updatedAt = status.updatedAt
	return when (kind) {
		"status" -> status.let {
			JSONObject()
				.put("level", it.level)
				.put("redAlert", it.redAlert)
				.put("headline", it.headline)
				.put("detail", it.detail)
				.put("updatedAt", it.updatedAt)
				.put("alertId", it.alertId)
				.put(
					"counts",
					JSONObject()
						.put("alerts", it.alerts)
						.put("earthquakes", it.earthquakes)
						.put("news", it.news)
						.put("updates", it.updates),
				)
		}
		"alerts" -> JSONObject().put("updatedAt", updatedAt).put("items", JSONArray(alerts.map {
			JSONObject()
				.put("id", it.id)
				.put("source", it.source)
				.put("title", it.title)
				.put("summary", it.summary)
				.put("level", it.level)
				.put("category", it.category)
				.put("region", it.region)
				.put("instruction", it.instruction)
				.put("url", it.url)
				.put("publishedAt", it.publishedAt)
		}))
		"earthquakes" -> JSONObject().put("updatedAt", updatedAt).put("items", JSONArray(earthquakes.map {
			JSONObject()
				.put("id", it.id)
				.put("title", it.title)
				.put("place", it.place)
				.put("magnitude", it.magnitude)
				.put("depthKm", it.depthKm)
				.put("tsunamiFlag", it.tsunamiFlag)
				.put("url", it.url)
				.put("publishedAt", it.publishedAt)
				.put("significance", it.significance)
		}))
		"news" -> JSONObject().put("updatedAt", updatedAt).put("items", JSONArray(news.map {
			JSONObject()
				.put("id", it.id)
				.put("source", it.source)
				.put("title", it.title)
				.put("summary", it.summary)
				.put("url", it.url)
				.put("publishedAt", it.publishedAt)
		}))
		"updates" -> JSONObject().put("updatedAt", updatedAt).put("items", JSONArray(updates.map {
			JSONObject()
				.put("id", it.id)
				.put("kind", it.kind)
				.put("title", it.title)
				.put("summary", it.summary)
				.put("source", it.source)
				.put("url", it.url)
				.put("publishedAt", it.publishedAt)
				.put("level", it.level)
		}))
		else -> toJson()
	}
}
