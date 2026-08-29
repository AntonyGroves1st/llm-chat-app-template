/**
 * Upstream tsunami, earthquake, and news feed adapters.
 */

import {
	parseAtomEntries,
	parseRssItems,
	stableId,
	stripTags,
} from "./parse";
import { computeStatus, levelFromText } from "./severity";
import type {
	AlertItem,
	EarthquakeItem,
	FeedSnapshot,
	NewsItem,
	ThreatLevel,
	UpdateItem,
} from "./types";

const USER_AGENT =
	"TsunamiRedAlerts/1.0 (https://github.com/AntonyGroves1st/llm-chat-app-template)";

const NWS_ALERTS_URL = "https://api.weather.gov/alerts/active?event=Tsunami";
const USGS_QUAKES_URL =
	"https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";
const USGS_SIGNIFICANT_URL =
	"https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson";
const PTWC_ATOM_URL = "https://www.tsunami.gov/events/xml/PHEBAtom.xml";
const NTWC_ATOM_URL = "https://www.tsunami.gov/events/xml/PAAQAtom.xml";
const NEWS_RSS_URL =
	"https://news.google.com/rss/search?q=tsunami+OR+%22tsunami+warning%22+OR+%22tsunami+advisory%22+OR+%22pacific+tsunami%22&hl=en-US&gl=US&ceid=US:en";

const CACHE_TTL_MS = 45_000;

interface CacheEntry<T> {
	expiresAt: number;
	value: T;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function clearFeedCache(): void {
	memoryCache.clear();
}

async function cachedFetchText(
	url: string,
	init?: RequestInit,
): Promise<string> {
	const cached = memoryCache.get(url) as CacheEntry<string> | undefined;
	if (cached && cached.expiresAt > Date.now()) {
		return cached.value;
	}

	const response = await fetch(url, {
		...init,
		headers: {
			Accept: "*/*",
			"User-Agent": USER_AGENT,
			...(init?.headers ?? {}),
		},
	});
	if (!response.ok) {
		throw new Error(`Upstream ${url} failed with ${response.status}`);
	}
	const value = await response.text();
	memoryCache.set(url, { value, expiresAt: Date.now() + CACHE_TTL_MS });
	return value;
}

async function cachedFetchJson<T>(url: string): Promise<T> {
	const cached = memoryCache.get(url) as CacheEntry<T> | undefined;
	if (cached && cached.expiresAt > Date.now()) {
		return cached.value;
	}
	const text = await cachedFetchText(url, {
		headers: { Accept: "application/geo+json, application/json" },
	});
	const value = JSON.parse(text) as T;
	memoryCache.set(url, { value, expiresAt: Date.now() + CACHE_TTL_MS });
	return value;
}

interface NwsAlertCollection {
	features?: Array<{
		id?: string;
		properties?: {
			id?: string;
			event?: string;
			headline?: string;
			description?: string;
			instruction?: string;
			areaDesc?: string;
			severity?: string;
			effective?: string;
			expires?: string;
			sent?: string;
			senderName?: string;
			web?: string;
			parameters?: Record<string, string[] | undefined>;
		};
	}>;
}

interface UsgsCollection {
	features?: Array<{
		id?: string;
		properties?: {
			mag?: number;
			place?: string;
			time?: number;
			url?: string;
			title?: string;
			tsunami?: number;
			sig?: number;
		};
		geometry?: { coordinates?: number[] };
	}>;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		if (seen.has(item.id)) return false;
		seen.add(item.id);
		return true;
	});
}

