import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyPreviewRedAlert, loadSnapshot } from "./feeds.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 8787);

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
};

function send(response, status, body, headers = {}) {
	response.writeHead(status, {
		"cache-control": "no-store",
		...headers,
	});
	response.end(body);
}

function json(response, data, status = 200) {
	send(response, status, JSON.stringify(data), {
		"content-type": "application/json; charset=utf-8",
	});
}

async function handleApi(url, response) {
	let snapshot = await loadSnapshot();
	if (url.searchParams.get("preview") === "1") {
		snapshot = applyPreviewRedAlert(snapshot);
	}
	if (url.pathname === "/api/status") return json(response, snapshot.status);
	if (url.pathname === "/api/alerts") return json(response, { updatedAt: snapshot.status.updatedAt, items: snapshot.alerts });
	if (url.pathname === "/api/earthquakes") return json(response, { updatedAt: snapshot.status.updatedAt, items: snapshot.earthquakes });
	if (url.pathname === "/api/news") return json(response, { updatedAt: snapshot.status.updatedAt, items: snapshot.news });
	if (url.pathname === "/api/updates") return json(response, { updatedAt: snapshot.status.updatedAt, items: snapshot.updates });
	if (url.pathname === "/api/feed") return json(response, snapshot);
	if (url.pathname === "/api/chat") {
		return send(
			response,
			200,
			`data: {"response":"Use the dashboard and tsunami.gov for official status. Move inland or to high ground if a red alert is active."}\n\ndata: [DONE]\n\n`,
			{ "content-type": "text/event-stream; charset=utf-8" },
		);
	}
	return send(response, 404, "Not found");
}

function handleStatic(url, response) {
	const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
	const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));
	if (!filePath.startsWith(PUBLIC_DIR)) return send(response, 403, "Forbidden");
	if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
		return send(response, 404, "Not found");
	}
	const ext = path.extname(filePath);
	send(response, 200, fs.readFileSync(filePath), {
		"content-type": MIME[ext] || "application/octet-stream",
	});
}

const server = http.createServer(async (request, response) => {
	try {
		const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
		if (url.pathname.startsWith("/api/")) return await handleApi(url, response);
		return handleStatic(url, response);
	} catch (error) {
		console.error(error);
		if (!response.headersSent) json(response, { error: "Server error" }, 500);
	}
});

server.listen(PORT, "0.0.0.0", () => {
	console.log(`Tsunami Red Alerts running at http://127.0.0.1:${PORT}`);
	console.log("Preview red alert: http://127.0.0.1:" + PORT + "/?preview=1");
});
