const gridCanvas = document.getElementById('grid-canvas');
const drawCanvas = document.getElementById('draw-canvas');
const gCtx = gridCanvas.getContext('2d');
const dCtx = drawCanvas.getContext('2d');
const thickSlider = document.getElementById('thickness');
const thickOut = document.getElementById('thick-out');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnClear = document.getElementById('btn-clear');
const statusEl = document.getElementById('status');

const COLS = 8, ROWS = 4;
const GAP = 6;
let CELL, W, H, OFFSET_X, OFFSET_Y;
const plants = new Set();
let startPos = { x: 0, y: 0 };

const CELL_DEFS = [
    ...Array.from({ length: 7 }, (_, c) => Array.from({ length: 3 }, (_, r) => ({ col: c, row: r }))).flat(),
    { col: 7, row: 1 }, { col: 7, row: 2 }, { col: 7, row: 3 }
];

let color = '#1D9E75';
let thickness = 8;
let strokes = [];
let redoStack = [];
let painting = false;
let currentStroke = null;

function resize() {
    const w = gridCanvas.parentElement.offsetWidth;
    const totalGapX = GAP * (COLS + 1);
    const totalGapY = GAP * (ROWS + 1);
    CELL = Math.floor((w - totalGapX) / COLS);
    W = COLS * CELL + totalGapX;
    H = ROWS * CELL + totalGapY;
    OFFSET_X = GAP;
    OFFSET_Y = GAP;
    [gridCanvas, drawCanvas].forEach(c => { c.width = W; c.height = H; });
    drawGrid();
    redrawStrokes();
}

function cellRect(col, row) {
    return {
        x: OFFSET_X + col * (CELL + GAP),
        y: OFFSET_Y + row * (CELL + GAP),
        w: CELL, h: CELL
    };
}

function drawGrid() {
    gCtx.clearRect(0, 0, W, H);
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const bg = isDark ? '#2C2C2A' : '#EAF3DE';
    const border = isDark ? '#444441' : '#97C459';
    const label = isDark ? '#C0DD97' : '#3B6D11';

    CELL_DEFS.forEach(({ col, row }) => {
        const { x, y, w, h } = cellRect(col, row);
        const isPlanted = plants.has(`${col},${row}`);

        gCtx.fillStyle = isPlanted ? (isDark ? '#3D5220' : '#C5E3A4') : bg;
        gCtx.beginPath();
        gCtx.roundRect(x, y, w, h, 6);
        gCtx.fill();
        gCtx.strokeStyle = border;
        gCtx.lineWidth = 0.5;
        gCtx.stroke();
        gCtx.fillStyle = label;
        gCtx.font = `11px sans-serif`;
        gCtx.textAlign = 'center';
        gCtx.textBaseline = 'middle';
        if (isPlanted) {
            gCtx.fillText("🌱", x + w / 2, y + h / 2);
        } else {
            gCtx.fillText(`${col + 1},${row + 1}`, x + w / 2, y + h / 2);
        }
    });
}

function redrawStrokes() {
    dCtx.clearRect(0, 0, W, H);
    strokes.forEach(s => drawStroke(s));
}

function drawStroke(s) {
    if (!s.points.length) return;
    dCtx.save();
    dCtx.strokeStyle = s.color;
    dCtx.lineWidth = s.thickness;
    dCtx.lineCap = 'round';
    dCtx.lineJoin = 'round';
    dCtx.beginPath();
    dCtx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
        const p = s.points[i];
        dCtx.lineTo(p.x, p.y);
    }
    dCtx.stroke();
    dCtx.restore();
}

function getPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    let src = e;
    if (e.touches && e.touches.length > 0) src = e.touches[0];
    else if (e.changedTouches && e.changedTouches.length > 0) src = e.changedTouches[0];

    return {
        x: (src.clientX - rect.left) * scaleX,
        y: (src.clientY - rect.top) * scaleY
    };
}

function togglePlant(x, y) {
    const found = CELL_DEFS.find(({ col, row }) => {
        const r = cellRect(col, row);
        return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    });
    if (found) {
        const key = `${found.col},${found.row}`;
        if (plants.has(key)) plants.delete(key);
        else plants.add(key);
        drawGrid();
    }
}

drawCanvas.addEventListener('mousedown', e => {
    painting = true;
    startPos = getPos(e);
    redoStack = [];
    currentStroke = { color, thickness, points: [getPos(e)] };
    updateButtons();
});

drawCanvas.addEventListener('mousemove', e => {
    if (!painting) return;
    currentStroke.points.push(getPos(e));
    redrawStrokes();
    drawStroke(currentStroke);
});

window.addEventListener('mouseup', (e) => {
    if (!painting) return;
    painting = false;
    const endPos = getPos(e);
    const dist = Math.sqrt((endPos.x - startPos.x) ** 2 + (endPos.y - startPos.y) ** 2);

    if (dist < 6) {
        togglePlant(endPos.x, endPos.y);
    } else if (currentStroke && currentStroke.points.length > 1) {
        strokes.push(currentStroke);
        updateStatus();
        updateButtons();
    }
    currentStroke = null;
});

drawCanvas.addEventListener('touchstart', e => {
    e.preventDefault();
    painting = true;
    startPos = getPos(e);
    redoStack = [];
    currentStroke = { color, thickness, points: [getPos(e)] };
    updateButtons();
}, { passive: false });

drawCanvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!painting) return;
    currentStroke.points.push(getPos(e));
    redrawStrokes();
    drawStroke(currentStroke);
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (!painting) return;
    painting = false;
    const endPos = getPos(e);
    const dist = Math.sqrt((endPos.x - startPos.x) ** 2 + (endPos.y - startPos.y) ** 2);

    if (dist < 6) {
        togglePlant(endPos.x, endPos.y);
    } else if (currentStroke && currentStroke.points.length > 1) {
        strokes.push(currentStroke);
        updateStatus();
        updateButtons();
    }
    currentStroke = null;
});

document.querySelectorAll('.swatch').forEach(s => {
    s.addEventListener('click', () => {
        document.querySelectorAll('.swatch').forEach(x => x.classList.remove('sel'));
        s.classList.add('sel');
        color = s.dataset.color;
    });
});

thickSlider.addEventListener('input', () => {
    thickness = parseInt(thickSlider.value);
    thickOut.textContent = thickness;
});

btnUndo.addEventListener('click', () => {
    if (!strokes.length) return;
    redoStack.push(strokes.pop());
    redrawStrokes();
    updateStatus();
    updateButtons();
});

btnRedo.addEventListener('click', () => {
    if (!redoStack.length) return;
    strokes.push(redoStack.pop());
    redrawStrokes();
    updateStatus();
    updateButtons();
});

btnClear.addEventListener('click', () => {
    redoStack = [...strokes, ...redoStack];
    strokes = [];
    redrawStrokes();
    updateStatus();
    updateButtons();
});

function updateButtons() {
    btnUndo.disabled = strokes.length === 0;
    btnRedo.disabled = redoStack.length === 0;
}

function updateStatus() {
    statusEl.textContent = strokes.length === 0
        ? 'Draw hose runs across your plot'
        : `${strokes.length} hose stroke${strokes.length > 1 ? 's' : ''} drawn`;
}

window.addEventListener('resize', resize);
resize();