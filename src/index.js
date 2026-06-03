// HUB utilities
function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtUses(n) {
    if (!n) return '0';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
    return String(n);
}

function pop(h) {
    return `oklch(0.82 0.17 ${h})`;
}

function popSoft(h) {
    return `oklch(0.93 0.09 ${h})`;
}

// Generates a bold geometric SVG thumbnail as a data URI.
// pattern: 'dots' | 'stripes' | 'arch' | 'grid' | 'waves' | 'blocks'
function thumbBold(h, pattern) {
    const bg = `oklch(0.78 0.17 ${h})`;
    const dark = `oklch(0.22 0.08 ${h})`;
    const light = `oklch(0.97 0.03 ${h})`;
    const mid = `oklch(0.60 0.15 ${h})`;

    let body = '';

    switch (pattern) {
        case 'stripes': {
            const offsets = [-40, -10, 20, 50, 80, 110, 140];
            const lines = offsets.map(x =>
                `<line x1="${x}" y1="110" x2="${x + 120}" y2="-10" stroke="${dark}" stroke-width="18" opacity="0.22"/>`
            ).join('');
            body = `
        <rect width="160" height="100" fill="${bg}"/>
        ${lines}
        <circle cx="80" cy="50" r="26" fill="${light}" stroke="${dark}" stroke-width="4"/>
        <circle cx="80" cy="50" r="12" fill="${dark}"/>`;
            break;
        }
        case 'dots': {
            const dots = [];
            for (let x = 10; x < 160; x += 20)
                for (let y = 10; y < 100; y += 20)
                    dots.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="${dark}" opacity="0.2"/>`);
            body = `
        <rect width="160" height="100" fill="${bg}"/>
        ${dots.join('')}
        <rect x="46" y="24" width="68" height="52" rx="9" fill="${light}" stroke="${dark}" stroke-width="3.5"/>
        <rect x="56" y="38" width="48" height="6" rx="3" fill="${dark}"/>
        <rect x="56" y="50" width="32" height="6" rx="3" fill="${dark}" opacity="0.4"/>`;
            break;
        }
        case 'arch':
            body = `
        <rect width="160" height="100" fill="${bg}"/>
        <path d="M160,100 Q160,0 80,0 Q0,0 0,100" fill="${mid}" opacity="0.4"/>
        <path d="M140,100 Q140,20 80,20 Q20,20 20,100" fill="${light}" opacity="0.5"/>
        <path d="M120,100 Q120,40 80,40 Q40,40 40,100" fill="${dark}" opacity="0.12"/>
        <rect x="60" y="44" width="40" height="30" rx="6" fill="${light}" stroke="${dark}" stroke-width="3"/>`;
            break;
        case 'grid': {
            const vlines = Array.from({ length: 9 }, (_, i) =>
                `<line x1="${i * 20}" y1="0" x2="${i * 20}" y2="100" stroke="${dark}" stroke-width="1.5" opacity="0.18"/>`
            ).join('');
            const hlines = Array.from({ length: 6 }, (_, i) =>
                `<line x1="0" y1="${i * 20}" x2="160" y2="${i * 20}" stroke="${dark}" stroke-width="1.5" opacity="0.18"/>`
            ).join('');
            body = `
        <rect width="160" height="100" fill="${bg}"/>
        ${vlines}${hlines}
        <rect x="50" y="25" width="60" height="50" rx="7" fill="${light}" stroke="${dark}" stroke-width="3.5"/>
        <path d="M63 50 l9 9 18-18" stroke="${dark}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
            break;
        }
        case 'waves':
            body = `
        <rect width="160" height="100" fill="${bg}"/>
        <path d="M0 65 Q40 45 80 65 Q120 85 160 65 L160 100 L0 100Z" fill="${dark}" opacity="0.18"/>
        <path d="M0 78 Q40 58 80 78 Q120 98 160 78 L160 100 L0 100Z" fill="${dark}" opacity="0.18"/>
        <circle cx="80" cy="42" r="24" fill="${light}" stroke="${dark}" stroke-width="4"/>
        <path d="M70 42 l7 7 14-14" stroke="${dark}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
            break;
        default: // 'blocks'
            body = `
        <rect width="160" height="100" fill="${bg}"/>
        <rect x="10" y="10" width="55" height="80" rx="7" fill="${dark}" opacity="0.18"/>
        <rect x="75" y="10" width="75" height="37" rx="7" fill="${dark}" opacity="0.18"/>
        <rect x="75" y="55" width="75" height="35" rx="7" fill="${dark}" opacity="0.18"/>
        <rect x="20" y="30" width="35" height="35" rx="5" fill="${light}" stroke="${dark}" stroke-width="3"/>`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">${body}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Main app
const PROJECTS = [
    {
        "slug": "shoreline",
        "path": "/shoreline/",
        "uses": 0,
        "hue": 220,
        "pattern": "waves",
        "name": "Shoreline",
        "category": "Tool",
        "blurb": "Find the perfect beach from any UK city—ranked by distance, vibe, and water quality.",
        "date": "2026-06-03"
    }
];

const items = PROJECTS.slice();
const cats = new Set(items.map(p => p.category));

const board = document.getElementById("board"), countEl = document.getElementById("count");
let sort = localStorage.getItem("sundry.sort") || "new";
let view = localStorage.getItem("sundry.view") || "grid";
let query = "";

const arrow = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

function tileGrid(p) {
    const h = p.hue;
    return `<a class="tile" href="${p.path || '#'}" style="--pop:${pop(h)};--pop-soft:${popSoft(h)}">
    <div class="tile-art" style="background-image:url('${thumbBold(h, p.pattern)}')"></div>
    <div class="tile-body">
      <div class="tile-top"><span class="tile-name">${p.name}</span><span class="chip">${p.category}</span></div>
      <div class="tile-blurb">${p.blurb}</div>
      <div class="tile-foot"><span>${fmtUses(p.uses)} opens · ${fmtDate(p.date)}</span><span class="launch">launch ${arrow}</span></div>
    </div>
  </a>`;
}

function tileList(p) {
    const h = p.hue;
    return `<li><a class="tile" href="${p.path || '#'}" style="--pop:${pop(h)};--pop-soft:${popSoft(h)}">
    <span class="tile-art" style="background-image:url('${thumbBold(h, p.pattern)}')"></span>
    <div class="tile-body">
      <div class="tile-top"><span class="tile-name">${p.name}</span><span class="chip">${p.category}</span></div>
      <div class="tile-blurb">${p.blurb}</div>
      <div class="tile-foot"><span>${fmtUses(p.uses)} opens · ${fmtDate(p.date)}</span></div>
    </div>
    <div class="tile-meta">
      <span class="r-m"><b>${fmtUses(p.uses)}</b>opens</span>
      <span class="r-m"><b>${fmtDate(p.date)}</b>added</span>
      <span class="go">${arrow}</span>
    </div>
  </a></li>`;
}

function render() {
    let rows = items.filter(p => !query || (p.name + " " + p.blurb + " " + p.category).toLowerCase().includes(query));
    rows.sort((a, b) => sort === "new" ? new Date(b.date) - new Date(a.date) : b.uses - a.uses);

    countEl.innerHTML = query
        ? `<b>${rows.length}</b> ${rows.length === 1 ? "match" : "matches"} for "${query}"`
        : `<b>${items.length}</b> apps · ${cats.size} categories`;

    if (!rows.length) { board.className = ""; board.innerHTML = `<div class="empty"><b>Nothing here</b>No app matches that search.</div>`; return; }

    if (view === "grid") {
        board.className = "grid";
        board.innerHTML = rows.map(tileGrid).join("");
    } else {
        board.className = "";
        board.innerHTML = `<ul class="list">${rows.map(tileList).join("")}</ul>`;
    }
}

document.getElementById("q").addEventListener("input", e => { query = e.target.value.trim().toLowerCase(); render(); });

document.querySelectorAll('.seg [data-sort]').forEach(b => b.addEventListener("click", () => {
    sort = b.dataset.sort; localStorage.setItem("sundry.sort", sort);
    document.querySelectorAll('.seg [data-sort]').forEach(x => x.setAttribute("aria-pressed", x === b));
    render();
}));
document.querySelectorAll('.seg [data-view]').forEach(b => b.addEventListener("click", () => {
    view = b.dataset.view; localStorage.setItem("sundry.view", view);
    document.querySelectorAll('.seg [data-view]').forEach(x => x.setAttribute("aria-pressed", x === b));
    render();
}));

document.querySelectorAll('.seg [data-sort]').forEach(x => x.setAttribute("aria-pressed", x.dataset.sort === sort));
document.querySelectorAll('.seg [data-view]').forEach(x => x.setAttribute("aria-pressed", x.dataset.view === view));
render();
