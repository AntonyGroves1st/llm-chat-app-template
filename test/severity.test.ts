import { describe, expect, it } from "vitest";
import { assembleSnapshot } from "../src/feeds";
import {
	computeStatus,
	earthquakeLevel,
	levelFromText,
	maxLevel,
} from "../src/severity";
import type { AlertItem, EarthquakeItem } from "../src/types";

const warningAlert: AlertItem = {
	id: "nws-1",
	source: "NWS",
	title: "Tsunami Warning issued for the Oregon coast",
	summary: "A tsunami warning is in effect.",
	level: "warning",
	category: "Tsunami Warning",
	region: "Oregon coast",
	instruction: "Move to high ground now.",
	url: "https://www.tsunami.gov/",
	publishedAt: "2026-08-29T12:00:00.000Z",
};

const quake: EarthquakeItem = {
	id: "us-1",
	title: "M 7.2 - offshore Alaska",
	place: "offshore Alaska",
	magnitude: 7.2,
	depthKm: 18,
	tsunamiFlag: true,
	url: "https://earthquake.usgs.gov/",
	publishedAt: "2026-08-29T11:00:00.000Z",
	significance: 900,
};

describe("threat ranking", () => {
	it("maps official product text to levels", () => {
		expect(levelFromText("Tsunami Warning for Hawaii")).toBe("warning");
		expect(levelFromText("Tsunami Watch")).toBe("watch");
		expect(levelFromText("Tsunami Advisory")).toBe("advisory");
		expect(levelFromText("There is NO tsunami danger from this earthquake.")).toBe(
			"information",
		);
		expect(levelFromText("Tsunami warning canceled for the Oregon coast")).toBe(
			"information",
		);
	});

	it("picks the strongest level", () => {
		expect(maxLevel("information", "watch", "advisory")).toBe("watch");
	});

	it("raises USGS tsunami-flagged major quakes to warning", () => {
		expect(earthquakeLevel(quake)).toBe("warning");
		expect(earthquakeLevel({ ...quake, magnitude: 6.4, tsunamiFlag: true })).toBe(
			"advisory",
		);
	});

	it("opens a red alert for warning products", () => {
		const status = computeStatus([warningAlert], [], "2026-08-29T12:01:00.000Z");
		expect(status.redAlert).toBe(true);
		expect(status.level).toBe("warning");
		expect(status.alertId).toBe("nws-1");
		expect(status.headline).toMatch(/Tsunami Warning/i);
	});

	it("stays all-clear when nothing is active", () => {
		const status = computeStatus([], []);
		expect(status.redAlert).toBe(false);
		expect(status.level).toBe("none");
	});
});

describe("snapshot assembly", () => {
	it("merges NWS, warning-center, USGS, and news APIs", () => {
		const snapshot = assembleSnapshot({
			nws: {
				features: [
					{
						id: "https://api.weather.gov/alerts/urn:oid:1",
						properties: {
							event: "Tsunami Warning",
							headline: "Tsunami Warning for coastal test zone",
							description: "Waves are expected.",
							instruction: "Evacuate the beach.",
							areaDesc: "Coastal Test Zone",
							effective: "2026-08-29T12:00:00Z",
							senderName: "NWS",
							web: "https://www.tsunami.gov/alert",
						},
					},
				],
			},
			usgsDay: {
				features: [
					{
						id: "us7000",
						properties: {
							mag: 6.8,
							place: "near the coast of Chile",
							time: Date.parse("2026-08-29T10:00:00Z"),
							url: "https://earthquake.usgs.gov/us7000",
							title: "M 6.8 - near the coast of Chile",
							tsunami: 1,
							sig: 700,
						},
						geometry: { coordinates: [-72.1, -33.4, 22] },
					},
				],
			},
			usgsSignificant: { features: [] },
			ptwcXml: `<?xml version="1.0"?><feed><entry><title>SCOTIA SEA</title><updated>2026-08-22T08:30:40Z</updated><summary>Category: Information</summary><id>ptwc-1</id><link href="https://www.tsunami.gov/ptwc" /></entry></feed>`,
			ntwcXml: `<?xml version="1.0"?><feed></feed>`,
			newsXml: `<?xml version="1.0"?><rss><channel><item><title>Tsunami drills expand across the Pacific</title><link>https://news.example/tsunami</link><pubDate>Sat, 29 Aug 2026 08:00:00 GMT</pubDate><description>Civil defense agencies refresh evacuation maps.</description></item></channel></rss>`,
			now: "2026-08-29T12:05:00.000Z",
		});

		expect(snapshot.status.redAlert).toBe(true);
		expect(snapshot.alerts.some((item) => item.category === "Tsunami Warning")).toBe(
			true,
		);
		expect(snapshot.earthquakes[0]?.tsunamiFlag).toBe(true);
		expect(snapshot.news[0]?.title).toMatch(/Tsunami drills/i);
		expect(snapshot.updates[0]?.kind).toBe("alert");
		expect(snapshot.status.counts.news).toBeGreaterThan(0);
	});
});
