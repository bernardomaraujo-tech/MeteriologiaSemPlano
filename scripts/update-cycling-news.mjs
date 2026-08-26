import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT_PATH = path.resolve(process.argv[2] || "cycling-news.json");
const MAX_ITEMS_PER_QUERY = 12;
const MAX_DIRECT_ITEMS_PER_FEED = 80;
const MAX_GENERAL_ITEMS_PER_SOURCE = 20;
const MAX_ITEMS_PER_DISCIPLINE = 60;
const MAX_GENERAL_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TRANSFER_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const SOURCES = {
  road: [
    { name: "Cyclingnews", domain: "cyclingnews.com", language: "en", feedUrl: "https://www.cyclingnews.com/feeds/tag/pro-cycling/" },
    { name: "Escape Collective", domain: "escapecollective.com", language: "en" },
    { name: "Cycling Weekly", domain: "cyclingweekly.com", language: "en", feedUrl: "https://www.cyclingweekly.com/feeds/tag/news" },
    { name: "VELO", domain: "velo.outsideonline.com", language: "en" },
    { name: "CyclingUpToDate", domain: "cyclinguptodate.com", language: "en", feedUrl: "https://cyclinguptodate.com/sitemap/news.xml" }
  ],
  mtb: [
    { name: "Pinkbike", domain: "pinkbike.com", language: "en", feedUrl: "https://www.pinkbike.com/pinkbike_xml_feed.php", exclusiveDiscipline: true },
    { name: "Vital MTB", domain: "vitalmtb.com", language: "en", feedUrl: "https://www.vitalmtb.com/rss.xml", exclusiveDiscipline: true },
    { name: "Escape Collective", domain: "escapecollective.com", language: "en" },
    { name: "VELO", domain: "velo.outsideonline.com", language: "en" },
    { name: "UCI", domain: "uci.org", language: "en" }
  ],
  cyclocross: [
    { name: "Cyclocross Magazine", domain: "cxmagazine.com", language: "en", feedUrl: "https://www.cxmagazine.com/feed/", exclusiveDiscipline: true },
    { name: "Cyclocross24", domain: "cyclocross24.com", language: "en", feedUrl: "https://cyclocross24.com/feed", exclusiveDiscipline: true },
    { name: "Cyclingnews", domain: "cyclingnews.com", language: "en", feedUrl: "https://www.cyclingnews.com/feeds.xml", feedMatch: /cyclocross|cyclo-cross/i },
    { name: "CyclingUpToDate", domain: "cyclinguptodate.com", language: "en", feedUrl: "https://cyclinguptodate.com/sitemap/news.xml", feedMatch: /cyclocross|cyclo-cross/i },
    { name: "UCI", domain: "uci.org", language: "en" }
  ],
  gravel: [
    { name: "Escape Collective", domain: "escapecollective.com", language: "en" },
    { name: "VELO", domain: "velo.outsideonline.com", language: "en" },
    { name: "Gravel Cyclist", domain: "gravelcyclist.com", language: "en", feedUrl: "https://www.gravelcyclist.com/feed/", exclusiveDiscipline: true },
    { name: "Cyclingnews", domain: "cyclingnews.com", language: "en", feedUrl: "https://www.cyclingnews.com/feeds.xml", feedMatch: /gravel/i },
    { name: "Cycling Weekly", domain: "cyclingweekly.com", language: "en", feedUrl: "https://www.cyclingweekly.com/feeds/tag/news", feedMatch: /gravel/i },
    { name: "BikeRadar", domain: "bikeradar.com", language: "en", feedUrl: "https://www.bikeradar.com/rss/news", feedMatch: /gravel/i }
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
  road: { general: "when:7d", transfers: "when:30d" },
  mtb: { general: "when:7d", transfers: "when:30d" },
  cyclocross: { general: "when:7d", transfers: "when:30d" },
  gravel: { general: "when:7d", transfers: "when:30d" }
};

const DISCIPLINE_MATCHERS = {
  mtb: /mountain bike|\bmtb\b|\bxco\b|\bxcc\b|cross-country|downhill|\bdhi\b|enduro|world champs.*val di sole|val di sole.*world champs/i,
  cyclocross: /cyclocross|cyclo-cross|\bcx\b/i,
  gravel: /\bgravel\b/i
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

function parseItems(xml, limit = MAX_ITEMS_PER_QUERY) {
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
    .slice(0, limit);
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

function hasAcceptableAge(item, maxAgeMs, now = Date.now()) {
  const publishedAt = Date.parse(item.pubDate);
  return Number.isFinite(publishedAt) && publishedAt <= now + 60 * 60 * 1000 && now - publishedAt <= maxAgeMs;
}

function matchesDiscipline(discipline, item, source) {
  if (discipline === "road" || source?.exclusiveDiscipline) return true;
  return DISCIPLINE_MATCHERS[discipline]?.test(`${item.title} ${item.link}`) || false;
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
    .filter(({ item, source }) => source && matchesDiscipline(discipline, item, source))
    .map(({ item, source }) => ({ ...item, source: source.name }))
    .filter((item) => hasAcceptableAge(item, type ? MAX_TRANSFER_AGE_MS : MAX_GENERAL_AGE_MS));
  if (!items.length) throw new Error(`${discipline}: feed sem notícias`);
  return type ? items.filter((item) => looksLikeTransfer(item.title)).map((item) => ({ ...item, type })) : items;
}

async function fetchDirectFeed(source) {
  const response = await fetch(source.feedUrl, {
    headers: { "user-agent": "SEM-PLANO-Cycling-News/1.0" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`${source.name}: feed direto respondeu ${response.status}`);
  const items = parseItems(await response.text(), MAX_DIRECT_ITEMS_PER_FEED)
    .filter((item) => !source.feedMatch || source.feedMatch.test(`${item.title} ${item.link}`))
    .filter((item) => hasAcceptableAge(item, MAX_GENERAL_AGE_MS))
    .map((item) => ({ ...item, source: source.name }));
  if (!items.length) throw new Error(`${source.name}: feed direto sem notícias recentes`);
  return items;
}

async function fetchGeneralSource(discipline, query, recency, source) {
  if (source.feedUrl) {
    try {
      return await fetchDirectFeed(source);
    } catch (_) {}
  }
  return fetchFeed(discipline, query, recency, null, source);
}

const entries = await Promise.all(
  Object.entries(FEEDS).map(async ([discipline, queries]) => {
    const [generalGroups, transfers] = await Promise.all([
      Promise.all(SOURCES[discipline].map((source) =>
        fetchGeneralSource(discipline, queries.general, RECENCY[discipline].general, source)
          .then((items) => items.slice(0, MAX_GENERAL_ITEMS_PER_SOURCE))
          .catch(() => [])
      )),
      fetchFeed(discipline, queries.transfers, RECENCY[discipline].transfers, "transfers").catch(() => [])
    ]);
    const general = generalGroups.flat();
    if (!general.length) throw new Error(`${discipline}: nenhuma fonte editorial respondeu com notícias`);
    const seen = new Set();
    const items = [...general, ...transfers]
      .filter((item) => {
        const key = item.title.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((first, second) => Date.parse(second.pubDate) - Date.parse(first.pubDate))
      .slice(0, MAX_ITEMS_PER_DISCIPLINE);
    return [discipline, items];
  })
);

const payload = {
  updatedAt: new Date().toISOString(),
  disciplines: Object.fromEntries(entries)
};

await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Notícias atualizadas: ${entries.map(([key, items]) => `${key}=${items.length}`).join(", ")}`);
