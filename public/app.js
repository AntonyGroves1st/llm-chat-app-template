/**
 * Tsunami Red Alerts dashboard.
 * Loads official feeds, drives the red-alert overlay, and hosts safety chat.
 */

const DISMISS_KEY = "tsunami-red-alert-dismissed";
const REFRESH_MS = 60_000;

const statusChip = document.getElementById("status-chip");
const headlineEl = document.getElementById("headline");
const detailEl = document.getElementById("detail");
const updatedEl = document.getElementById("updated-at");
const overlay = document.getElementById("red-alert-overlay");
const reopenTab = document.getElementById("reopen-tab");
const reopenCopy = document.getElementById("reopen-copy");
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");

const panels = {
	overview: document.getElementById("panel-overview"),
	alerts: document.getElementById("panel-alerts"),
	earthquakes: document.getElementById("panel-earthquakes"),
	news: document.getElementById("panel-news"),
	updates: document.getElementById("panel-updates"),
	safety: document.getElementById("panel-safety"),
};

let snapshot = null;
let previewMode = false;
let isProcessing = false;
let chatHistory = [
	{
		role: "assistant",
		content:
			"I can explain tsunami warnings, watches, and what to do if a red alert appears. I cannot replace official alerts — check the dashboard and local emergency officials.",
	},
];

addMessageToChat(chatHistory[0].role, chatHistory[0].content);

document.querySelectorAll(".tab").forEach((tab) => {
	tab.addEventListener("click", () => showTab(tab.dataset.tab));
});

document.getElementById("refresh-btn").addEventListener("click", () => {
	loadFeed();
});

document.getElementById("preview-btn").addEventListener("click", () => {
	previewMode = true;
	sessionStorage.removeItem(DISMISS_KEY);
	loadFeed();
});

document.getElementById("close-tab-btn").addEventListener("click", closeRedAlert);
document.getElementById("close-alert-btn").addEventListener("click", closeRedAlert);
document.getElementById("reopen-btn").addEventListener("click", openRedAlert);

document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && !overlay.classList.contains("hidden")) {
		closeRedAlert();
	}
});

userInput.addEventListener("keydown", (event) => {
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		sendMessage();
	}
});
sendButton.addEventListener("click", sendMessage);

function apiUrl(path) {
	const url = new URL(path, window.location.origin);
	if (previewMode) url.searchParams.set("preview", "1");
	return url.toString();
}

function showTab(name) {
	Object.entries(panels).forEach(([key, panel]) => {
		panel.classList.toggle("hidden", key !== name);
	});
	document.querySelectorAll(".tab").forEach((tab) => {
		tab.classList.toggle("active", tab.dataset.tab === name);
	});
}

