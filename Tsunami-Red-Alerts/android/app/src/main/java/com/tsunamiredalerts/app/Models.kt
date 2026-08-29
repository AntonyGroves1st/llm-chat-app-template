package com.tsunamiredalerts.app

data class AlertItem(
	val id: String,
	val source: String,
	val title: String,
	val summary: String,
	val level: String,
	val category: String,
	val region: String,
	val instruction: String,
	val url: String,
	val publishedAt: String,
)

data class EarthquakeItem(
	val id: String,
	val title: String,
	val place: String,
	val magnitude: Double,
	val depthKm: Double?,
	val tsunamiFlag: Boolean,
	val url: String,
	val publishedAt: String,
	val significance: Int,
)

data class NewsItem(
	val id: String,
	val source: String,
	val title: String,
	val summary: String,
	val url: String,
	val publishedAt: String,
)

data class UpdateItem(
	val id: String,
	val kind: String,
	val title: String,
	val summary: String,
	val source: String,
	val url: String,
	val publishedAt: String,
	val level: String? = null,
)

data class StatusPayload(
	val level: String,
	val redAlert: Boolean,
	val headline: String,
	val detail: String,
	val updatedAt: String,
	val alertId: String?,
	val alerts: Int,
	val earthquakes: Int,
	val news: Int,
	val updates: Int,
)

data class FeedSnapshot(
	val alerts: List<AlertItem>,
	val earthquakes: List<EarthquakeItem>,
	val news: List<NewsItem>,
	val updates: List<UpdateItem>,
	val status: StatusPayload,
)
