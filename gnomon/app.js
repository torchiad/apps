import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import SunCalc from 'suncalc';

const $ = id => document.getElementById(id);

// ---------- constants & small helpers ----------
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const norm360 = x => ((x % 360) + 360) % 360;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const POLE_HEIGHT_M = 10; // reference gnomon height used for shadow length

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function compassLabel(bearingDeg) {
  return COMPASS[Math.round(norm360(bearingDeg) / 45) % 8];
}

function fmtTime(date) {
  if (!date || isNaN(date.getTime())) return '—';
  return date.toISOString().slice(11, 16) + ' UTC';
}

function fmtDuration(ms) {
  if (!isFinite(ms) || ms < 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function fmtLength(m) {
  if (!isFinite(m)) return '> 200 km';
  if (m > 200000) return '> 200 km';
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${m.toFixed(1)} m`;
}

// destination point given start lat/lon, bearing (deg) and distance (m)
function destinationPoint(lat, lon, bearingDeg, distanceM) {
  const R = 6371000;
  const delta = distanceM / R;
  const theta = bearingDeg * D2R;
  const phi1 = lat * D2R, lam1 = lon * D2R;
  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta));
  const lam2 = lam1 + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
    Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
  );
  return [phi2 * R2D, ((lam2 * R2D + 540) % 360) - 180];
}

// ---------- solar geometry ----------
// low-precision solar position (subsolar point) — good to ~0.01deg 1950-2050
function subsolarPoint(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const d = jd - 2451545.0;
  const L = norm360(280.460 + 0.9856474 * d);
  const g = norm360(357.528 + 0.9856003 * d) * D2R;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const epsilon = (23.439 - 0.0000004 * d) * D2R;
  const alpha = norm360(Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) * R2D);
  const delta = Math.asin(Math.sin(epsilon) * Math.sin(lambda)); // radians
  const gmst = norm360(280.46061837 + 360.98564736629 * d);
  const lon = ((alpha - gmst + 540) % 360) - 180;
  return { lat: delta * R2D, lon, deltaRad: delta };
}

// night-side polygon for the map, using the subsolar point above
function terminatorPolygon(date) {
  const sub = subsolarPoint(date);
  const delta = sub.deltaRad;
  const pts = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const H = (lon - sub.lon) * D2R;
    let lat;
    if (Math.abs(Math.tan(delta)) < 1e-9) {
      lat = -Math.sign(Math.cos(H) || 1) * 89.9;
    } else {
      lat = Math.atan(-Math.cos(H) / Math.tan(delta)) * R2D;
    }
    pts.push([lat, lon]);
  }
  if (sub.lat >= 0) { pts.push([-90, 180]); pts.push([-90, -180]); }
  else { pts.push([90, 180]); pts.push([90, -180]); }
  return { pts, sub };
}

// ---------- sky colour ----------
const SKY_STOPS = [
  [-90, [8, 10, 30]],
  [-10, [16, 20, 55]],
  [-4, [80, 55, 95]],
  [0, [235, 140, 90]],
  [8, [180, 205, 230]],
  [20, [126, 200, 227]],
  [90, [90, 175, 220]],
];
function lerp(a, b, t) { return a + (b - a) * t; }
function skyColor(altDeg) {
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const [a0, c0] = SKY_STOPS[i], [a1, c1] = SKY_STOPS[i + 1];
    if (altDeg >= a0 && altDeg <= a1) {
      const t = (altDeg - a0) / (a1 - a0);
      const c = c0.map((v, i2) => Math.round(lerp(v, c1[i2], t)));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return altDeg < SKY_STOPS[0][0] ? `rgb(${SKY_STOPS[0][1].join(',')})` : `rgb(${SKY_STOPS.at(-1)[1].join(',')})`;
}

// ---------- state ----------
const state = { lat: 51.5074, lon: -0.1278, playing: false, playTimer: null, sunAltRad: 0, shadowBearingDeg: 0 };

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// convex hull (monotone chain) over [x,y] points
function convexHull(pts) {
  const points = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (points.length <= 2) return points;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// shadow a building casts: sweep its footprint along the shadow vector, take the hull
function buildingShadowPolygon(footprint, shadowBearingDeg, shadowLenM) {
  if (!(shadowLenM > 0) || !isFinite(shadowLenM)) return null;
  const translated = footprint.map(([lat, lon]) => destinationPoint(lat, lon, shadowBearingDeg, shadowLenM));
  const combined = footprint.concat(translated).map(([lat, lon]) => [lon, lat]);
  const hull = convexHull(combined);
  if (hull.length < 3) return null;
  return hull.map(([lon, lat]) => [lat, lon]);
}

function buildingHeight(tags) {
  const h = parseFloat(tags.height ?? tags['building:height']);
  if (!isNaN(h)) return h;
  const levels = parseFloat(tags['building:levels'] ?? tags.levels);
  if (!isNaN(levels)) return levels * 3 + 1;
  return Number(assumedHeightInput.value) || 6;
}

// ---------- map setup ----------
const map = L.map('map', { worldCopyJump: true }).setView([state.lat, state.lon], 17);

const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
});
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  maxZoom: 19,
}).addTo(map);
L.control.layers({ Satellite: satelliteLayer, Streets: streetLayer }, null, { position: 'topright' }).addTo(map);

const nightLayer = L.polygon([], { stroke: false, fillColor: '#10142b', fillOpacity: 0.38, interactive: false }).addTo(map);
const buildingsLayer = L.layerGroup().addTo(map);
const shadowsLayer = L.layerGroup().addTo(map);

const pinIcon = L.divIcon({ className: '', html: '<div class="gnomon-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
const marker = L.marker([state.lat, state.lon], { icon: pinIcon, draggable: true }).addTo(map);

const shadowLine = L.polyline([], { color: '#1a1c2c', weight: 3 }).addTo(map);
const sunDot = L.circleMarker([0, 0], { radius: 5, color: '#1a1c2c', weight: 1.5, fillColor: '#ffd158', fillOpacity: 1 }).addTo(map);

marker.on('dragend', () => {
  const p = marker.getLatLng();
  state.lat = p.lat; state.lon = ((p.lng + 540) % 360) - 180;
  update();
});
map.on('click', e => {
  state.lat = e.latlng.lat; state.lon = ((e.latlng.lng + 540) % 360) - 180;
  marker.setLatLng(e.latlng);
  update();
});

// ---------- real building shadows (OpenStreetMap footprints via Overpass) ----------
// The public Overpass API is a free, best-effort service that's frequently slow,
// rate-limited, or briefly down — so we try a few known mirrors before giving up.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

async function fetchOverpass(query, outerSignal) {
  let lastErr = new Error('no Overpass endpoints available');
  for (const url of OVERPASS_ENDPOINTS) {
    if (outerSignal.aborted) throw new DOMException('aborted', 'AbortError');
    const timeoutController = new AbortController();
    const onOuterAbort = () => timeoutController.abort();
    outerSignal.addEventListener('abort', onOuterAbort);
    const timeoutId = setTimeout(() => timeoutController.abort(), 10000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        signal: timeoutController.signal,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (outerSignal.aborted) throw new DOMException('aborted', 'AbortError');
      lastErr = e;
    } finally {
      clearTimeout(timeoutId);
      outerSignal.removeEventListener('abort', onOuterAbort);
    }
  }
  throw lastErr;
}

const buildingStatus = $('building-status');
const assumedHeightInput = $('assumed-height');
let buildingsData = [];
let buildingsLoadedForView = false;
let lastBuildingsKey = null;
let buildingsAbort = null;

function drawBuildingFootprints() {
  buildingsLayer.clearLayers();
  for (const b of buildingsData) {
    L.polygon(b.footprint, { color: '#ffd158', weight: 1.2, opacity: 0.9, fill: false, interactive: false }).addTo(buildingsLayer);
  }
}

function updateBuildingStatusText() {
  if (!buildingsLoadedForView) return;
  if (!buildingsData.length) {
    buildingStatus.textContent = 'No mapped buildings found in this view';
    return;
  }
  const nightHint = state.sunAltRad <= 0 ? ' — sun is below the horizon here right now, so no shadows' : '';
  buildingStatus.textContent = `${buildingsData.length} building${buildingsData.length === 1 ? '' : 's'} loaded${nightHint}`;
}

function renderBuildingShadows() {
  shadowsLayer.clearLayers();
  updateBuildingStatusText();
  if (state.sunAltRad <= 0) return;
  for (const b of buildingsData) {
    const h = buildingHeight(b.tags);
    const len = h / Math.tan(state.sunAltRad);
    const poly = buildingShadowPolygon(b.footprint, state.shadowBearingDeg, len);
    if (poly) L.polygon(poly, { stroke: false, fillColor: '#000', fillOpacity: 0.42, interactive: false }).addTo(shadowsLayer);
  }
}

async function loadBuildingsForView() {
  const zoom = map.getZoom();
  if (zoom < 16) {
    buildingsData = [];
    buildingsLoadedForView = false;
    lastBuildingsKey = null;
    buildingsLayer.clearLayers();
    shadowsLayer.clearLayers();
    buildingStatus.textContent = 'Zoom in to street level to see building shadows';
    return;
  }
  const b = map.getBounds();
  const south = b.getSouth(), west = b.getWest(), north = b.getNorth(), east = b.getEast();
  if ((north - south) * (east - west) > 0.01) {
    buildingStatus.textContent = 'Zoom in further to load buildings';
    return;
  }
  const key = [south, west, north, east].map(n => n.toFixed(5)).join(',');
  if (key === lastBuildingsKey) return;
  lastBuildingsKey = key;

  if (buildingsAbort) buildingsAbort.abort();
  buildingsAbort = new AbortController();
  buildingStatus.textContent = 'Loading buildings…';
  try {
    const query = `[out:json][timeout:20];way["building"](${south},${west},${north},${east});out geom;`;
    const json = await fetchOverpass(query, buildingsAbort.signal);
    buildingsData = (json.elements || [])
      .filter(el => el.type === 'way' && el.geometry && el.geometry.length >= 3)
      .map(el => ({ id: el.id, footprint: el.geometry.map(pt => [pt.lat, pt.lon]), tags: el.tags || {} }));
    buildingsLoadedForView = true;
    drawBuildingFootprints();
    renderBuildingShadows();
  } catch (e) {
    if (e.name === 'AbortError') return;
    buildingsLoadedForView = false;
    buildingStatus.textContent = 'Could not reach building data — try panning to retry';
  }
}

map.on('moveend', debounce(loadBuildingsForView, 600));
assumedHeightInput.addEventListener('input', renderBuildingShadows);

// ---------- controls ----------
const dateInput = $('date'), timeSlider = $('time'), timeOut = $('time-out'), coordsEl = $('coords');

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
dateInput.value = todayISO();
// default to solar noon at the pin (not "now") so a fresh visit reliably shows a shadow —
// "now" is often nighttime wherever the default pin happens to be.
{
  const noon = SunCalc.getTimes(new Date(), state.lat, state.lon).solarNoon;
  timeSlider.value = (noon && !isNaN(noon.getTime()))
    ? noon.getUTCHours() * 60 + noon.getUTCMinutes()
    : new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
}

function getCurrentDateTime() {
  const [y, m, d] = dateInput.value.split('-').map(Number);
  const mins = Number(timeSlider.value);
  return new Date(Date.UTC(y, m - 1, d, 0, mins));
}

$('btn-now').addEventListener('click', () => {
  const now = new Date();
  dateInput.value = now.toISOString().slice(0, 10);
  timeSlider.value = now.getUTCHours() * 60 + now.getUTCMinutes();
  update();
});

$('btn-midday').addEventListener('click', () => {
  const dt = getCurrentDateTime();
  const noon = SunCalc.getTimes(dt, state.lat, state.lon).solarNoon;
  if (noon && !isNaN(noon.getTime())) {
    timeSlider.value = noon.getUTCHours() * 60 + noon.getUTCMinutes();
    update();
  }
});

dateInput.addEventListener('change', update);
timeSlider.addEventListener('input', update);

// play/pause
const btnPlay = $('btn-play'), iconPlay = $('icon-play'), iconPause = $('icon-pause'), playLabel = $('play-label');
btnPlay.addEventListener('click', () => {
  state.playing = !state.playing;
  iconPlay.classList.toggle('is-hidden', state.playing);
  iconPause.classList.toggle('is-hidden', !state.playing);
  playLabel.textContent = state.playing ? 'Pause' : 'Play';
  if (state.playing) {
    state.playTimer = setInterval(() => {
      let v = Number(timeSlider.value) + 5;
      if (v > 1439) v = 0;
      timeSlider.value = v;
      update();
    }, 90);
  } else {
    clearInterval(state.playTimer);
  }
});

// geolocation
$('btn-geo').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    state.lat = pos.coords.latitude; state.lon = pos.coords.longitude;
    marker.setLatLng([state.lat, state.lon]);
    map.flyTo([state.lat, state.lon], 10);
    update();
  }, () => {}, { timeout: 8000 });
});

// search (Nominatim)
const searchInput = $('search'), searchResults = $('search-results');
let searchDebounce = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();
  if (q.length < 3) { searchResults.hidden = true; searchResults.innerHTML = ''; return; }
  searchDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`);
      const rows = await res.json();
      if (!rows.length) { searchResults.innerHTML = '<button disabled>No matches</button>'; searchResults.hidden = false; return; }
      searchResults.innerHTML = rows.map((r, i) =>
        `<button data-i="${i}">${r.display_name}</button>`
      ).join('');
      searchResults.hidden = false;
      searchResults.querySelectorAll('button[data-i]').forEach(btn => {
        btn.addEventListener('click', () => {
          const r = rows[Number(btn.dataset.i)];
          state.lat = Number(r.lat); state.lon = Number(r.lon);
          marker.setLatLng([state.lat, state.lon]);
          map.flyTo([state.lat, state.lon], 9);
          searchResults.hidden = true;
          searchInput.value = r.display_name;
          update();
        });
      });
    } catch (e) { searchResults.hidden = true; }
  }, 400);
});
document.addEventListener('click', e => {
  if (!searchResults.contains(e.target) && e.target !== searchInput) searchResults.hidden = true;
});

