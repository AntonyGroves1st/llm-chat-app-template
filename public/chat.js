/**
 * LLM Chat App Frontend
 *
 * Handles the chat UI interactions and communication with the backend API.
 */

import { consumeSseEvents, extractAssistantDelta } from "./chat-sse.js";

const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

if (!chatMessages || !userInput || !sendButton || !typingIndicator) {
	throw new Error("Chat UI failed to initialize: missing required elements");
}

const chatHistory = [
	{
		role: "assistant",
		content:
			"Hello! I'm an LLM chat app powered by Cloudflare Workers AI. How can I help you today?",
	},
];
let isProcessing = false;

userInput.addEventListener("input", function () {
	this.style.height = "auto";
	this.style.height = `${this.scrollHeight}px`;
});

userInput.addEventListener("keydown", function (e) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});

sendButton.addEventListener("click", sendMessage);

/**
 * Sends a message to the chat API and processes the response
 */
async function sendMessage() {
	const message = userInput.value.trim();

	if (message === "" || isProcessing) return;

	isProcessing = true;
	userInput.disabled = true;
	sendButton.disabled = true;

	addMessageToChat("user", message);

	userInput.value = "";
	userInput.style.height = "auto";

	typingIndicator.classList.add("visible");
	chatHistory.push({ role: "user", content: message });

	const assistantMessageEl = document.createElement("div");
	assistantMessageEl.className = "message assistant-message";
	const assistantTextEl = document.createElement("p");
	assistantMessageEl.appendChild(assistantTextEl);
	chatMessages.appendChild(assistantMessageEl);
	chatMessages.scrollTop = chatMessages.scrollHeight;

	let responseText = "";

	try {
		const response = await fetch("/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messages: chatHistory,
			}),
		});

		if (!response.ok) {
			throw new Error("Failed to get response");
		}
		if (!response.body) {
			throw new Error("Response body is null");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		const flushAssistantText = () => {
			assistantTextEl.textContent = responseText;
			chatMessages.scrollTop = chatMessages.scrollHeight;
		};

		let sawDone = false;
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				applySseData(buffer + "\n\n", (data) => {
					const content = parseAssistantEvent(data);
					if (content) {
						responseText += content;
						flushAssistantText();
					}
				});
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;
			for (const data of parsed.events) {
				if (data === "[DONE]") {
					sawDone = true;
					buffer = "";
					break;
				}
				const content = parseAssistantEvent(data);
				if (content) {
					responseText += content;
					flushAssistantText();
				}
			}
			if (sawDone) {
				break;
			}
		}

		if (responseText.length > 0) {
			chatHistory.push({ role: "assistant", content: responseText });
		} else {
			assistantMessageEl.remove();
		}
	} catch (error) {
		console.error("Error:", error);
		if (responseText.length > 0) {
			chatHistory.push({ role: "assistant", content: responseText });
		}
		assistantTextEl.textContent =
			responseText.length > 0
				? `${responseText}\n\nSorry, there was an error processing your request.`
				: "Sorry, there was an error processing your request.";
		chatMessages.scrollTop = chatMessages.scrollHeight;
	} finally {
		typingIndicator.classList.remove("visible");
		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;
		userInput.focus();
	}
}

function addMessageToChat(role, content) {
	const messageEl = document.createElement("div");
	messageEl.className = `message ${role}-message`;
	const textEl = document.createElement("p");
	textEl.textContent = content;
	messageEl.appendChild(textEl);
	chatMessages.appendChild(messageEl);
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

function applySseData(rawBuffer, onEvent) {
	const parsed = consumeSseEvents(rawBuffer);
	for (const data of parsed.events) {
		if (data === "[DONE]") {
			break;
		}
		onEvent(data);
	}
}

function parseAssistantEvent(data) {
	try {
		return extractAssistantDelta(data);
	} catch (e) {
		console.error("Error parsing SSE data as JSON:", e, data);
		return "";
	}
}
