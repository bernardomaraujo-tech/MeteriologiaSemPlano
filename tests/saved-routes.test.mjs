import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadSavedRouteHelpers() {
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
  vm.runInContext(`${source}\nglobalThis.__savedRouteHelpers = { normaliseRouteName, createSavedRouteRecord, canSaveNewRoute, ROUTE_MAX_SAVED };`, context);
  return context.__savedRouteHelpers;
}

const helpers = loadSavedRouteHelpers();

test("permite guardar no máximo cinco rotas novas", () => {
  const routes = Array.from({ length: 5 }, (_, index) => ({ id: `route-${index}` }));
  assert.equal(helpers.ROUTE_MAX_SAVED, 5);
  assert.equal(helpers.canSaveNewRoute(routes), false);
  assert.equal(helpers.canSaveNewRoute(routes, "route-2"), true);
  assert.equal(helpers.canSaveNewRoute(routes.slice(0, 4)), true);
});

test("limpa e limita o nome atribuído à rota", () => {
  assert.equal(helpers.normaliseRouteName("  Volta   à Serra  "), "Volta à Serra");
  assert.equal(helpers.normaliseRouteName("", "Sintra Gravel"), "Sintra Gravel");
  assert.equal(helpers.normaliseRouteName("x".repeat(80)).length, 60);
});

test("ao atualizar uma rota preserva o identificador e a data de criação", () => {
  const record = helpers.createSavedRouteRecord({
    id: "route-1",
    name: "  Rota de domingo  ",
    gpxText: "<gpx></gpx>",
    distanceKm: 74.25,
    elevationGain: 840,
    createdAt: "2026-09-10T08:00:00.000Z"
  }, "2026-09-11T09:00:00.000Z");

  assert.equal(record.id, "route-1");
  assert.equal(record.name, "Rota de domingo");
  assert.equal(record.createdAt, "2026-09-10T08:00:00.000Z");
  assert.equal(record.updatedAt, "2026-09-11T09:00:00.000Z");
  assert.equal(record.distanceKm, 74.25);
  assert.equal(record.elevationGain, 840);
});

test("a interface expõe nome, lista, gravação e eliminação de rotas", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="routeCustomName"/);
  assert.match(html, /id="savedRoutesList"/);
  assert.match(html, /id="savedRoutesCount">0\/5/);
  assert.match(html, /id="routeSave"/);
  assert.match(html, /symbol id="i-trash"/);
  const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(source, /data-delete-saved-route/);
});
