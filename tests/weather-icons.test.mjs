import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadWeatherHelpers() {
  const tableBody = { innerHTML: "" };
  const forecastTable = { querySelector: (selector) => selector === "tbody" ? tableBody : null };
  const context = {
    console,
    URL,
    URLSearchParams,
    Headers,
    AbortController,
    DOMParser: class {},
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: {},
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => id === "forecast48Table" ? forecastTable : null,
      addEventListener: () => {}
    },
    window: { addEventListener: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  vm.runInContext(`${source}\nglobalThis.__weatherHelpers = { weatherIconDetails, renderForecast48 };`, context);
  return { ...context.__weatherHelpers, tableBody };
}

const { weatherIconDetails, renderForecast48, tableBody } = loadWeatherHelpers();

test("distingue céu limpo de dia e de noite", () => {
  assert.equal(weatherIconDetails(0, 1).icon, "sun");
  assert.equal(weatherIconDetails(0, 0).icon, "moon");
});

test("associa os principais grupos WMO a ícones meteorológicos", () => {
  assert.equal(weatherIconDetails(2, 1).icon, "partly");
  assert.equal(weatherIconDetails(3, 1).icon, "cloud");
  assert.equal(weatherIconDetails(45, 1).icon, "fog");
  assert.equal(weatherIconDetails(53, 1).icon, "drizzle");
  assert.equal(weatherIconDetails(65, 1).icon, "rain");
  assert.equal(weatherIconDetails(75, 1).icon, "snow");
  assert.equal(weatherIconDetails(95, 1).icon, "storm");
});

test("mantém uma descrição textual acessível em cada ícone", () => {
  assert.equal(weatherIconDetails(61, 1).label, "Chuva");
  assert.equal(weatherIconDetails(0, 0).label, "Céu limpo");
});

test("apresenta um ícone representativo em cada uma das 48 linhas", () => {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const times = Array.from({ length: 60 }, (_, index) => new Date(start.getTime() + index * 3600000).toISOString());
  const repeat = (value) => Array(60).fill(value);
  renderForecast48({ hourly: {
    time: times,
    temperature_2m: repeat(18),
    apparent_temperature: repeat(17),
    relative_humidity_2m: repeat(65),
    precipitation: repeat(0),
    precipitation_probability: repeat(5),
    weather_code: repeat(2),
    wind_speed_10m: repeat(14),
    wind_gusts_10m: repeat(24),
    wind_direction_10m: repeat(45),
    uv_index: repeat(3),
    is_day: repeat(1)
  }});
  assert.equal((tableBody.innerHTML.match(/hourly-weather-icon/g) || []).length, 48);
  assert.equal((tableBody.innerHTML.match(/aria-label="Céu com nuvens"/g) || []).length, 48);
});