function formatTime(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Unknown time";
	return date.toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function card(item, extra = "") {
	const article = document.createElement("article");
	article.className = "card";
	const level = item.level ? `level-${item.level}` : "";
	const heading = document.createElement("h3");
	heading.textContent = item.title;
	const meta = document.createElement("p");
	meta.className = "card-meta";
	meta.textContent = [item.source, item.region || item.place, formatTime(item.publishedAt)]
		.filter(Boolean)
		.join(" · ");
	const summary = document.createElement("p");
	summary.textContent = item.summary || extra || "";
	article.append(heading, meta, summary);
	if (item.level) {
		const chip = document.createElement("div");
		chip.className = `status-chip ${level}`;
		chip.style.marginTop = "0.7rem";
		chip.textContent = item.level;
		article.append(chip);
	}
	if (item.url) {
		const link = document.createElement("p");
		link.style.marginTop = "0.65rem";
		const anchor = document.createElement("a");
		anchor.href = item.url;
		anchor.target = "_blank";
		anchor.rel = "noreferrer";
		anchor.textContent = "Open source";
		link.append(anchor);
		article.append(link);
	}
	return article;
}

function emptyCard(message) {
	const article = document.createElement("article");
	article.className = "card";
	article.textContent = message;
	return article;
}

function renderLists() {
	if (!snapshot) return;
	const alertCards = snapshot.alerts.map((item) => card(item, item.instruction));
	const quakeCards = snapshot.earthquakes.map((item) =>
		card(
			{
				...item,
				source: "USGS",
				summary: `Magnitude ${item.magnitude}${
					item.tsunamiFlag ? " · tsunami flag set" : ""
				}${item.depthKm != null ? ` · depth ${item.depthKm} km` : ""}`,
			},
			item.place,
		),
	);
	const newsCards = snapshot.news.map((item) => card(item));
	const updateCards = snapshot.updates.map((item) => card(item));

	const overviewAlerts = document.getElementById("overview-alerts");
	const overviewSide = document.getElementById("overview-side");
	overviewAlerts.replaceChildren(
		...(alertCards.slice(0, 3).length
			? alertCards.slice(0, 3)
			: [emptyCard("No active NWS tsunami products. Latest warning-center bulletins will appear here.")]),
	);
	overviewSide.replaceChildren(
		...(newsCards.slice(0, 2).length ? newsCards.slice(0, 2) : [emptyCard("No recent tsunami news.")]),
		...(quakeCards.slice(0, 2).length ? quakeCards.slice(0, 2) : []),
	);

	document
		.getElementById("panel-alerts")
		.replaceChildren(...(alertCards.length ? alertCards : [emptyCard("No tsunami alerts right now.")]));
	document
		.getElementById("panel-earthquakes")
		.replaceChildren(
			...(quakeCards.length ? quakeCards : [emptyCard("No magnitude 4.5+ earthquakes in the past day.")]),
		);
	document
		.getElementById("panel-news")
		.replaceChildren(...(newsCards.length ? newsCards : [emptyCard("News feed unavailable.")]));
	document
		.getElementById("panel-updates")
		.replaceChildren(
			...(updateCards.length ? updateCards : [emptyCard("No combined updates yet.")]),
		);
}

function syncStatus() {
	const status = snapshot.status;
	statusChip.className = `status-chip ${status.level}`;
	statusChip.textContent = status.redAlert
		? "Red alert"
		: status.level === "none"
			? "All clear"
			: status.level;
	headlineEl.textContent = status.headline;
	detailEl.textContent = status.detail;
	updatedEl.textContent = `Updated ${formatTime(status.updatedAt)}`;
	document.getElementById("count-alerts").textContent = String(status.counts.alerts);
	document.getElementById("count-earthquakes").textContent = String(
		status.counts.earthquakes,
	);
	document.getElementById("count-news").textContent = String(status.counts.news);
	document.getElementById("count-updates").textContent = String(status.counts.updates);

	document.getElementById("alert-source").textContent =
		snapshot.alerts[0]?.source || "Official tsunami product";
	document.getElementById("alert-title").textContent = status.headline;
	document.getElementById("alert-region").textContent = snapshot.alerts[0]?.region || "";
	document.getElementById("alert-summary").textContent =
		snapshot.alerts[0]?.instruction || status.detail;
	document.getElementById("alert-link").href =
		snapshot.alerts[0]?.url || "https://www.tsunami.gov/";
	reopenCopy.textContent = status.headline;

	const dismissed = sessionStorage.getItem(DISMISS_KEY) === status.alertId;
	if (status.redAlert && !dismissed) {
		openRedAlert();
	} else if (status.redAlert && dismissed) {
		overlay.classList.add("hidden");
		reopenTab.classList.remove("hidden");
	} else {
		overlay.classList.add("hidden");
		reopenTab.classList.add("hidden");
	}
}

function openRedAlert() {
	if (!snapshot?.status.redAlert) return;
	overlay.classList.remove("hidden");
	reopenTab.classList.add("hidden");
	document.getElementById("close-tab-btn").focus();
}

function closeRedAlert() {
	overlay.classList.add("hidden");
	if (snapshot?.status.redAlert) {
		sessionStorage.setItem(DISMISS_KEY, snapshot.status.alertId || "dismissed");
		reopenTab.classList.remove("hidden");
	}
}

async function loadFeed() {
	updatedEl.textContent = "Refreshing official sources…";
	try {
		const response = await fetch(apiUrl("/api/feed"), { cache: "no-store" });
		if (!response.ok) throw new Error("Feed request failed");
		snapshot = await response.json();
		syncStatus();
		renderLists();
	} catch (error) {
		console.error(error);
		updatedEl.textContent = "Unable to refresh feeds. Retrying shortly.";
	}
}

function addMessageToChat(role, content) {
	const messageEl = document.createElement("div");
	messageEl.className = `message ${role}-message`;
	messageEl.textContent = content;
	chatMessages.appendChild(messageEl);
	chatMessages.scrollTop = chatMessages.scrollHeight;
	return messageEl;
}

function consumeSseEvents(buffer) {
	let normalized = buffer.replace(/\r/g, "");
	const events = [];
	let eventEndIndex;
	while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
		const rawEvent = normalized.slice(0, eventEndIndex);
		normalized = normalized.slice(eventEndIndex + 2);
		const dataLines = [];
		for (const line of rawEvent.split("\n")) {
			if (line.startsWith("data:")) {
				dataLines.push(line.slice("data:".length).trimStart());
			}
		}
		if (dataLines.length) events.push(dataLines.join("\n"));
	}
	return { events, buffer: normalized };
}

function extractDelta(jsonData) {
	if (typeof jsonData.response === "string" && jsonData.response.length > 0) {
		return jsonData.response;
	}
	return jsonData.choices?.[0]?.delta?.content || "";
}

async function sendMessage() {
	const message = userInput.value.trim();
	if (!message || isProcessing) return;

	isProcessing = true;
	userInput.disabled = true;
	sendButton.disabled = true;
	addMessageToChat("user", message);
	userInput.value = "";
	chatHistory.push({ role: "user", content: message });

	const assistantEl = addMessageToChat("assistant", "");
	try {
		const response = await fetch("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ messages: chatHistory }),
		});
		if (!response.ok || !response.body) throw new Error("Chat failed");

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let responseText = "";
		let buffer = "";
		let sawDone = false;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;
			for (const data of parsed.events) {
				if (data === "[DONE]") {
					sawDone = true;
					break;
				}
				try {
					const content = extractDelta(JSON.parse(data));
					if (content) {
						responseText += content;
						assistantEl.textContent = responseText;
						chatMessages.scrollTop = chatMessages.scrollHeight;
					}
				} catch (error) {
					console.error("Error parsing SSE data as JSON:", error, data);
				}
			}
			if (sawDone) break;
		}

		if (responseText) {
			chatHistory.push({ role: "assistant", content: responseText });
		} else {
			assistantEl.textContent =
				"I could not generate a reply. Use the dashboard and tsunami.gov for official status.";
		}
	} catch (error) {
		console.error(error);
		assistantEl.textContent =
			"Safety chat is unavailable right now. If you may be in danger, move inland or to high ground and follow local officials.";
	} finally {
		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;
		userInput.focus();
	}
}

loadFeed();
setInterval(loadFeed, REFRESH_MS);