function sortByDateDesc<T extends { publishedAt: string }>(items: T[]): T[] {
	return [...items].sort(
		(a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
	);
}

export function mapNwsAlerts(collection: NwsAlertCollection): AlertItem[] {
	return (collection.features ?? []).flatMap((feature) => {
		const properties = feature.properties;
		if (!properties) return [];
		const event = properties.event ?? "Tsunami alert";
		const title = properties.headline || event;
		const summary = stripTags(properties.description ?? title);
		const publishedAt = new Date(
			properties.effective || properties.sent || Date.now(),
		).toISOString();
		return [
			{
				id:
					properties.id ||
					feature.id ||
					stableId(["nws", event, properties.areaDesc, publishedAt]),
				source: properties.senderName || "NWS",
				title,
				summary,
				level: levelFromText(`${event} ${title}`),
				category: event,
				region: properties.areaDesc || "Unspecified area",
				instruction: stripTags(properties.instruction ?? ""),
				url: properties.web || "https://www.tsunami.gov/",
				publishedAt,
			},
		];
	});
}

export function mapUsgsEarthquakes(
	collection: UsgsCollection,
): EarthquakeItem[] {
	return (collection.features ?? []).flatMap((feature) => {
		const properties = feature.properties;
		if (!properties) return [];
		const coordinates = feature.geometry?.coordinates ?? [];
		const publishedAt = new Date(properties.time ?? 0).toISOString();
		return [
			{
				id: feature.id || stableId(["usgs", properties.title, publishedAt]),
				title: properties.title || `M ${properties.mag} earthquake`,
				place: properties.place || "Unknown location",
				magnitude: properties.mag ?? 0,
				depthKm:
					typeof coordinates[2] === "number" ? coordinates[2] : null,
				tsunamiFlag: properties.tsunami === 1,
				url:
					properties.url ||
					"https://earthquake.usgs.gov/earthquakes/map/",
				publishedAt,
				longitude: coordinates[0],
				latitude: coordinates[1],
				significance: properties.sig ?? 0,
			},
		];
	});
}

export function mapTsunamiCenterAlerts(
	xml: string,
	source: string,
): AlertItem[] {
	return parseAtomEntries(xml).map((entry) => {
		const haystack = `${entry.category ?? ""} ${entry.title} ${entry.summary}`;
		const level = levelFromText(haystack);
		return {
			id: stableId(["twc", source, entry.id]),
			source,
			title: entry.title,
			summary: entry.summary,
			level: level === "none" ? "information" : level,
			category: entry.category || "Tsunami bulletin",
			region: entry.region || entry.title,
			instruction: "",
			url: entry.url || "https://www.tsunami.gov/",
			publishedAt: entry.publishedAt,
			latitude: entry.latitude,
			longitude: entry.longitude,
		};
	});
}

export function isHazardNews(title: string, summary: string): boolean {
	const text = `${title} ${summary}`.toLowerCase();
	if (
		/\b(orange|blue|red|pink|political|electoral|election)\s+tsunami\b/.test(
			text,
		) ||
		/\b(vote|election|campaign|party|one nation)\b/.test(text)
	) {
		return false;
	}
	return (
		/\btsunami warning\b|\btsunami watch\b|\btsunami advisory\b|\btsunami.gov\b/.test(
			text,
		) ||
		(/\btsunami\b/.test(text) &&
			/\b(earthquake|seismic|coast|evacuat|wave|pacific|warning|noaa|usgs|bulletin)\b/.test(
				text,
			)) ||
		(/\btsunami\b/.test(text) && !/\b(metaphor|landslide victory)\b/.test(text))
	);
}

export function mapNewsItems(xml: string, source: string): NewsItem[] {
	const entries = xml.includes("<entry")
		? parseAtomEntries(xml)
		: parseRssItems(xml);
	return entries
		.filter((entry) => isHazardNews(entry.title, entry.summary))
		.map((entry) => ({
			id: stableId(["news", source, entry.id || entry.title]),
			source,
			title: entry.title,
			summary: entry.summary,
			url: entry.url,
			publishedAt: entry.publishedAt,
		}));
}

function buildUpdates(
	alerts: AlertItem[],
	earthquakes: EarthquakeItem[],
	news: NewsItem[],
): UpdateItem[] {
	const updates: UpdateItem[] = [
		...alerts.map((alert) => ({
			id: `update:${alert.id}`,
			kind: "alert" as const,
			title: alert.title,
			summary: alert.summary,
			source: alert.source,
			url: alert.url,
			publishedAt: alert.publishedAt,
			level: alert.level,
		})),
		...earthquakes
			.filter((quake) => quake.tsunamiFlag || quake.magnitude >= 5)
			.map((quake) => ({
				id: `update:${quake.id}`,
				kind: "earthquake" as const,
				title: quake.title,
				summary: `${quake.place}${quake.tsunamiFlag ? " · USGS tsunami flag set" : ""}`,
				source: "USGS",
				url: quake.url,
				publishedAt: quake.publishedAt,
			})),
		...news.map((item) => ({
			id: `update:${item.id}`,
			kind: "news" as const,
			title: item.title,
			summary: item.summary,
			source: item.source,
			url: item.url,
			publishedAt: item.publishedAt,
		})),
	];
	return sortByDateDesc(uniqueById(updates)).slice(0, 40);
}

export function assembleSnapshot(input: {
	nws: NwsAlertCollection;
	usgsDay: UsgsCollection;
	usgsSignificant: UsgsCollection;
	ptwcXml: string;
	ntwcXml: string;
	newsXml: string;
	now?: string;
}): FeedSnapshot {
	const alerts = sortByDateDesc(
		uniqueById([
			...mapNwsAlerts(input.nws),
			...mapTsunamiCenterAlerts(input.ptwcXml, "Pacific Tsunami Warning Center"),
			...mapTsunamiCenterAlerts(
				input.ntwcXml,
				"National Tsunami Warning Center",
			),
		]),
	);
	const earthquakes = sortByDateDesc(
		uniqueById([
			...mapUsgsEarthquakes(input.usgsDay),
			...mapUsgsEarthquakes(input.usgsSignificant),
		]),
	).slice(0, 40);
	const news = sortByDateDesc(
		uniqueById(mapNewsItems(input.newsXml, "Google News")),
	).slice(0, 20);
	const updates = buildUpdates(alerts, earthquakes, news);
	const status = computeStatus(alerts, earthquakes, input.now);
	status.counts = {
		alerts: alerts.length,
		earthquakes: earthquakes.length,
		news: news.length,
		updates: updates.length,
	};
	return { alerts, earthquakes, news, updates, status };
}

export function applyPreviewRedAlert(snapshot: FeedSnapshot): FeedSnapshot {
	const preview: AlertItem = {
		id: "preview-red-alert",
		source: "Tsunami Red Alerts",
		title: "PREVIEW · Tsunami warning for coastal test region",
		summary:
			"This is a preview of the red-alert screen. No official warning is implied. Use the close tab to dismiss the overlay.",
		level: "warning" satisfies ThreatLevel,
		category: "Tsunami Warning",
		region: "Preview coastline",
		instruction:
			"If this were a real warning: move inland or to high ground immediately, stay away from the shore, and follow local emergency officials.",
		url: "https://www.tsunami.gov/",
		publishedAt: new Date().toISOString(),
	};
	const alerts = [preview, ...snapshot.alerts];
	const status = computeStatus(alerts, snapshot.earthquakes);
	status.headline = preview.title;
	status.detail = preview.instruction;
	status.alertId = preview.id;
	status.counts = {
		alerts: alerts.length,
		earthquakes: snapshot.earthquakes.length,
		news: snapshot.news.length,
		updates: snapshot.updates.length + 1,
	};
	return {
		...snapshot,
		alerts,
		status,
		updates: [
			{
				id: "update:preview-red-alert",
				kind: "alert",
				title: preview.title,
				summary: preview.summary,
				source: preview.source,
				url: preview.url,
				publishedAt: preview.publishedAt,
				level: preview.level,
			},
			...snapshot.updates,
		],
	};
}

export async function loadSnapshot(): Promise<FeedSnapshot> {
	const [nws, usgsDay, usgsSignificant, ptwcXml, ntwcXml, newsXml] =
		await Promise.all([
			cachedFetchJson<NwsAlertCollection>(NWS_ALERTS_URL).catch(() => ({
				features: [],
			})),
			cachedFetchJson<UsgsCollection>(USGS_QUAKES_URL).catch(() => ({
				features: [],
			})),
			cachedFetchJson<UsgsCollection>(USGS_SIGNIFICANT_URL).catch(() => ({
				features: [],
			})),
			cachedFetchText(PTWC_ATOM_URL).catch(() => ""),
			cachedFetchText(NTWC_ATOM_URL).catch(() => ""),
			cachedFetchText(NEWS_RSS_URL).catch(() => ""),
		]);

	return assembleSnapshot({
		nws,
		usgsDay,
		usgsSignificant,
		ptwcXml,
		ntwcXml,
		newsXml,
	});
}