// ---------- scene rendering ----------
const STARS = Array.from({ length: 28 }, () => [Math.random() * 300, Math.random() * 95]);
function renderScene(altDeg, sunBearingDeg, shadowLenM, isDay) {
  const w = 300, h = 170, horizonY = 118;
  const sky = skyColor(altDeg);
  const sunX = (norm360(sunBearingDeg) / 360) * w;
  const sunY = clamp(horizonY - (altDeg / 90) * 105, 8, horizonY + 30);
  const showDisc = altDeg > -7;
  const discOpacity = clamp((altDeg + 7) / 10, 0.15, 1);
  const nightAmount = clamp(-altDeg / 15, 0, 1);

  const gx = 150, gBaseY = horizonY;
  const poleH = 42;
  const shadowSide = sunX >= gx ? -1 : 1;
  const pxLen = altDeg > 0 ? clamp(6 + 118 * (shadowLenM / (shadowLenM + 18)), 6, 124) : 0;
  const shadowX2 = gx + shadowSide * pxLen;

  const stars = nightAmount > 0.15
    ? STARS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${(x * 7 % 3) * 0.3 + 0.5}" fill="#fff" opacity="${nightAmount * 0.8}"/>`).join('')
    : '';

  const sunSVG = showDisc
    ? `<circle cx="${sunX}" cy="${sunY}" r="10" fill="${altDeg > 0 ? '#ffd158' : '#ff9a5a'}" opacity="${discOpacity}"/>
       <circle cx="${sunX}" cy="${sunY}" r="16" fill="${altDeg > 0 ? '#ffd158' : '#ff9a5a'}" opacity="${discOpacity * 0.25}"/>`
    : '';

  const moonSVG = nightAmount > 0.5
    ? `<circle cx="${w - (sunX % w)}" cy="26" r="8" fill="#eef1f8" opacity="${(nightAmount - 0.5) * 1.6}"/>`
    : '';

  const shadowSVG = pxLen > 0
    ? `<ellipse cx="${(gx + shadowX2) / 2}" cy="${gBaseY + 2}" rx="${Math.abs(shadowX2 - gx) / 2 + 3}" ry="3" fill="#000" opacity="0.35"/>`
    : '';

  document.getElementById('scene').innerHTML = `
    <rect width="${w}" height="${horizonY}" fill="${sky}"/>
    ${stars}
    ${moonSVG}
    <rect y="${horizonY}" width="${w}" height="${h - horizonY}" fill="#3a3226"/>
    ${sunSVG}
    ${shadowSVG}
    <line x1="${gx}" y1="${gBaseY}" x2="${gx}" y2="${gBaseY - poleH}" stroke="#1a1c2c" stroke-width="4" stroke-linecap="round"/>
    <circle cx="${gx}" cy="${gBaseY - poleH - 4}" r="4.5" fill="#1a1c2c"/>
  `;

  $('scene-caption').textContent = isDay
    ? `${Math.round(altDeg)}° above horizon`
    : (altDeg > -7 ? 'Twilight' : 'Night');
}

