/**
 * Threat-level ranking for tsunami products and related earthquakes.
 */

import type {
	AlertItem,
	EarthquakeItem,
	StatusPayload,
	ThreatLevel,
} from "./types";

const LEVEL_RANK: Record<ThreatLevel, number> = {
	none: 0,
	information: 1,
	advisory: 2,
	watch: 3,
	warning: 4,
};

export function rankLevel(level: ThreatLevel): number {
	return LEVEL_RANK[level];
}

export function maxLevel(...levels: ThreatLevel[]): ThreatLevel {
	return levels.reduce<ThreatLevel>((highest, level) => {
		return rankLevel(level) > rankLevel(highest) ? level : highest;
	}, "none");
}

export function levelFromText(text: string): ThreatLevel {
	const value = text.toLowerCase();
	if (
		/\bcancellation\b/.test(value) ||
		/\bcanceled\b/.test(value) ||
		/\bcancelled\b/.test(value) ||
		/\bno tsunami\b/.test(value) ||
		/\bnot pose a tsunami\b/.test(value)
	) {
		return "information";
	}
	if (
		/\btsunami warning\b/.test(value) ||
		(/\bwarning\b/.test(value) && /\btsunami\b/.test(value))
	) {
		return "warning";
	}
	if (
		/\btsunami watch\b/.test(value) ||
		(/\bwatch\b/.test(value) && /\btsunami\b/.test(value))
	) {
		return "watch";
	}
	if (
		/\btsunami advisory\b/.test(value) ||
		(/\badvisory\b/.test(value) && /\btsunami\b/.test(value))
	) {
		return "advisory";
	}
	if (/\binformation\b/.test(value) || /\bstatement\b/.test(value)) {
		return "information";
	}
	return "none";
}

export function earthquakeLevel(quake: EarthquakeItem): ThreatLevel {
	if (quake.tsunamiFlag && quake.magnitude >= 7) return "warning";
	if (quake.tsunamiFlag) return "advisory";
	if (quake.magnitude >= 7.5) return "watch";
	if (quake.magnitude >= 6.5) return "information";
	return "none";
}

export function computeStatus(
	alerts: AlertItem[],
	earthquakes: EarthquakeItem[],
	updatedAt = new Date().toISOString(),
): StatusPayload {
	const alertLevel = maxLevel(...alerts.map((alert) => alert.level));
	const quakeLevel = maxLevel(
		...earthquakes.map((quake) => earthquakeLevel(quake)),
	);
	const level = maxLevel(alertLevel, quakeLevel);
	const leadAlert =
		alerts.find((alert) => alert.level === level) ?? alerts[0] ?? null;
	const leadQuake =
		earthquakes.find((quake) => earthquakeLevel(quake) === level) ?? null;

	const redAlert = level === "warning";
	const headline = redAlert
		? leadAlert?.title || "Tsunami warning in effect"
		: level === "watch"
			? leadAlert?.title || "Tsunami watch in effect"
			: level === "advisory"
				? leadAlert?.title || "Tsunami advisory in effect"
				: level === "information"
					? leadAlert?.title ||
						leadQuake?.title ||
						"Official tsunami information is available"
					: "No active tsunami warning";

	const detail = redAlert
		? leadAlert?.instruction ||
			leadAlert?.summary ||
			"Move inland or to higher ground immediately. Follow local emergency officials."
		: level === "none"
			? "No NWS tsunami warning, watch, or advisory is active. Continue monitoring official sources."
			: leadAlert?.summary ||
				leadQuake?.title ||
				"Review the latest official bulletins below.";

	return {
		level,
		redAlert,
		headline,
		detail,
		updatedAt,
		alertId: leadAlert?.id ?? leadQuake?.id ?? null,
		counts: {
			alerts: alerts.length,
			earthquakes: earthquakes.length,
			news: 0,
			updates: 0,
		},
	};
}
