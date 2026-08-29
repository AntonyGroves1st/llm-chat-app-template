import { parseAtomEntries, parseRssItems, stableId, stripTags } from "./parse.mjs";
import { computeStatus, levelFromText } from "./severity.mjs";

const USER_AGENT = "TsunamiRedAlerts/1.0";
const CACHE_TTL_MS = 45_000;
const cache = new Map();

const NWS_ALERTS_URL = "https://api.weather.gov/alerts/active?event=Tsunami";
const USGS_QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";
const USGS_SIGNIFICANT_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson";
const PTWC_ATOM_URL = "https://www.tsunami.gov/events/xml/PHEBAtom.xml";
const NTWC_ATOM_URL = "https://www.tsunami.gov/events/xml/PAAQAtom.xml";
const NEWS_RSS_URL =
	"https://news.google.com/rss/search?q=tsunami+OR+%22tsunami+warning%22+OR+%22tsunami+advisory%22+OR+%22pacific+tsunami%22&hl=en-US&gl=US&ceid=US:en";

async function cachedFetchText(url) {
	const cached = cache.get(url);
	if (cached && cached.expiresAt > Date.now()) return cached.value;
	const response = await fetch(url, {
		headers: { Accept: "*/*", "User-Agent": USER_AGENT },
	});
	if (!response.ok) throw new Error(`Upstream ${url} failed with ${response.status}`);
	const value = await response.text();
	cache.set(url, { value, expiresAt: Date.now() + CACHE_TTL_MS });
	return value;
}

async function cachedFetchJson(url) {
	return JSON.parse(await cachedFetchText(url));
}

