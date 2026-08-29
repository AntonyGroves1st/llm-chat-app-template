import { describe, expect, it } from "vitest";
import {
	decodeXmlEntities,
	extractTag,
	parseAtomEntries,
	parseRssItems,
	stripTags,
} from "../src/parse";

const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#">
  <entry>
    <title>75 miles SW of Eureka, California</title>
    <updated>2026-08-29T02:46:06Z</updated>
    <geo:lat>40.360</geo:lat>
    <geo:long>-125.438</geo:long>
    <summary type="xhtml"><div><strong>Category:</strong> Information<br/><strong>Affected Region:</strong> 75 miles SW of Eureka, California<br/>There is NO tsunami danger from this earthquake.</div></summary>
    <id>urn:uuid:5144856a-e64b-4de1-8558-70755b5f1708</id>
    <link rel="alternate" title="Bulletin" href="https://www.tsunami.gov/bulletin.txt" />
  </entry>
</feed>`;

const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Pacific tsunami warning canceled after offshore quake</title>
      <link>https://example.com/story</link>
      <pubDate>Sat, 29 Aug 2026 12:00:00 GMT</pubDate>
      <description>Officials say coastal communities can stand down.</description>
      <guid>story-1</guid>
    </item>
  </channel>
</rss>`;

describe("XML helpers", () => {
	it("decodes entities and strips markup", () => {
		expect(stripTags("A &amp; B<br/>C")).toBe("A & B\nC");
		expect(decodeXmlEntities("&#39;quoted&#39;")).toBe("'quoted'");
	});

	it("extracts namespaced tags", () => {
		expect(extractTag(atom, "geo:lat")).toBe("40.360");
	});

	it("parses tsunami.gov Atom bulletins", () => {
		const [entry] = parseAtomEntries(atom);
		expect(entry.title).toContain("Eureka");
		expect(entry.url).toContain("tsunami.gov");
		expect(entry.latitude).toBeCloseTo(40.36);
		expect(entry.category).toBe("Information");
		expect(entry.summary).toMatch(/NO tsunami danger/i);
	});

	it("parses news RSS items", () => {
		const [item] = parseRssItems(rss);
		expect(item.title).toMatch(/tsunami warning canceled/i);
		expect(item.url).toBe("https://example.com/story");
		expect(item.publishedAt).toBe("2026-08-29T12:00:00.000Z");
	});
});
