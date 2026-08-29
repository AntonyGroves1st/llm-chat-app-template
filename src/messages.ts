/**
 * Request-body validation for /api/chat.
 */
import { ChatMessage } from "./types";

export const ALLOWED_ROLES = ["system", "user", "assistant"] as const;
export const MAX_MESSAGES = 50;
export const MAX_CONTENT_LENGTH = 8000;

export class RequestValidationError extends Error {
	readonly status = 400;

	constructor(message: string) {
		super(message);
		this.name = "RequestValidationError";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Normalize and validate chat messages from an untrusted request body.
 * Throws RequestValidationError for malformed payloads.
 */
export function normalizeChatMessages(input: unknown): ChatMessage[] {
	if (input === undefined) {
		throw new RequestValidationError("messages is required");
	}

	if (!Array.isArray(input)) {
		throw new RequestValidationError("messages must be an array");
	}

	const normalized: ChatMessage[] = [];

	for (const item of input) {
		if (!isRecord(item)) {
			continue;
		}

		const role = item.role;
		const content = item.content;

		if (
			role !== "system" &&
			role !== "user" &&
			role !== "assistant"
		) {
			continue;
		}

		if (typeof content !== "string") {
			continue;
		}

		const trimmed = content.trim().slice(0, MAX_CONTENT_LENGTH);
		if (!trimmed) {
			continue;
		}

		normalized.push({ role, content: trimmed });
	}

	if (normalized.length > MAX_MESSAGES) {
		return normalized.slice(-MAX_MESSAGES);
	}

	return normalized;
}

export function requireUserMessage(messages: ChatMessage[]): void {
	if (!messages.some((message) => message.role === "user")) {
		throw new RequestValidationError("at least one user message is required");
	}
}
