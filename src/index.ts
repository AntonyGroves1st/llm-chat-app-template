/**
 * Tsunami Red Alerts
 *
 * Cloudflare Worker that serves a red-alert dashboard and JSON APIs
 * backed by NWS, USGS, and tsunami.gov feeds, plus a safety chat assistant.
 */

import { applyPreviewRedAlert, loadSnapshot } from "./feeds";
import type { ChatMessage, Env } from "./types";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

const SYSTEM_PROMPT = [
	"You are the Tsunami Red Alerts safety assistant.",
	"Give concise, practical tsunami and coastal earthquake guidance.",
	"Never invent official warnings. If the user asks whether a warning is active, tell them to check the dashboard and tsunami.gov / local emergency officials.",
	"If they may be in danger, tell them to move inland or to high ground, stay off the beach, and follow official instructions.",
	"Do not provide medical, legal, or evacuation-route guarantees.",
].join(" ");

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "public, max-age=15",
		},
	});
}

export default {
	async fetch(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		if (url.pathname === "/api/chat") {
			if (request.method !== "POST") {
				return new Response("Method not allowed", { status: 405 });
			}
			return handleChatRequest(request, env);
		}

		if (request.method !== "GET") {
			return new Response("Method not allowed", { status: 405 });
		}

		try {
			let snapshot = await loadSnapshot();
			if (url.searchParams.get("preview") === "1") {
				snapshot = applyPreviewRedAlert(snapshot);
			}

			if (url.pathname === "/api/status") {
				return jsonResponse(snapshot.status);
			}
			if (url.pathname === "/api/alerts") {
				return jsonResponse({
					updatedAt: snapshot.status.updatedAt,
					items: snapshot.alerts,
				});
			}
			if (url.pathname === "/api/earthquakes") {
				return jsonResponse({
					updatedAt: snapshot.status.updatedAt,
					items: snapshot.earthquakes,
				});
			}
			if (url.pathname === "/api/news") {
				return jsonResponse({
					updatedAt: snapshot.status.updatedAt,
					items: snapshot.news,
				});
			}
			if (url.pathname === "/api/updates") {
				return jsonResponse({
					updatedAt: snapshot.status.updatedAt,
					items: snapshot.updates,
				});
			}
			if (url.pathname === "/api/feed") {
				return jsonResponse(snapshot);
			}

			return new Response("Not found", { status: 404 });
		} catch (error) {
			console.error("Feed request failed:", error);
			return jsonResponse({ error: "Failed to load tsunami feeds" }, 502);
		}
	},
} satisfies ExportedHandler<Env>;

async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const { messages = [] } = (await request.json()) as {
			messages: ChatMessage[];
		};

		if (!messages.some((msg) => msg.role === "system")) {
			messages.unshift({ role: "system", content: SYSTEM_PROMPT });
		}

		const inputs = {
			messages,
			max_tokens: 1024,
			stream: true,
		} satisfies AiTextGenerationInput & { stream: true };

		const stream = await env.AI.run<typeof MODEL_ID>(MODEL_ID, inputs);
		return new Response(stream, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("Error processing chat request:", error);
		return jsonResponse({ error: "Failed to process request" }, 500);
	}
}
