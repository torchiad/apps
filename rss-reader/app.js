const DEFAULT_FEED = 'https://www.swindonadvertiser.co.uk/news/rss/';
const STORAGE_KEY = 'broadsheet.lastUrl';
const FETCH_TIMEOUT_MS = 9000;

const feedForm = document.getElementById('feedForm');
const feedUrlInput = document.getElementById('feedUrl');
const loadBtn = document.getElementById('loadBtn');
const statusEl = document.getElementById('status');
const feedMetaEl = document.getElementById('feedMeta');
const feedTitleEl = document.getElementById('feedTitle');
const feedSubEl = document.getElementById('feedSub');
const articlesEl = document.getElementById('articles');
const presetsEl = document.getElementById('presets');

const readerOverlay = document.getElementById('readerOverlay');
const readerClose = document.getElementById('readerClose');
const readerKicker = document.getElementById('readerKicker');
const readerTitle = document.getElementById('readerTitle');
const readerMeta = document.getElementById('readerMeta');
const readerBody = document.getElementById('readerBody');
const readerSource = document.getElementById('readerSource');

let currentFeedTitle = '';

function isHttpUrl(str) {
    try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function absolutize(url, base) {
    try {
        return new URL(url, base).href;
    } catch {
        return null;
    }
}

function hostnameOf(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

async function fetchWithTimeout(url, opts = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...opts, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Try a URL directly, then fall back through several public CORS relays.
// Used for both the feed XML and (when reading full articles) the source
// page's HTML. Some publishers' bot protection blocks individual relays'
// IP ranges, so more relays means more chances one gets through.
async function fetchTextViaProxies(targetUrl) {
    const attempts = [
        () => fetchWithTimeout(targetUrl).then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))),
        () => fetchWithTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`)
            .then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))),
        () => fetchWithTimeout(`https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`)
            .then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))),
        () => fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`)
            .then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))),
        () => fetchWithTimeout(`https://thingproxy.freeboard.io/fetch/${targetUrl}`)
            .then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))),
        () => fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then(j => j.contents),
    ];

    let lastErr;
    for (const attempt of attempts) {
        try {
            const text = await attempt();
            if (text && text.trim().length) return text;
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('Could not fetch that URL');
}

function firstChildText(el, tagNames) {
    for (const t of tagNames) {
        const node = el.getElementsByTagName(t)[0];
        if (node && node.textContent && node.textContent.trim()) return node.textContent.trim();
    }
    return '';
}

function firstAttr(el, tagNames, attr) {
    for (const t of tagNames) {
        const node = el.getElementsByTagName(t)[0];
        if (node) {
            const v = node.getAttribute(attr);
            if (v) return v;
        }
    }
    return '';
}

function stripHtml(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function firstImageFromHtml(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const img = doc.querySelector('img[src]');
    return img ? img.getAttribute('src') : '';
}

function truncate(text, max) {
    if (text.length <= max) return text;
    return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function parseFeed(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('That URL did not return a valid RSS/Atom feed');

    const isAtom = !!doc.querySelector('feed > entry, feed');
    const itemNodes = isAtom
        ? Array.from(doc.getElementsByTagName('entry'))
        : Array.from(doc.getElementsByTagName('item'));

    if (!itemNodes.length) throw new Error('That feed has no articles to show');

    const channel = doc.querySelector('channel') || doc.querySelector('feed');
    const feedTitle = channel ? firstChildText(channel, ['title']) : '';
    const feedDesc = channel ? firstChildText(channel, ['description', 'subtitle']) : '';

    const items = itemNodes.map(node => {
        const title = firstChildText(node, ['title']) || 'Untitled';

        let link = '';
        const linkNodes = node.getElementsByTagName('link');
        for (const ln of linkNodes) {
            const href = ln.getAttribute('href');
            const rel = ln.getAttribute('rel');
            if (href && (!rel || rel === 'alternate')) { link = href; break; }
            if (!href && ln.textContent) { link = ln.textContent.trim(); break; }
        }

        const dateStr = firstChildText(node, ['pubDate', 'published', 'updated', 'dc:date']);
        const author = firstChildText(node, ['author', 'dc:creator']).replace(/<[^>]*>/g, '').trim();

        const rawContent = firstChildText(node, ['content:encoded', 'content', 'description', 'summary']);
        const excerptSource = firstChildText(node, ['description', 'summary']) || rawContent;
        const excerpt = truncate(stripHtml(excerptSource), 220);

        let image = firstAttr(node, ['media:content', 'media:thumbnail'], 'url');
        if (!image) {
            const enclosure = node.getElementsByTagName('enclosure')[0];
            if (enclosure) {
                const type = enclosure.getAttribute('type') || '';
                const url = enclosure.getAttribute('url') || '';
                if (!type || type.startsWith('image/')) image = url;
            }
        }
        if (!image) image = firstImageFromHtml(rawContent) || firstImageFromHtml(excerptSource);

        return { title, link, date: dateStr ? new Date(dateStr) : null, author, excerpt, image };
    });

    return { title: feedTitle, description: stripHtml(feedDesc), items };
}

function formatDate(d) {
    if (!d || isNaN(d)) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Full-article extraction ----
// News feeds almost always ship a short teaser only. To show the full piece
// we fetch the source page and pull out its main content with a lightweight
// readability-style heuristic, then rebuild it through a strict tag/attribute
// allowlist so nothing from the (untrusted, third-party) page can execute.

const CONTENT_TAGS = new Set([
    'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'A', 'IMG', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'UL', 'OL', 'LI', 'BLOCKQUOTE', 'FIGURE', 'FIGCAPTION', 'PRE', 'CODE', 'SPAN', 'DIV',
    'SECTION', 'ARTICLE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'HR', 'SUB', 'SUP', 'MARK',
]);

const STRIP_SELECTOR = [
    'script', 'style', 'noscript', 'iframe', 'svg', 'form', 'nav', 'header', 'footer', 'aside',
    'button', 'input', 'select', 'textarea', '[aria-hidden="true"]',
    '[class*="advert"]', '[id*="advert"]', '[class*="cookie"]', '[id*="cookie"]',
    '[class*="newsletter"]', '[class*="social-share"]', '[class*="related-article"]', '[class*="comments"]',
].join(',');

function sanitizeToFragment(html, baseUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const frag = document.createDocumentFragment();
    walkSanitize(doc.body, frag, baseUrl);
    return frag;
}

function walkSanitize(src, destParent, baseUrl) {
    for (const child of Array.from(src.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            if (child.textContent) destParent.appendChild(document.createTextNode(child.textContent));
            continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = child.tagName;
        if (!CONTENT_TAGS.has(tag)) continue; // drop scripts, nav, styles, unknown tags entirely

        if (tag === 'IMG') {
            const rawSrc = child.getAttribute('src') || child.getAttribute('data-src') || '';
            const abs = rawSrc ? absolutize(rawSrc, baseUrl) : null;
            if (!abs || !isHttpUrl(abs)) continue;
            const img = document.createElement('img');
            img.src = abs;
            const alt = child.getAttribute('alt');
            if (alt) img.alt = alt;
            img.loading = 'lazy';
            img.referrerPolicy = 'no-referrer';
            destParent.appendChild(img);
            continue;
        }

        const el = document.createElement(tag.toLowerCase());
        if (tag === 'A') {
            const rawHref = child.getAttribute('href') || '';
            const abs = rawHref ? absolutize(rawHref, baseUrl) : null;
            if (abs && isHttpUrl(abs)) {
                el.href = abs;
                el.target = '_blank';
                el.rel = 'noopener noreferrer nofollow';
            }
        }
        walkSanitize(child, el, baseUrl);
        destParent.appendChild(el);
    }
}

function scoreCandidate(el) {
    const paras = el.querySelectorAll('p');
    let textLen = 0;
    paras.forEach(p => { textLen += p.textContent.trim().length; });
    if (!textLen) return 0;
    let linkLen = 0;
    el.querySelectorAll('a').forEach(a => { linkLen += a.textContent.trim().length; });
    const density = textLen ? linkLen / textLen : 1;
    return textLen * (1 - Math.min(density, 0.85));
}

const CANDIDATE_SELECTORS = [
    'article', '[itemprop="articleBody"]', 'main', '[role="main"]',
    '.article-body', '.article__body', '.story-body', '.entry-content', '.post-content', '.c-article-body',
];

function extractArticle(htmlText, pageUrl) {
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    doc.querySelectorAll(STRIP_SELECTOR).forEach(n => n.remove());

    let best = null, bestScore = 0;
    for (const sel of CANDIDATE_SELECTORS) {
        doc.querySelectorAll(sel).forEach(el => {
            const s = scoreCandidate(el);
            if (s > bestScore) { bestScore = s; best = el; }
        });
    }
    if (!best) {
        doc.querySelectorAll('div, section').forEach(el => {
            if (el.querySelectorAll(':scope > p').length < 2 && el.querySelectorAll('p').length < 3) return;
            const s = scoreCandidate(el);
            if (s > bestScore) { bestScore = s; best = el; }
        });
    }
    if (!best || bestScore < 200) return null;

    return { fragment: sanitizeToFragment(best.innerHTML, pageUrl) };
}

function normalizeText(s) {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// The extracted content usually repeats the headline as its own <h1>/<h2>;
// drop it since the reader overlay already shows the title separately.
function dedupeLeadingHeading(fragment, title) {
    const first = fragment.firstElementChild;
    if (first && /^H[1-3]$/.test(first.tagName) && normalizeText(first.textContent) === normalizeText(title)) {
        fragment.removeChild(first);
    }
}

function skeletonReader() {
    const el = document.createElement('div');
    el.className = 'reader-skel';
    [92, 88, 95, 70, 90, 60].forEach(w => {
        const line = document.createElement('div');
        line.style.width = w + '%';
        el.appendChild(line);
    });
    return el;
}

function showReaderFallback(item, message) {
    readerBody.innerHTML = '';
    const note = document.createElement('p');
    note.className = 'reader-note';
    note.textContent = message;
    readerBody.appendChild(note);
    if (item.excerpt) {
        const p = document.createElement('p');
        p.textContent = item.excerpt;
        readerBody.appendChild(p);
    }
}

async function openReader(item) {
    readerOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    readerKicker.textContent = currentFeedTitle;
    readerTitle.textContent = item.title;

    const metaBits = [];
    if (item.author) metaBits.push(item.author);
    if (item.date) metaBits.push(formatDate(item.date));
    readerMeta.textContent = metaBits.join(' · ');

    readerBody.innerHTML = '';
    readerBody.appendChild(skeletonReader());

    readerSource.innerHTML = '';
    if (item.link && isHttpUrl(item.link)) {
        const a = document.createElement('a');
        a.href = item.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = `Open original at ${hostnameOf(item.link)} ↗`;
        readerSource.appendChild(a);
    }

    if (!item.link || !isHttpUrl(item.link)) {
        showReaderFallback(item, 'This feed did not provide a link to the full article.');
        return;
    }

    try {
        const html = await fetchTextViaProxies(item.link);
        const extracted = extractArticle(html, item.link);
        if (!extracted) throw new Error('extraction-failed');
        dedupeLeadingHeading(extracted.fragment, item.title);
        readerBody.innerHTML = '';
        readerBody.appendChild(extracted.fragment);
    } catch {
        showReaderFallback(item, "Couldn't pull the full article automatically — here's the feed summary instead.");
    }
}

function closeReader() {
    readerOverlay.classList.remove('open');
    document.body.style.overflow = '';
}

readerClose.addEventListener('click', closeReader);
readerOverlay.addEventListener('click', e => { if (e.target === readerOverlay) closeReader(); });
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && readerOverlay.classList.contains('open')) closeReader();
});

function showStatus(message, isError, retryUrl) {
    statusEl.hidden = false;
    statusEl.className = 'status' + (isError ? ' error' : '');
    statusEl.textContent = '';
    statusEl.append(message);
    if (isError && retryUrl) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'retry';
        retryBtn.textContent = 'Try again';
        retryBtn.addEventListener('click', () => loadFeed(retryUrl));
        statusEl.append(document.createElement('br'), retryBtn);
    }
}

function hideStatus() {
    statusEl.hidden = true;
}

function skeletonCard() {
    const el = document.createElement('div');
    el.className = 'skeleton';
    el.innerHTML = `<div class="sk-thumb"></div><div class="sk-body">
        <div class="sk-line w1"></div><div class="sk-line w2"></div>
        <div class="sk-line w3"></div><div class="sk-line w4"></div></div>`;
    return el;
}

function placeholder(title) {
    const ph = document.createElement('div');
    ph.className = 'ph';
    const span = document.createElement('span');
    span.textContent = (title || '?').trim().charAt(0).toUpperCase();
    ph.appendChild(span);
    return ph;
}

function renderArticle(item) {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.addEventListener('click', () => openReader(item));
    card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReader(item); }
    });

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (item.image && isHttpUrl(item.image)) {
        const img = document.createElement('img');
        img.src = item.image;
        img.loading = 'lazy';
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => { thumb.innerHTML = ''; thumb.appendChild(placeholder(item.title)); }, { once: true });
        thumb.appendChild(img);
    } else {
        thumb.appendChild(placeholder(item.title));
    }

    const body = document.createElement('div');
    body.className = 'body';

    const h3 = document.createElement('h3');
    h3.textContent = item.title;

    const meta = document.createElement('div');
    meta.className = 'meta';
    const metaBits = [];
    if (item.author) metaBits.push(item.author);
    if (item.date) metaBits.push(formatDate(item.date));
    if (metaBits.length) meta.appendChild(document.createTextNode(metaBits.join(' · ')));
    if (item.link && isHttpUrl(item.link)) {
        if (metaBits.length) meta.appendChild(document.createTextNode(' · '));
        const src = document.createElement('a');
        src.className = 'src-link';
        src.href = item.link;
        src.target = '_blank';
        src.rel = 'noopener noreferrer';
        src.textContent = 'source ↗';
        src.addEventListener('click', e => e.stopPropagation());
        meta.appendChild(src);
    }

    body.appendChild(h3);
    if (meta.childNodes.length) body.appendChild(meta);

    if (item.excerpt) {
        const excerpt = document.createElement('div');
        excerpt.className = 'excerpt';
        excerpt.textContent = item.excerpt;
        body.appendChild(excerpt);
    }

    const go = document.createElement('span');
    go.className = 'go';
    go.textContent = 'Read full article';
    body.appendChild(go);

    card.appendChild(thumb);
    card.appendChild(body);
    return card;
}

