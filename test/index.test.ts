import { describe, expect, it, vi } from "vitest";
import {
	consumeSseEvents,
	extractAssistantDelta,
} from "../public/chat-sse.js";
import worker from "../src/index";
import { Env } from "../src/types";

function createExecutionContext(): ExecutionContext {
	return {
		waitUntil() {},
		passThroughOnException() {},
		props: {},
	} as ExecutionContext;
}

function createEnv(aiRun?: Env["AI"]["run"]): Env {
	return {
		AI: {
			run: aiRun ?? vi.fn(async () => new ReadableStream()),
		} as unknown as Env["AI"],
		ASSETS: {
			fetch: async (request: Request) =>
				new Response(`asset:${new URL(request.url).pathname}`, { status: 200 }),
		},
	};
}

describe("worker fetch", () => {
	it("serves static assets for non-API routes", async () => {
		const response = await worker.fetch(
			new Request("https://example.com/chat.js"),
			createEnv(),
			createExecutionContext(),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("asset:/chat.js");
	});

	it("rejects non-POST chat requests", async () => {
		const response = await worker.fetch(
			new Request("https://example.com/api/chat"),
			createEnv(),
			createExecutionContext(),
		);

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("POST");
	});

	it("returns 404 for unknown API routes", async () => {
		const response = await worker.fetch(
			new Request("https://example.com/api/unknown"),
			createEnv(),
			createExecutionContext(),
		);

		expect(response.status).toBe(404);
	});

	it("returns 400 for invalid JSON", async () => {
		const response = await worker.fetch(
			new Request("https://example.com/api/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			}),
			createEnv(),
			createExecutionContext(),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Invalid JSON body" });
	});

	it("returns 400 when messages is not an array", async () => {
		const response = await worker.fetch(
			new Request("https://example.com/api/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ messages: "hello" }),
			}),
			createEnv(),
			createExecutionContext(),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "messages must be an array",
		});
	});

	it("returns 400 when there is no user message", async () => {
		const response = await worker.fetch(
			new Request("https://example.com/api/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					messages: [{ role: "assistant", content: "hi" }],
				}),
			}),
			createEnv(),
			createExecutionContext(),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "at least one user message is required",
		});
	});

	it("streams a chat response and accepts a trailing slash", async () => {
		const run = vi.fn(async (_model, inputs) => {
			expect(inputs.messages[0]).toEqual({
				role: "system",
				content:
					"You are a helpful, friendly assistant. Provide concise and accurate responses.",
			});
			expect(inputs.messages.some((message: { role: string }) => message.role === "user")).toBe(
				true,
			);
			return new ReadableStream({
				start(controller) {
					controller.enqueue(
						new TextEncoder().encode('data: {"response":"Hello"}\n\n'),
					);
					controller.close();
				},
			});
		});

		const response = await worker.fetch(
			new Request("https://example.com/api/chat/", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					messages: [{ role: "user", content: "Hi there" }],
				}),
			}),
			createEnv(run as unknown as Env["AI"]["run"]),
			createExecutionContext(),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		const raw = await response.text();
		expect(raw).toContain("Hello");
		const parsed = consumeSseEvents(raw.endsWith("\n\n") ? raw : `${raw}\n\n`);
		const text = parsed.events
			.filter((event) => event !== "[DONE]")
			.map((event) => extractAssistantDelta(event))
			.join("");
		expect(text).toBe("Hello");
		expect(run).toHaveBeenCalledOnce();
	});

	it("returns 500 when the model run fails", async () => {
		const run = vi.fn(async () => {
			throw new Error("model down");
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			const response = await worker.fetch(
				new Request("https://example.com/api/chat", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						messages: [{ role: "user", content: "Hi there" }],
					}),
				}),
				createEnv(run as unknown as Env["AI"]["run"]),
				createExecutionContext(),
			);

			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({
				error: "Failed to process request",
			});
		} finally {
			errorSpy.mockRestore();
		}
	});
});
