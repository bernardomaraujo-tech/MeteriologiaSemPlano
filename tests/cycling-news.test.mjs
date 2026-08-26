import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadCyclingHelpers() {
  const context = {
    console,
    URL,
    URLSearchParams,
    Headers,
    AbortController,
    DOMParser: class {},
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: {},
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener: () => {}
    },
    window: { addEventListener: () => {}, scrollTo: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  vm.runInContext(`${source}\nglobalThis.__cyclingHelpers = { buildCyclingNewsUrl, splitCyclingNewsTitle, inferCyclingNewsType, normaliseCyclingNewsItems, isRecentCyclingNews, cyclingEventStatus, CYCLING_DISCIPLINES };`, context);
  return context.__cyclingHelpers;
}

const helpers = loadCyclingHelpers();

test("constrói um feed temático por disciplina", () => {
  const url = helpers.buildCyclingNewsUrl("mtb");
  assert.match(url, /^https:\/\/api\.rss2json\.com\/v1\/api\.json\?rss_url=/);
  const feedUrl = decodeURIComponent(new URL(url).searchParams.get("rss_url"));
  assert.match(feedUrl, /news\.google\.com\/rss\/search/);
  assert.match(feedUrl, /mountain\+bike/);
  assert.match(feedUrl, /downhill/);
  assert.match(feedUrl, /site:pinkbike\.com/);
  assert.match(feedUrl, /site:vitalmtb\.com/);
  assert.match(feedUrl, /when:7d/);
  assert.match(feedUrl, /ceid=GB:en/);
});

test("separa o título da publicação de origem", () => {
  const result = helpers.splitCyclingNewsTitle("Van der Poel regressa ao MTB - Cyclingnews");
  assert.equal(result.title, "Van der Poel regressa ao MTB");
  assert.equal(result.source, "Cyclingnews");
});

test("classifica resultados, equipas, transferências e curiosidades", () => {
  assert.equal(helpers.inferCyclingNewsType("Vuelta GC standings after stage 3"), "results");
  assert.equal(helpers.inferCyclingNewsType("Rider returns after injury"), "teams");
  assert.equal(helpers.inferCyclingNewsType("Team confirms new contract signing"), "transfers");
  assert.equal(helpers.inferCyclingNewsType("A history of gravel bike design"), "curiosities");
});

test("normaliza, ordena e remove notícias repetidas", () => {
  const items = helpers.normaliseCyclingNewsItems([
    { title: "Notícia A - UCI", pubDate: "2026-08-20 10:00:00", link: "https://example.com/a" },
    { title: "Notícia A - UCI", pubDate: "2026-08-21 10:00:00", link: "https://example.com/a2" },
    { title: "Notícia B - Cyclingnews", pubDate: "2026-08-22 10:00:00", link: "https://example.com/b" }
  ], "teams");
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Notícia B");
  assert.equal(items[0].type, "teams");
});

test("preserva a publicação indicada pelos dados agregados", () => {
  const [item] = helpers.normaliseCyclingNewsItems([
    { title: "Uma notícia - Google News", source: "Escape Collective", pubDate: "2026-08-22 10:00:00", link: "https://example.com/a" }
  ]);
  assert.equal(item.source, "Escape Collective");
});

test("distingue notícias das últimas 24 horas", () => {
  const now = new Date("2026-08-26T10:00:00Z").getTime();
  assert.equal(helpers.isRecentCyclingNews("2026-08-26T03:00:00Z", now), true);
  assert.equal(helpers.isRecentCyclingNews("2026-08-25T10:00:00Z", now), true);
  assert.equal(helpers.isRecentCyclingNews("2026-08-25T09:59:59Z", now), false);
  assert.equal(helpers.isRecentCyclingNews("2018-01-01T00:00:00Z", now), false);
});

test("identifica eventos terminados, a decorrer e futuros", () => {
  const event = { start: "2026-08-22", end: "2026-09-13" };
  assert.equal(helpers.cyclingEventStatus(event, new Date("2026-08-20T12:00:00")), "next");
  assert.equal(helpers.cyclingEventStatus(event, new Date("2026-08-24T12:00:00")), "live");
  assert.equal(helpers.cyclingEventStatus(event, new Date("2026-09-14T12:00:00")), "past");
});

test("disponibiliza calendário e ligações oficiais nas quatro disciplinas", () => {
  assert.deepEqual(Object.keys(helpers.CYCLING_DISCIPLINES), ["road", "mtb", "cyclocross", "gravel"]);
  for (const discipline of Object.values(helpers.CYCLING_DISCIPLINES)) {
    assert.ok(discipline.events.length >= 4);
    assert.ok(discipline.sources.length >= 5);
    assert.match(discipline.calendarUrl, /^https:\/\//);
    assert.match(discipline.rankingsUrl, /^https:\/\//);
    assert.match(discipline.statsUrl, /^https:\/\//);
    for (const source of discipline.sources) {
      assert.match(source.domain, /^[a-z0-9.-]+$/);
      assert.match(source.url, /^https:\/\//);
      assert.equal(source.language, "en");
    }
    for (const event of discipline.events) {
      assert.match(event.start, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(event.url, /^https:\/\//);
    }
  }
});

test("usa exclusivamente fontes editoriais em inglês", () => {
  const sources = Object.values(helpers.CYCLING_DISCIPLINES).flatMap((discipline) => discipline.sources);
  assert.ok(sources.length > 0);
  assert.ok(sources.every((source) => source.language === "en"));
  assert.ok(!sources.some((source) => source.domain === "wielerflits.nl"));

  for (const discipline of Object.keys(helpers.CYCLING_DISCIPLINES)) {
    const feedUrl = decodeURIComponent(new URL(helpers.buildCyclingNewsUrl(discipline)).searchParams.get("rss_url"));
    assert.match(feedUrl, /hl=en-GB/);
    assert.match(feedUrl, /ceid=GB:en/);
    assert.doesNotMatch(feedUrl, /wielerflits\.nl/);
  }
});
