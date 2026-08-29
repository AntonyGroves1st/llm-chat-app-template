import { describe, expect, it } from "vitest";
import {
	consumeSseEvents,
	extractAssistantDelta,
} from "../public/chat-sse.js";

describe("consumeSseEvents", () => {
	it("parses complete SSE events and leaves a partial event in the buffer", () => {
		const parsed = consumeSseEvents(
			'data: {"response":"Hello"}\n\ndata: {"response":" there"}',
		);

		expect(parsed.events).toEqual(['{"response":"Hello"}']);
		expect(parsed.buffer).toBe('data: {"response":" there"}');
	});

	it("joins multi-line data fields and ignores comments", () => {
		const parsed = consumeSseEvents(
			': keep-alive\n\ndata: {"response":"Hel"}\ndata: {"response":"lo"}\n\n',
		);

		expect(parsed.events).toEqual(['{"response":"Hel"}\n{"response":"lo"}']);
		expect(parsed.buffer).toBe("");
	});

	it("treats CRLF as a valid event separator", () => {
		const parsed = consumeSseEvents('data: {"response":"Hi"}\r\n\r\n');
		expect(parsed.events).toEqual(['{"response":"Hi"}']);
	});

	it("reassembles chunks split across TCP reads like the chat UI does", () => {
		const chunks = ['data: {"res', 'ponse":"Hel"}\n\ndata: {"response":"lo"}\n', "\n"];
		let buffer = "";
		let text = "";

		for (const chunk of chunks) {
			buffer += chunk;
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;
			for (const data of parsed.events) {
				if (data === "[DONE]") continue;
				text += extractAssistantDelta(data);
			}
		}

		expect(text).toBe("Hello");
		expect(buffer).toBe("");
	});
});

describe("extractAssistantDelta", () => {
	it("reads Workers AI response chunks", () => {
		expect(extractAssistantDelta('{"response":"Hello"}')).toBe("Hello");
	});

	it("reads OpenAI-style delta chunks", () => {
		expect(
			extractAssistantDelta('{"choices":[{"delta":{"content":"Hi"}}]}'),
		).toBe("Hi");
	});

	it("returns an empty string for [DONE] and empty payloads", () => {
		expect(extractAssistantDelta("[DONE]")).toBe("");
		expect(extractAssistantDelta("{}")).toBe("");
	});

	it("throws when the event is not JSON", () => {
		expect(() => extractAssistantDelta("not-json")).toThrow();
	});
});
