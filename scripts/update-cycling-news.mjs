import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT_PATH = path.resolve(process.argv[2] || "cycling-news.json");
const MAX_ITEMS_PER_QUERY = 12;
const MAX_GENERAL_ITEMS_PER_SOURCE = 8;
const MAX_ITEMS_PER_DISCIPLINE = 60;

const SOURCES = {
  road: [
    { name: "Cyclingnews", domain: "cyclingnews.com", language: "en" },
    { name: "Escape Collective", domain: "escapecollective.com", language: "en" },
    { name: "Cycling Weekly", domain: "cyclingweekly.com", language: "en" },
    { name: "VELO", domain: "velo.outsideonline.com", language: "en" },
    { name: "CyclingUpToDate", domain: "cyclinguptodate.com", language: "en" }
  ],
  mtb: [
    { name: "Pinkbike", domain: "pinkbike.com", language: "en" },
    { name: "Vital MTB", domain: "vitalmtb.com", language: "en" },
    { name: "Escape Collective", domain: "escapecollective.com", language: "en" },
    { name: "VELO", domain: "velo.outsideonline.com", language: "en" },
    { name: "UCI", domain: "uci.org", language: "en" }
  ],
  cyclocross: [
    { name: "Cyclocross Magazine", domain: "cxmagazine.com", language: "en" },
    { name: "Cyclocross24", domain: "cyclocross24.com", language: "en" },
    { name: "Cyclingnews", domain: "cyclingnews.com", language: "en" },
    { name: "CyclingUpToDate", domain: "cyclinguptodate.com", language: "en" },
    { name: "UCI", domain: "uci.org", language: "en" }
  ],
  gravel: [
    { name: "Escape Collective", domain: "escapecollective.com", language: "en" },
    { name: "VELO", domain: "velo.outsideonline.com", language: "en" },
    { name: "Gravel Cyclist", domain: "gravelcyclist.com", language: "en" },
    { name: "Cyclingnews", domain: "cyclingnews.com", language: "en" },
    { name: "Cycling Weekly", domain: "cyclingweekly.com", language: "en" },
    { name: "BikeRadar", domain: "bikeradar.com", language: "en" }
  ]
};

for (const [discipline, sources] of Object.entries(SOURCES)) {
  const invalidSource = sources.find((source) => source.language !== "en");
  if (invalidSource) throw new Error(`${discipline}: a fonte ${invalidSource.name} não está marcada como inglesa`);
}

const FEEDS = {
  road: {
    general: 'WorldTour OR Vuelta OR Giro OR "Tour de France" OR "Volta a Portugal"',
    transfers: '(WorldTour OR "road cycling") (transfer OR signs OR contract OR joins)'
  },
  mtb: {
    general: '"mountain bike racing" OR "UCI mountain bike" OR XCO OR downhill OR enduro',
    transfers: '("mountain bike" OR MTB) (transfer OR signs OR contract OR joins OR team)'
  },
  cyclocross: {
    general: 'cyclocross OR "cyclo-cross"',
    transfers: '(cyclocross OR "cyclo-cross") (transfer OR signs OR contract OR joins OR team)'
  },
  gravel: {
    general: '"gravel racing" OR "UCI Gravel" OR "gravel cycling"',
    transfers: '("gravel cycling" OR "UCI Gravel") (transfer OR signs OR contract OR joins OR team)'
  }
};

const RECENCY = {
  road: { general: "when:30d", transfers: "when:120d" },
  mtb: { general: "when:30d", transfers: "when:120d" },
  cyclocross: { general: "when:60d", transfers: "when:180d" },
  gravel: { general: "when:30d", transfers: "when:180d" }
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

function sourceDetails(block) {
  const match = block.match(/<source\b([^>]*)>([\s\S]*?)<\/source>/i);
  if (!match) return { source: "", sourceUrl: "" };
  const urlMatch = match[1].match(/\burl=["']([^"']+)["']/i);
  return { source: decodeXml(match[2]), sourceUrl: decodeXml(urlMatch?.[1]) };
}

function parseItems(xml) {
  return (xml.match(/<item>[\s\S]*?<\/item>/gi) || [])
    .map((block) => {
      const source = sourceDetails(block);
      return {
        title: tagValue(block, "title"),
        pubDate: tagValue(block, "pubDate"),
        link: tagValue(block, "link"),
        ...source
      };
    })
    .filter((item) => item.title && /^https?:\/\//.test(item.link))
    .slice(0, MAX_ITEMS_PER_QUERY);
}

function googleNewsFeed(query, locale = {}) {
  return `https://news.google.com/rss/search?${new URLSearchParams({
    q: query,
    hl: locale.hl || "en-GB",
    gl: locale.gl || "GB",
    ceid: locale.ceid || "GB:en"
  }).toString()}`;
}

function looksLikeTransfer(title) {
  return /transfer|rumou?r|\bsigns?\b|\bsigned\b|contract|\bjoins?\b|renewal|\bextends?\b|\bmoves?\b|\bdeal\b/i.test(title);
}

function approvedSource(sourceUrl, sources) {
  try {
    const hostname = new URL(sourceUrl).hostname.replace(/^www\./, "");
    return sources.find((source) => hostname === source.domain || hostname.endsWith(`.${source.domain}`)) || null;
  } catch (_) {
    return null;
  }
}

function sourceQuery(sources) {
  return sources.map((source) => `site:${source.domain}`).join(" OR ");
}

async function fetchFeed(discipline, query, recency, type = null, requestedSource = null) {
  const sources = SOURCES[discipline];
  const requestedSources = requestedSource ? [requestedSource] : sources;
  const curatedQuery = `(${query}) (${sourceQuery(requestedSources)}) ${recency}`;
  const response = await fetch(googleNewsFeed(curatedQuery, requestedSource?.locale), {
    headers: { "user-agent": "SEM-PLANO-Cycling-News/1.0" }
  });
  if (!response.ok) throw new Error(`${discipline}: Google News respondeu ${response.status}`);
  const items = parseItems(await response.text())
    .map((item) => ({ item, source: approvedSource(item.sourceUrl, requestedSources) }))
    .filter(({ source }) => source)
    .map(({ item, source }) => ({ ...item, source: source.name }));
  if (!items.length) throw new Error(`${discipline}: feed sem notícias`);
  return type ? items.filter((item) => looksLikeTransfer(item.title)).map((item) => ({ ...item, type })) : items;
}

const entries = await Promise.all(
  Object.entries(FEEDS).map(async ([discipline, queries]) => {
    const [generalGroups, transfers] = await Promise.all([
      Promise.all(SOURCES[discipline].map((source) =>
        fetchFeed(discipline, queries.general, RECENCY[discipline].general, null, source)
          .then((items) => items.slice(0, MAX_GENERAL_ITEMS_PER_SOURCE))
          .catch(() => [])
      )),
      fetchFeed(discipline, queries.transfers, RECENCY[discipline].transfers, "transfers").catch(() => [])
    ]);
    const general = generalGroups.flat();
    if (!general.length) throw new Error(`${discipline}: nenhuma fonte editorial respondeu com notícias`);
    const seen = new Set();
    const items = [...general, ...transfers].filter((item) => {
      const key = item.title.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_ITEMS_PER_DISCIPLINE);
    return [discipline, items];
  })
);

const payload = {
  updatedAt: new Date().toISOString(),
  disciplines: Object.fromEntries(entries)
};

await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Notícias atualizadas: ${entries.map(([key, items]) => `${key}=${items.length}`).join(", ")}`);
