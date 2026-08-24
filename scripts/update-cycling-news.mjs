import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT_PATH = path.resolve(process.argv[2] || "cycling-news.json");
const MAX_ITEMS_PER_QUERY = 30;

const FEEDS = {
  road: {
    general: 'WorldTour OR Vuelta OR Giro OR "Tour de France" OR "Volta a Portugal" when:30d',
    transfers: '(WorldTour OR "road cycling") (transfer OR signs OR contract OR joins) when:120d'
  },
  mtb: {
    general: '"mountain bike racing" OR "UCI mountain bike" OR XCO OR downhill OR enduro when:30d',
    transfers: '("mountain bike" OR MTB) (transfer OR signs OR contract OR joins OR team) when:120d'
  },
  cyclocross: {
    general: 'cyclocross OR "cyclo-cross" when:60d',
    transfers: '(cyclocross OR "cyclo-cross") (transfer OR signs OR contract OR joins OR team) when:180d'
  },
  gravel: {
    general: '"gravel racing" OR "UCI Gravel" OR "gravel cycling" when:30d',
    transfers: '("gravel cycling" OR "UCI Gravel") (transfer OR signs OR contract OR joins OR team) when:180d'
  }
};

function decodeXml(value) {
  return String(value || "")
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

function tagValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeXml(match?.[1]);
}

function parseItems(xml) {
  return (xml.match(/<item>[\s\S]*?<\/item>/gi) || [])
    .map((block) => ({
      title: tagValue(block, "title"),
      pubDate: tagValue(block, "pubDate"),
      link: tagValue(block, "link")
    }))
    .filter((item) => item.title && /^https?:\/\//.test(item.link))
    .slice(0, MAX_ITEMS_PER_QUERY);
}

function googleNewsFeed(query) {
  return `https://news.google.com/rss/search?${new URLSearchParams({
    q: query,
    hl: "en-GB",
    gl: "GB",
    ceid: "GB:en"
  }).toString()}`;
}

function looksLikeTransfer(title) {
  return /transfer|rumou?r|\bsigns?\b|\bsigned\b|contract|\bjoins?\b|renewal|\bextends?\b|\bmoves?\b|\bdeal\b/i.test(title);
}

async function fetchFeed(discipline, query, type = null) {
  const response = await fetch(googleNewsFeed(query), {
    headers: { "user-agent": "SEM-PLANO-Cycling-News/1.0" }
  });
  if (!response.ok) throw new Error(`${discipline}: Google News respondeu ${response.status}`);
  const items = parseItems(await response.text());
  if (!items.length) throw new Error(`${discipline}: feed sem notícias`);
  return type ? items.filter((item) => looksLikeTransfer(item.title)).map((item) => ({ ...item, type })) : items;
}

const entries = await Promise.all(
  Object.entries(FEEDS).map(async ([discipline, queries]) => {
    const [general, transfers] = await Promise.all([
      fetchFeed(discipline, queries.general),
      fetchFeed(discipline, queries.transfers, "transfers")
    ]);
    const seen = new Set();
    const items = [...general, ...transfers].filter((item) => {
      const key = item.title.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [discipline, items];
  })
);

const payload = {
  updatedAt: new Date().toISOString(),
  disciplines: Object.fromEntries(entries)
};

await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Notícias atualizadas: ${entries.map(([key, items]) => `${key}=${items.length}`).join(", ")}`);
