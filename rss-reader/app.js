const DEFAULT_FEED = 'https://www.swindonadvertiser.co.uk/news/rss/';
const STORAGE_KEY = 'broadsheet.lastUrl';
const FETCH_TIMEOUT_MS = 12000;

const feedForm = document.getElementById('feedForm');
const feedUrlInput = document.getElementById('feedUrl');
const loadBtn = document.getElementById('loadBtn');
const statusEl = document.getElementById('status');
const feedMetaEl = document.getElementById('feedMeta');
const feedTitleEl = document.getElementById('feedTitle');
const feedSubEl = document.getElementById('feedSub');
const articlesEl = document.getElementById('articles');
const presetsEl = document.getElementById('presets');

function isHttpUrl(str) {
    try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
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

// Try the feed directly, then fall back to public CORS relays.
async function fetchFeedText(feedUrl) {
    const attempts = [
        () => fetchWithTimeout(feedUrl).then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))),
        () => fetchWithTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`)
            .then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))),
        () => fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(feedUrl)}`)
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
    throw lastErr || new Error('Could not fetch that feed');
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

function renderArticle(item) {
    const card = document.createElement('a');
    card.className = 'card';
    if (item.link && isHttpUrl(item.link)) {
        card.href = item.link;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
    } else {
        card.href = '#';
    }

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
    meta.textContent = metaBits.join(' · ');

    body.appendChild(h3);
    if (metaBits.length) body.appendChild(meta);

    if (item.excerpt) {
        const excerpt = document.createElement('div');
        excerpt.className = 'excerpt';
        excerpt.textContent = item.excerpt;
        body.appendChild(excerpt);
    }

    const go = document.createElement('span');
    go.className = 'go';
    go.textContent = 'Read full article →';
    body.appendChild(go);

    card.appendChild(thumb);
    card.appendChild(body);
    return card;
}

function placeholder(title) {
    const ph = document.createElement('div');
    ph.className = 'ph';
    const span = document.createElement('span');
    span.textContent = (title || '?').trim().charAt(0).toUpperCase();
    ph.appendChild(span);
    return ph;
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
        const xmlText = await fetchFeedText(url);
        const feed = parseFeed(xmlText);

        articlesEl.innerHTML = '';
        feedTitleEl.textContent = feed.title || 'Feed';
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