// ---------- main update ----------
function update() {
  const dt = getCurrentDateTime();
  timeOut.textContent = fmtTime(dt);
  coordsEl.textContent = `${Math.abs(state.lat).toFixed(4)}°${state.lat >= 0 ? 'N' : 'S'}, ${Math.abs(state.lon).toFixed(4)}°${state.lon >= 0 ? 'E' : 'W'}`;

  // day/night terminator
  const { pts, sub } = terminatorPolygon(dt);
  nightLayer.setLatLngs(pts);
  sunDot.setLatLng([sub.lat, sub.lon]);

  // sun position at the pin
  const pos = SunCalc.getPosition(dt, state.lat, state.lon);
  const altDeg = pos.altitude * R2D;
  const sunBearingDeg = norm360(pos.azimuth * R2D + 180); // SunCalc az: 0=S measured toward W
  const shadowBearingDeg = norm360(pos.azimuth * R2D);
  const isDay = altDeg > 0;
  const shadowLenM = isDay ? POLE_HEIGHT_M / Math.tan(pos.altitude) : Infinity;
  state.sunAltRad = pos.altitude;
  state.shadowBearingDeg = shadowBearingDeg;
  renderBuildingShadows();

  $('ro-alt').textContent = `${altDeg.toFixed(1)}°${isDay ? '' : ' (below horizon)'}`;
  $('ro-az').textContent = `${sunBearingDeg.toFixed(0)}° ${compassLabel(sunBearingDeg)}`;
  if (isDay) {
    $('ro-shadow-dir').textContent = `${shadowBearingDeg.toFixed(0)}° ${compassLabel(shadowBearingDeg)}`;
    $('ro-shadow-len').textContent = fmtLength(shadowLenM);
    const tip = destinationPoint(state.lat, state.lon, shadowBearingDeg, Math.min(shadowLenM, 200000));
    shadowLine.setLatLngs([[state.lat, state.lon], tip]);
  } else {
    $('ro-shadow-dir').textContent = 'no shadow (night)';
    $('ro-shadow-len').textContent = '—';
    shadowLine.setLatLngs([]);
  }

  // sunrise/noon/sunset for this date & place
  const times = SunCalc.getTimes(dt, state.lat, state.lon);
  const noonAlt = SunCalc.getPosition(times.solarNoon, state.lat, state.lon).altitude * R2D;
  $('ro-noon').textContent = fmtTime(times.solarNoon);
  if (isNaN(times.sunrise?.getTime())) {
    const msg = noonAlt > 0 ? 'sun doesn’t set' : 'sun doesn’t rise';
    $('ro-sunrise').textContent = msg;
    $('ro-sunset').textContent = msg;
    $('ro-daylen').textContent = noonAlt > 0 ? '24h 00m' : '0h 00m';
  } else {
    $('ro-sunrise').textContent = fmtTime(times.sunrise);
    $('ro-sunset').textContent = fmtTime(times.sunset);
    $('ro-daylen').textContent = fmtDuration(times.sunset - times.sunrise);
  }

  renderScene(altDeg, sunBearingDeg, isDay ? shadowLenM : Infinity, isDay);
}

update();
loadBuildingsForView();
