export function decodeXmlEntities(value) {
	return value
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);/g, (_, dec) =>
			String.fromCodePoint(Number.parseInt(dec, 10)),
		);
}

export function stripTags(html) {
	return decodeXmlEntities(html)
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]{2,}/g, " ")
		.trim();
}

function tagNamePattern(tag) {
	if (tag.includes(":")) return tag.replace(":", "\\:");
	return `(?:[\\w-]+:)?${tag}`;
}

export function extractTag(xml, tag) {
	const name = tagNamePattern(tag);
	const match = xml.match(
		new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"),
	);
	return match ? decodeXmlEntities(match[1].trim()) : null;
}

export function extractAllBlocks(xml, tag) {
	const name = tagNamePattern(tag);
	return [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>[\\s\\S]*?</${name}>`, "gi"))].map(
		(match) => match[0],
	);
}

export function extractAttr(xml, attr) {
	const match = xml.match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
	return match ? decodeXmlEntities(match[1]) : null;
}

export function extractLinkHref(xml, preferredRel) {
	const links = xml.match(/<link\b[^>]*>/gi) ?? [];
	if (preferredRel) {
		const preferred = links.find((link) => extractAttr(link, "rel")?.toLowerCase() === preferredRel.toLowerCase());
		if (preferred) return extractAttr(preferred, "href");
	}
	for (const link of links) {
		const href = extractAttr(link, "href");
		if (href) return href;
	}
	return extractTag(xml, "link");
}

function parseIsoDate(value) {
	if (!value) return new Date(0).toISOString();
	const parsed = Date.parse(stripTags(value));
	return Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString();
}

function parseNumber(value) {
	if (!value) return undefined;
	const number = Number.parseFloat(stripTags(value));
	return Number.isFinite(number) ? number : undefined;
}

export function parseAtomEntries(xml) {
	return extractAllBlocks(xml, "entry").map((block, index) => {
		const title = stripTags(extractTag(block, "title") ?? "Untitled");
		const summary = stripTags(
			extractTag(block, "summary") ?? extractTag(block, "content") ?? "",
		);
		const publishedAt = parseIsoDate(
			extractTag(block, "updated") ?? extractTag(block, "published"),
		);
		return {
			id: extractTag(block, "id") ?? `${title}-${publishedAt}-${index}`,
			title,
			summary,
			url: extractLinkHref(block, "alternate") ?? extractLinkHref(block, "related") ?? "",
			publishedAt,
			category:
				stripTags(extractTag(block, "category") ?? summary.match(/Category:\s*([^\n]+)/i)?.[1] ?? "") ||
				undefined,
			region: stripTags(summary.match(/Affected Region:\s*([^\n]+)/i)?.[1] ?? title) || undefined,
			latitude: parseNumber(extractTag(block, "geo:lat")),
			longitude: parseNumber(extractTag(block, "geo:long")),
		};
	});
}

export function parseRssItems(xml) {
	return extractAllBlocks(xml, "item").map((block, index) => {
		const title = stripTags(extractTag(block, "title") ?? "Untitled");
		const publishedAt = parseIsoDate(
			extractTag(block, "pubDate") ?? extractTag(block, "updated"),
		);
		return {
			id: extractTag(block, "guid") ?? `${title}-${publishedAt}-${index}`,
			title,
			summary: stripTags(extractTag(block, "description") ?? extractTag(block, "summary") ?? ""),
			url: stripTags(extractTag(block, "link") ?? "") || "",
			publishedAt,
		};
	});
}

export function stableId(parts) {
	return parts.filter(Boolean).join(":").replace(/\s+/g, "-").slice(0, 180);
}
