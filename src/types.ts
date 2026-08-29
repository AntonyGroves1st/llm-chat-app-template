/**
 * Shared types for Tsunami Red Alerts.
 */

export interface Env {
	AI: Ai;
	ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export type ThreatLevel =
	| "none"
	| "information"
	| "advisory"
	| "watch"
	| "warning";

export interface AlertItem {
	id: string;
	source: string;
	title: string;
	summary: string;
	level: ThreatLevel;
	category: string;
	region: string;
	instruction: string;
	url: string;
	publishedAt: string;
	latitude?: number;
	longitude?: number;
}

export interface EarthquakeItem {
	id: string;
	title: string;
	place: string;
	magnitude: number;
	depthKm: number | null;
	tsunamiFlag: boolean;
	url: string;
	publishedAt: string;
	latitude?: number;
	longitude?: number;
	significance: number;
}

export interface NewsItem {
	id: string;
	source: string;
	title: string;
	summary: string;
	url: string;
	publishedAt: string;
}

export interface UpdateItem {
	id: string;
	kind: "alert" | "earthquake" | "news";
	title: string;
	summary: string;
	source: string;
	url: string;
	publishedAt: string;
	level?: ThreatLevel;
}

export interface StatusPayload {
	level: ThreatLevel;
	redAlert: boolean;
	headline: string;
	detail: string;
	updatedAt: string;
	alertId: string | null;
	counts: {
		alerts: number;
		earthquakes: number;
		news: number;
		updates: number;
	};
}

export interface FeedSnapshot {
	alerts: AlertItem[];
	earthquakes: EarthquakeItem[];
	news: NewsItem[];
	updates: UpdateItem[];
	status: StatusPayload;
}
