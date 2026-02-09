/* app.js */
const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

// Preferência: modelos HARMONIE-AROME (Europa) via Open-Meteo
const PREFERRED_MODELS = [
  "knmi_harmonie_arome_europe",
  "dmi_harmonie_arome_europe"
];

const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },

  { id:"algueirao", name:"Algueirão", lat:38.7936, lon:-9.3417 },
  { id:"amadora", name:"Amadora", lat:38.7569, lon:-9.2308 },
  { id:"carcavelos", name:"Carcavelos", lat:38.6910, lon:-9.3317 },
  { id:"cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },
  { id:"columbeira", name:"Columbeira", lat:39.3439, lon:-9.1869 },
  { id:"culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 },
  { id:"estoril", name:"Estoril", lat:38.7057, lon:-9.3976 },
  { id:"guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },
  { id:"peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
  { id:"sdr", name:"São Domingos de Rana", lat:38.7019, lon:-9.3389 },
  { id:"sintra", name:"Sintra", lat:38.8029, lon:-9.3817 },
  { id:"tocha", name:"Praia da Tocha", lat:40.3174, lon:-8.7984 }
];

const $ = (id) => document.getElementById(id);
const setText = (el, txt) => { if (el) el.textContent = txt; };
const setHTML = (el, html) => { if (el) el.innerHTML = html; };

const els = {
  updated: $("updated"),
  select: $("locationSelect"),
  source: $("source"),

  heroLoc: $("heroLoc"),
  heroTemp: $("heroTemp"),
  heroMeta: $("heroMeta"),

  nowWind: $("nowWind"),
  nowGust: $("nowGust"),
  nowDirTxt: $("nowDirTxt"),
  nowRain: $("nowRain"),
  nowPop: $("nowPop"),

  dirNeedle: $("dirNeedle"),

  dressBike: $("dressBike"),
  dressRun: $("dressRun"),
  dressWalk: $("dressWalk"),

  alerts: $("alerts"),
  table8: $("table8"),
  table48: $("table48"),
  toggle48: $("toggle48"),
  wrap48: $("wrap48"),

  bestWindow: $("bestWindow"),
  windSuggestion: $("windSuggestion"),

  windyLink: $("windyLink"),
};

function fmtKmh(x){ return `${Math.round(x ?? 0)} km/h`; }
function fmtMm(x){ return `${(Math.round(((x ?? 0) * 10)) / 10).toFixed(1)} mm`; }
function fmtPct(x){ return `${Math.round(x ?? 0)}%`; }

function windDirText(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const idx = Math.round((((deg ?? 0) % 360) / 45))
