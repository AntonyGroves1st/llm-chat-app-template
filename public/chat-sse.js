/**
 * Server-Sent Event helpers for the chat UI.
 */

export function consumeSseEvents(buffer) {
	let normalized = buffer.replace(/\r/g, "");
	const events = [];
	let eventEndIndex;

	while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
		const rawEvent = normalized.slice(0, eventEndIndex);
		normalized = normalized.slice(eventEndIndex + 2);

		const lines = rawEvent.split("\n");
		const dataLines = [];
		for (const line of lines) {
			if (line.startsWith("data:")) {
				dataLines.push(line.slice("data:".length).trimStart());
			}
		}
		if (dataLines.length === 0) continue;
		events.push(dataLines.join("\n"));
	}

	return { events, buffer: normalized };
}

export function extractAssistantDelta(data) {
	if (data === "[DONE]") {
		return "";
	}

	const jsonData = JSON.parse(data);

	if (typeof jsonData.response === "string" && jsonData.response.length > 0) {
		return jsonData.response;
	}

	const choiceContent = jsonData.choices?.[0]?.delta?.content;
	if (typeof choiceContent === "string") {
		return choiceContent;
	}

	return "";
}
