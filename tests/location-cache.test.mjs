import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const LOCATION_KEY = "semPlanoMeteoLocationV2";
const DEVICE_KEY = "semPlanoMeteoDeviceLocationV1";

function loadLocationHelpers({ cachedLocation = null, nextPosition = null } = {}) {
  const storage = new Map([[LOCATION_KEY, JSON.stringify({ id: "device_location", name: "Localização atual" })]]);
  if (cachedLocation) storage.set(DEVICE_KEY, JSON.stringify(cachedLocation));
  let positionRequests = 0;
  const context = {
    console,
    URL,
    URLSearchParams,
    Headers,
    AbortController,
    DOMParser: class {},
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    navigator: {
      geolocation: {
        getCurrentPosition(resolve, reject) {
          positionRequests += 1;
          if (!nextPosition) {
            reject(new Error("Sem posição"));
            return;
          }
          resolve({ coords: nextPosition });
        }
      }
    },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener: () => {}
    },
    window: { addEventListener: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  vm.runInContext(`${source}\nglobalThis.__locationHelpers = { resolveActiveLocation, loadCachedDeviceLocation };`, context);
  return {
    ...context.__locationHelpers,
    storage,
    getPositionRequests: () => positionRequests
  };
}

test("reutiliza a última posição guardada sem voltar a pedir geolocalização", async () => {
  const helpers = loadLocationHelpers({
    cachedLocation: { lat: 38.733, lon: -9.41, accuracy: 20, capturedAt: "2026-08-24T10:00:00.000Z" }
  });
  const location = await helpers.resolveActiveLocation();
  assert.equal(helpers.getPositionRequests(), 0);
  assert.equal(location.lat, 38.733);
  assert.equal(location.lon, -9.41);
  assert.equal(location.isCachedLocation, true);
});

test("atualiza o GPS e substitui a posição guardada quando o utilizador o pede", async () => {
  const helpers = loadLocationHelpers({
    cachedLocation: { lat: 38.733, lon: -9.41, accuracy: 20, capturedAt: "2026-08-24T10:00:00.000Z" },
    nextPosition: { latitude: 38.71, longitude: -9.42, accuracy: 8 }
  });
  const location = await helpers.resolveActiveLocation(true);
  const stored = JSON.parse(helpers.storage.get(DEVICE_KEY));
  assert.equal(helpers.getPositionRequests(), 1);
  assert.equal(location.lat, 38.71);
  assert.equal(location.lon, -9.42);
  assert.equal(stored.lat, 38.71);
  assert.equal(stored.accuracy, 8);
});

test("na primeira utilização pede a localização e guarda-a para visitas futuras", async () => {
  const helpers = loadLocationHelpers({
    nextPosition: { latitude: 38.70, longitude: -9.40, accuracy: 12 }
  });
  const location = await helpers.resolveActiveLocation();
  assert.equal(helpers.getPositionRequests(), 1);
  assert.equal(location.isDeviceLocation, true);
  assert.ok(helpers.storage.has(DEVICE_KEY));
});
