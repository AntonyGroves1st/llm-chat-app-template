const LEVEL_RANK = { none: 0, information: 1, advisory: 2, watch: 3, warning: 4 };

export function maxLevel(...levels) {
	return levels.reduce((highest, level) =>
		(LEVEL_RANK[level] || 0) > (LEVEL_RANK[highest] || 0) ? level : highest,
	"none");
}

export function levelFromText(text) {
	const value = text.toLowerCase();
	if (/cancellation|canceled|cancelled|no tsunami|not pose a tsunami/.test(value)) {
		return "information";
	}
	if (/\btsunami warning\b/.test(value) || (/\bwarning\b/.test(value) && /\btsunami\b/.test(value))) {
		return "warning";
	}
	if (/\btsunami watch\b/.test(value) || (/\bwatch\b/.test(value) && /\btsunami\b/.test(value))) {
		return "watch";
	}
	if (/\btsunami advisory\b/.test(value) || (/\badvisory\b/.test(value) && /\btsunami\b/.test(value))) {
		return "advisory";
	}
	if (/\binformation\b/.test(value) || /\bstatement\b/.test(value)) return "information";
	return "none";
}

export function earthquakeLevel(quake) {
	if (quake.tsunamiFlag && quake.magnitude >= 7) return "warning";
	if (quake.tsunamiFlag) return "advisory";
	if (quake.magnitude >= 7.5) return "watch";
	if (quake.magnitude >= 6.5) return "information";
	return "none";
}

export function computeStatus(alerts, earthquakes, updatedAt = new Date().toISOString()) {
	const alertLevel = maxLevel(...alerts.map((alert) => alert.level));
	const quakeLevel = maxLevel(...earthquakes.map(earthquakeLevel));
	const level = maxLevel(alertLevel, quakeLevel);
	const leadAlert = alerts.find((alert) => alert.level === level) ?? alerts[0] ?? null;
	const leadQuake = earthquakes.find((quake) => earthquakeLevel(quake) === level) ?? null;
	const redAlert = level === "warning";
	return {
		level,
		redAlert,
		headline: redAlert
			? leadAlert?.title || "Tsunami warning in effect"
			: level === "watch"
				? leadAlert?.title || "Tsunami watch in effect"
				: level === "advisory"
					? leadAlert?.title || "Tsunami advisory in effect"
					: level === "information"
						? leadAlert?.title || leadQuake?.title || "Official tsunami information is available"
						: "No active tsunami warning",
		detail: redAlert
			? leadAlert?.instruction || leadAlert?.summary ||
				"Move inland or to higher ground immediately. Follow local emergency officials."
			: level === "none"
				? "No NWS tsunami warning, watch, or advisory is active. Continue monitoring official sources."
				: leadAlert?.summary || leadQuake?.title || "Review the latest official bulletins below.",
		updatedAt,
		alertId: leadAlert?.id ?? leadQuake?.id ?? null,
		counts: { alerts: alerts.length, earthquakes: earthquakes.length, news: 0, updates: 0 },
	};
}