function uniqueById(items) {
	const seen = new Set();
	return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

function sortByDateDesc(items) {
	return [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export function isHazardNews(title, summary) {
	const text = `${title} ${summary}`.toLowerCase();
	if (
		/\b(orange|blue|red|pink|political|electoral|election)\s+tsunami\b/.test(text) ||
		/\b(vote|election|campaign|party|one nation)\b/.test(text)
	) {
		return false;
	}
	return (
		/\btsunami warning\b|\btsunami watch\b|\btsunami advisory\b|\btsunami.gov\b/.test(text) ||
		(/\btsunami\b/.test(text) &&
			/\b(earthquake|seismic|coast|evacuat|wave|pacific|warning|noaa|usgs|bulletin)\b/.test(text)) ||
		(/\btsunami\b/.test(text) && !/\b(metaphor|landslide victory)\b/.test(text))
	);
}

function mapNwsAlerts(collection) {
	return (collection.features ?? []).flatMap((feature) => {
		const properties = feature.properties;
		if (!properties) return [];
		const event = properties.event ?? "Tsunami alert";
		const title = properties.headline || event;
		const publishedAt = new Date(properties.effective || properties.sent || Date.now()).toISOString();
		return [{
			id: properties.id || feature.id || stableId(["nws", event, properties.areaDesc, publishedAt]),
			source: properties.senderName || "NWS",
			title,
			summary: stripTags(properties.description ?? title),
			level: levelFromText(`${event} ${title}`),
			category: event,
			region: properties.areaDesc || "Unspecified area",
			instruction: stripTags(properties.instruction ?? ""),
			url: properties.web || "https://www.tsunami.gov/",
			publishedAt,
		}];
	});
}

function mapUsgsEarthquakes(collection) {
	return (collection.features ?? []).flatMap((feature) => {
		const properties = feature.properties;
		if (!properties) return [];
		const coordinates = feature.geometry?.coordinates ?? [];
		return [{
			id: feature.id || stableId(["usgs", properties.title]),
			title: properties.title || `M ${properties.mag} earthquake`,
			place: properties.place || "Unknown location",
			magnitude: properties.mag ?? 0,
			depthKm: typeof coordinates[2] === "number" ? coordinates[2] : null,
			tsunamiFlag: properties.tsunami === 1,
			url: properties.url || "https://earthquake.usgs.gov/earthquakes/map/",
			publishedAt: new Date(properties.time ?? 0).toISOString(),
			longitude: coordinates[0],
			latitude: coordinates[1],
			significance: properties.sig ?? 0,
		}];
	});
}

function mapTsunamiCenterAlerts(xml, source) {
	return parseAtomEntries(xml).map((entry) => {
		const level = levelFromText(`${entry.category ?? ""} ${entry.title} ${entry.summary}`);
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
		};
	});
}

function mapNewsItems(xml) {
	const entries = xml.includes("<entry") ? parseAtomEntries(xml) : parseRssItems(xml);
	return entries.filter((entry) => isHazardNews(entry.title, entry.summary)).map((entry) => ({
		id: stableId(["news", "Google News", entry.id || entry.title]),
		source: "Google News",
		title: entry.title,
		summary: entry.summary,
		url: entry.url,
		publishedAt: entry.publishedAt,
	}));
}

function buildUpdates(alerts, earthquakes, news) {
	return sortByDateDesc(uniqueById([
		...alerts.map((alert) => ({
			id: `update:${alert.id}`,
			kind: "alert",
			title: alert.title,
			summary: alert.summary,
			source: alert.source,
			url: alert.url,
			publishedAt: alert.publishedAt,
			level: alert.level,
		})),
		...earthquakes.filter((quake) => quake.tsunamiFlag || quake.magnitude >= 5).map((quake) => ({
			id: `update:${quake.id}`,
			kind: "earthquake",
			title: quake.title,
			summary: `${quake.place}${quake.tsunamiFlag ? " · USGS tsunami flag set" : ""}`,
			source: "USGS",
			url: quake.url,
			publishedAt: quake.publishedAt,
		})),
		...news.map((item) => ({
			id: `update:${item.id}`,
			kind: "news",
			title: item.title,
			summary: item.summary,
			source: item.source,
			url: item.url,
			publishedAt: item.publishedAt,
		})),
	])).slice(0, 40);
}

export function assembleSnapshot(input) {
	const alerts = sortByDateDesc(uniqueById([
		...mapNwsAlerts(input.nws),
		...mapTsunamiCenterAlerts(input.ptwcXml, "Pacific Tsunami Warning Center"),
		...mapTsunamiCenterAlerts(input.ntwcXml, "National Tsunami Warning Center"),
	]));
	const earthquakes = sortByDateDesc(uniqueById([
		...mapUsgsEarthquakes(input.usgsDay),
		...mapUsgsEarthquakes(input.usgsSignificant),
	])).slice(0, 40);
	const news = sortByDateDesc(uniqueById(mapNewsItems(input.newsXml))).slice(0, 20);
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

export function applyPreviewRedAlert(snapshot) {
	const preview = {
		id: "preview-red-alert",
		source: "Tsunami Red Alerts",
		title: "PREVIEW · Tsunami warning for coastal test region",
		summary: "This is a preview of the red-alert screen. Use the close tab to dismiss the overlay.",
		level: "warning",
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
	return { ...snapshot, alerts, status };
}

export async function loadSnapshot() {
	const [nws, usgsDay, usgsSignificant, ptwcXml, ntwcXml, newsXml] = await Promise.all([
		cachedFetchJson(NWS_ALERTS_URL).catch(() => ({ features: [] })),
		cachedFetchJson(USGS_QUAKES_URL).catch(() => ({ features: [] })),
		cachedFetchJson(USGS_SIGNIFICANT_URL).catch(() => ({ features: [] })),
		cachedFetchText(PTWC_ATOM_URL).catch(() => ""),
		cachedFetchText(NTWC_ATOM_URL).catch(() => ""),
		cachedFetchText(NEWS_RSS_URL).catch(() => ""),
	]);
	return assembleSnapshot({ nws, usgsDay, usgsSignificant, ptwcXml, ntwcXml, newsXml });
}
