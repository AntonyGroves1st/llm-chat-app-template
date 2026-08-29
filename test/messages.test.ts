import { describe, expect, it } from "vitest";
import {
	MAX_CONTENT_LENGTH,
	MAX_MESSAGES,
	normalizeChatMessages,
	RequestValidationError,
	requireUserMessage,
} from "../src/messages";

describe("normalizeChatMessages", () => {
	it("rejects a missing messages field", () => {
		expect(() => normalizeChatMessages(undefined)).toThrow(
			RequestValidationError,
		);
	});

	it("rejects a non-array messages field", () => {
		expect(() => normalizeChatMessages("hello")).toThrowError(
			"messages must be an array",
		);
		expect(() => normalizeChatMessages({ role: "user" })).toThrow(
			RequestValidationError,
		);
	});

	it("keeps valid messages and drops invalid ones", () => {
		const messages = normalizeChatMessages([
			{ role: "user", content: "  hi  " },
			{ role: "tool", content: "nope" },
			{ role: "assistant", content: "" },
			null,
			{ role: "assistant", content: 12 },
			{ role: "assistant", content: "ok" },
		]);

		expect(messages).toEqual([
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "ok" },
		]);
	});

	it("truncates long content and caps history length", () => {
		const long = "a".repeat(MAX_CONTENT_LENGTH + 25);
		const input = Array.from({ length: MAX_MESSAGES + 5 }, (_, index) => ({
			role: "user" as const,
			content: index === MAX_MESSAGES + 4 ? long : `msg-${index}`,
		}));

		const messages = normalizeChatMessages(input);
		expect(messages).toHaveLength(MAX_MESSAGES);
		expect(messages[0]?.content).toBe("msg-5");
		expect(messages.at(-1)?.content).toHaveLength(MAX_CONTENT_LENGTH);
	});
});

describe("requireUserMessage", () => {
	it("requires at least one user message", () => {
		expect(() =>
			requireUserMessage([{ role: "assistant", content: "hello" }]),
		).toThrowError("at least one user message is required");
	});

	it("accepts a payload that includes a user message", () => {
		expect(() =>
			requireUserMessage([{ role: "user", content: "hello" }]),
		).not.toThrow();
	});
});