function updatePresetActive(url) {
    presetsEl.querySelectorAll('.chip').forEach(chip => {
        chip.classList.toggle('on', chip.dataset.url === url);
    });
}

async function loadFeed(url) {
    if (!isHttpUrl(url)) {
        showStatus('Enter a valid http(s) feed URL.', true);
        return;
    }

    feedUrlInput.value = url;
    updatePresetActive(url);
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading…';
    hideStatus();
    feedMetaEl.hidden = true;
    articlesEl.innerHTML = '';
    for (let i = 0; i < 3; i++) articlesEl.appendChild(skeletonCard());

    try {
        const xmlText = await fetchTextViaProxies(url);
        const feed = parseFeed(xmlText);

        articlesEl.innerHTML = '';
        currentFeedTitle = feed.title || 'Feed';
        feedTitleEl.textContent = currentFeedTitle;
        feedSubEl.textContent = `${feed.items.length} article${feed.items.length === 1 ? '' : 's'} · updated just now`;
        feedMetaEl.hidden = false;

        feed.items.forEach(item => articlesEl.appendChild(renderArticle(item)));

        localStorage.setItem(STORAGE_KEY, url);
    } catch (err) {
        articlesEl.innerHTML = '';
        showStatus(`Couldn't load that feed: ${err.message}. It may not publish RSS, or is blocking automated requests.`, true, url);
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Load feed';
    }
}

feedForm.addEventListener('submit', e => {
    e.preventDefault();
    loadFeed(feedUrlInput.value.trim());
});

presetsEl.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    loadFeed(chip.dataset.url);
});

const startUrl = localStorage.getItem(STORAGE_KEY) || DEFAULT_FEED;
feedUrlInput.value = startUrl;
loadFeed(startUrl);
