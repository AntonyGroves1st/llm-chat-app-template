/**
 * Lightweight XML / HTML helpers for official alert and news feeds.
 */

export function decodeXmlEntities(value: string): string {
	return value
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);/g, (_, dec: string) =>
			String.fromCodePoint(Number.parseInt(dec, 10)),
		);
}

export function stripTags(html: string): string {
	return decodeXmlEntities(html)
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]{2,}/g, " ")
		.trim();
}

function tagNamePattern(tag: string): string {
	if (tag.includes(":")) {
		return tag.replace(":", "\\:");
	}
	return `(?:[\\w-]+:)?${tag}`;
}

export function extractTag(xml: string, tag: string): string | null {
	const name = tagNamePattern(tag);
	const match = xml.match(
		new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"),
	);
	if (!match) return null;
	return decodeXmlEntities(match[1].trim());
}

export function extractAllBlocks(xml: string, tag: string): string[] {
	const name = tagNamePattern(tag);
	const blocks: string[] = [];
	const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>[\\s\\S]*?</${name}>`, "gi");
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(xml)) !== null) {
		blocks.push(match[0]);
	}
	return blocks;
}

export function extractAttr(xml: string, attr: string): string | null {
	const match = xml.match(
		new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i"),
	);
	return match ? decodeXmlEntities(match[1]) : null;
}

export function extractLinkHref(
	xml: string,
	preferredRel?: string,
): string | null {
	const links = xml.match(/<link\b[^>]*>/gi) ?? [];
	if (preferredRel) {
		const preferred = links.find((link) => {
			const rel = extractAttr(link, "rel");
			return rel?.toLowerCase() === preferredRel.toLowerCase();
		});
		if (preferred) {
			return extractAttr(preferred, "href");
		}
	}
	for (const link of links) {
		const href = extractAttr(link, "href");
		if (href) return href;
	}
	return extractTag(xml, "link");
}

export interface ParsedFeedEntry {
	id: string;
	title: string;
	summary: string;
	url: string;
	publishedAt: string;
	category?: string;
	region?: string;
	latitude?: number;
	longitude?: number;
}

function parseIsoDate(value: string | null): string {
	if (!value) return new Date(0).toISOString();
	const cleaned = stripTags(value);
	const parsed = Date.parse(cleaned);
	if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
	const usgs = cleaned.match(
		/(\d{4})[./-](\d{2})[./-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
	);
	if (usgs) {
		return new Date(
			Date.UTC(
				Number(usgs[1]),
				Number(usgs[2]) - 1,
				Number(usgs[3]),
				Number(usgs[4]),
				Number(usgs[5]),
				Number(usgs[6]),
			),
		).toISOString();
	}
	return new Date(0).toISOString();
}

function parseNumber(value: string | null): number | undefined {
	if (!value) return undefined;
	const number = Number.parseFloat(stripTags(value));
	return Number.isFinite(number) ? number : undefined;
}

export function parseAtomEntries(xml: string): ParsedFeedEntry[] {
	return extractAllBlocks(xml, "entry").map((block, index) => {
		const title = stripTags(extractTag(block, "title") ?? "Untitled");
		const summary = stripTags(
			extractTag(block, "summary") ??
				extractTag(block, "content") ??
				extractTag(block, "note") ??
				"",
		);
		const url =
			extractLinkHref(block, "alternate") ??
			extractLinkHref(block, "related") ??
			"";
		const publishedAt = parseIsoDate(
			extractTag(block, "updated") ??
				extractTag(block, "published") ??
				extractTag(block, "issued"),
		);
		const category =
			stripTags(
				extractTag(block, "category") ??
					summary.match(/Category:\s*([^\n]+)/i)?.[1] ??
					"",
			) || undefined;
		const region =
			stripTags(
				summary.match(/Affected Region:\s*([^\n]+)/i)?.[1] ?? title,
			) || undefined;
		return {
			id: extractTag(block, "id") ?? `${title}-${publishedAt}-${index}`,
			title,
			summary,
			url,
			publishedAt,
			category,
			region,
			latitude: parseNumber(extractTag(block, "geo:lat")),
			longitude: parseNumber(extractTag(block, "geo:long")),
		};
	});
}

export function parseRssItems(xml: string): ParsedFeedEntry[] {
	return extractAllBlocks(xml, "item").map((block, index) => {
		const title = stripTags(extractTag(block, "title") ?? "Untitled");
		const summary = stripTags(
			extractTag(block, "description") ??
				extractTag(block, "summary") ??
				"",
		);
		const url = stripTags(extractTag(block, "link") ?? "") || "";
		const publishedAt = parseIsoDate(
			extractTag(block, "pubDate") ??
				extractTag(block, "dc:date") ??
				extractTag(block, "updated"),
		);
		return {
			id: extractTag(block, "guid") ?? `${title}-${publishedAt}-${index}`,
			title,
			summary,
			url,
			publishedAt,
			category: stripTags(extractTag(block, "category") ?? "") || undefined,
		};
	});
}

export function stableId(parts: Array<string | number | undefined>): string {
	return parts
		.filter((part) => part !== undefined && part !== "")
		.join(":")
		.replace(/\s+/g, "-")
		.slice(0, 180);
}
