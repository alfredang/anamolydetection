// Anomaly Detection — vanilla JS
(() => {
  'use strict';

  // ---------- State ----------
  const state = {
    raw: [],
    anomalies: new Set(),
    method: 'zscore',
    threshold: 2.5,
    points: [], // hit-test cache: {x, y, index, value, anomaly}
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const dataInput      = $('dataInput');
  const fileInput      = $('fileInput');
  const fileName       = $('fileName');
  const sampleBtn      = $('sampleBtn');
  const clearBtn       = $('clearBtn');
  const downloadBtn    = $('downloadBtn');
  const errorBanner    = $('errorBanner');
  const methodSelect   = $('methodSelect');
  const slider         = $('thresholdSlider');
  const thresholdValue = $('thresholdValue');
  const thresholdHint  = $('thresholdHint');
  const themeToggle    = $('themeToggle');
  const canvas         = $('chart');
  const tooltip        = $('tooltip');
  const emptyState     = $('emptyState');
  const statTotal      = $('statTotal');
  const statAnomalies  = $('statAnomalies');
  const statRate       = $('statRate');
  const anomalyList    = $('anomalyList');
  const tableBody      = document.querySelector('#dataTable tbody');

  // ---------- Utils ----------
  const debounce = (fn, ms = 120) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  const showError = (msg) => {
    errorBanner.textContent = msg;
    errorBanner.hidden = false;
  };
  const clearError = () => {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
  };

  // ---------- Parsing ----------
  function parseInput(text) {
    if (!text || !text.trim()) return [];
    const tokens = text.split(/[\s,;\n\r\t]+/).filter(Boolean);
    const nums = [];
    const bad = [];
    for (const tok of tokens) {
      const n = Number(tok);
      if (Number.isFinite(n)) nums.push(n);
      else bad.push(tok);
    }
    if (bad.length) {
      throw new Error(`Could not parse ${bad.length} value${bad.length > 1 ? 's' : ''} (e.g. "${bad[0]}"). Use numbers separated by commas.`);
    }
    if (nums.length < 2) {
      throw new Error('Please provide at least 2 numeric values.');
    }
    return nums;
  }

  function readCsvFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsText(file);
    });
  }

  // ---------- Statistics ----------
  const mean = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;

  const stdDev = (arr, mu) => {
    if (arr.length < 2) return 0;
    const m = mu ?? mean(arr);
    const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
  };

  function quartiles(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const q = (p) => {
      const pos = (sorted.length - 1) * p;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      if (lo === hi) return sorted[lo];
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    };
    const q1 = q(0.25);
    const q3 = q(0.75);
    return { q1, q3, iqr: q3 - q1 };
  }

  // ---------- Detection ----------
  function detectZScore(data, threshold) {
    const m = mean(data);
    const sd = stdDev(data, m);
    const out = new Set();
    if (sd === 0) return out;
    data.forEach((v, i) => {
      if (Math.abs(v - m) / sd > threshold) out.add(i);
    });
    return out;
  }

  function detectIQR(data, multiplier) {
    const { q1, q3, iqr } = quartiles(data);
    const lo = q1 - multiplier * iqr;
    const hi = q3 + multiplier * iqr;
    const out = new Set();
    if (iqr === 0) return out;
    data.forEach((v, i) => {
      if (v < lo || v > hi) out.add(i);
    });
    return out;
  }

  function runDetection() {
    if (!state.raw.length) {
      state.anomalies = new Set();
      render();
      return;
    }
    state.anomalies = state.method === 'zscore'
      ? detectZScore(state.raw, state.threshold)
      : detectIQR(state.raw, state.threshold);
    render();
  }

  // ---------- Rendering ----------
  function render() {
    renderStats();
    renderAnomalyList();
    renderTable();
    renderChart();
    emptyState.hidden = state.raw.length > 0;
    downloadBtn.disabled = state.raw.length === 0;
  }

  function renderStats() {
    const total = state.raw.length;
    const count = state.anomalies.size;
    const rate = total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%';
    // re-trigger pop animation by replacing nodes
    setStat(statTotal, total);
    setStat(statAnomalies, count);
    setStat(statRate, rate);
  }
  function setStat(node, value) {
    if (String(node.textContent) === String(value)) return;
    node.textContent = value;
    node.style.animation = 'none';
    // force reflow
    void node.offsetWidth;
    node.style.animation = '';
  }

  function renderAnomalyList() {
    if (!state.anomalies.size) {
      anomalyList.innerHTML = '<p class="muted">No anomalies detected.</p>';
      return;
    }
    const items = [...state.anomalies].sort((a, b) => a - b).map((i) => {
      const v = state.raw[i];
      return `<span class="anomaly-pill"><span class="pill-idx">#${i}</span>${formatNum(v)}</span>`;
    });
    anomalyList.innerHTML = items.join('');
  }

  function renderTable() {
    if (!state.raw.length) {
      tableBody.innerHTML = '';
      return;
    }
    const rows = state.raw.map((v, i) => {
      const isAnom = state.anomalies.has(i);
      return `<tr class="${isAnom ? 'is-anomaly' : ''}">
        <td>${i}</td>
        <td>${formatNum(v)}</td>
        <td>${isAnom ? 'Anomaly' : 'Normal'}</td>
      </tr>`;
    });
    tableBody.innerHTML = rows.join('');
  }

  function formatNum(n) {
    if (Number.isInteger(n)) return String(n);
    return Number(n.toFixed(4)).toString();
  }

  // ---------- Canvas chart ----------
  function renderChart() {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(rect.width, 1);
    const H = Math.max(rect.height, 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    state.points = [];
    if (!state.raw.length) return;

    const styles = getComputedStyle(document.documentElement);
    const colorAxis    = styles.getPropertyValue('--axis').trim() || '#94a3b8';
    const colorGrid    = styles.getPropertyValue('--grid').trim() || 'rgba(0,0,0,0.06)';
    const colorLine    = styles.getPropertyValue('--normal-line').trim() || '#6366f1';
    const colorPoint   = styles.getPropertyValue('--normal-fill').trim() || '#818cf8';
    const colorAnomaly = styles.getPropertyValue('--anomaly').trim() || '#ef4444';
    const colorText    = styles.getPropertyValue('--text-muted').trim() || '#64748b';

    // Padding
    const padL = 44, padR = 18, padT = 18, padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    // Bounds
    let minV = Math.min(...state.raw);
    let maxV = Math.max(...state.raw);
    if (minV === maxV) { minV -= 1; maxV += 1; }
    const range = maxV - minV;
    const padRange = range * 0.1;
    minV -= padRange;
    maxV += padRange;

    const n = state.raw.length;
    const xAt = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (v) => padT + plotH - ((v - minV) / (maxV - minV)) * plotH;

    // Grid + Y ticks
    ctx.strokeStyle = colorGrid;
    ctx.lineWidth = 1;
    ctx.fillStyle = colorText;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';

    const yTicks = 5;
    for (let t = 0; t <= yTicks; t++) {
      const v = minV + ((maxV - minV) * t) / yTicks;
      const y = yAt(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(formatNum(v), padL - 6, y);
    }

    // X axis ticks (sparse)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xTicks = Math.min(8, n);
    for (let t = 0; t < xTicks; t++) {
      const i = Math.round((t / (xTicks - 1 || 1)) * (n - 1));
      const x = xAt(i);
      ctx.fillText(String(i), x, H - padB + 6);
    }

    // Axis line (subtle)
    ctx.strokeStyle = colorAxis;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, H - padB);
    ctx.lineTo(W - padR, H - padB);
    ctx.stroke();

    // Connecting line
    ctx.strokeStyle = colorLine;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    state.raw.forEach((v, i) => {
      const x = xAt(i);
      const y = yAt(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Points
    state.raw.forEach((v, i) => {
      const x = xAt(i);
      const y = yAt(v);
      const anomaly = state.anomalies.has(i);
      ctx.beginPath();
      ctx.fillStyle = anomaly ? colorAnomaly : colorPoint;
      ctx.arc(x, y, anomaly ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();

      if (anomaly) {
        // outer ring
        ctx.beginPath();
        ctx.strokeStyle = colorAnomaly;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.35;
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      state.points.push({ x, y, index: i, value: v, anomaly });
    });
  }

  // ---------- Tooltip ----------
  function attachCanvasTooltip() {
    canvas.addEventListener('mousemove', (e) => {
      if (!state.points.length) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let best = null;
      let bestD = Infinity;
      for (const p of state.points) {
        const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best && bestD < 30 ** 2) {
        tooltip.hidden = false;
        tooltip.innerHTML = `<strong>#${best.index}</strong> · ${formatNum(best.value)}${best.anomaly ? ' · anomaly' : ''}`;
        tooltip.style.left = best.x + 'px';
        tooltip.style.top = best.y + 'px';
      } else {
        tooltip.hidden = true;
      }
    });
    canvas.addEventListener('mouseleave', () => { tooltip.hidden = true; });
  }

  // ---------- Threshold UI ----------
  function applyMethodUI() {
    if (state.method === 'zscore') {
      slider.min = '1';
      slider.max = '5';
      slider.step = '0.1';
      if (parseFloat(slider.value) < 1 || parseFloat(slider.value) > 5) slider.value = '2.5';
      thresholdHint.textContent = '|z| greater than threshold flagged as anomaly';
    } else {
      slider.min = '0.5';
      slider.max = '3';
      slider.step = '0.1';
      if (parseFloat(slider.value) < 0.5 || parseFloat(slider.value) > 3) slider.value = '1.5';
      thresholdHint.textContent = 'Multiplier × IQR beyond Q1/Q3 flagged as anomaly';
    }
    state.threshold = parseFloat(slider.value);
    thresholdValue.textContent = state.threshold.toFixed(1);
  }

  // ---------- CSV export ----------
  function downloadResultsCsv() {
    if (!state.raw.length) return;
    const methodLabel = state.method === 'zscore' ? 'Z-score' : 'IQR';
    const header = `# method=${methodLabel}, threshold=${state.threshold.toFixed(2)}, total=${state.raw.length}, anomalies=${state.anomalies.size}\nindex,value,status\n`;
    const rows = state.raw.map((v, i) =>
      `${i},${v},${state.anomalies.has(i) ? 'anomaly' : 'normal'}`
    ).join('\n');
    const csv = header + rows + '\n';

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anomaly-results-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  // ---------- Sample data ----------
  function buildSample() {
    const arr = [];
    for (let i = 0; i < 40; i++) {
      // gentle sinusoidal drift + noise
      arr.push(+(50 + Math.sin(i / 4) * 6 + (Math.random() - 0.5) * 4).toFixed(2));
    }
    // inject outliers
    arr[8]  = 110;
    arr[19] = -20;
    arr[31] = 95;
    return arr.join(', ');
  }

  // ---------- Pipeline ----------
  const handleInput = debounce(() => {
    const text = dataInput.value;
    if (!text.trim()) {
      state.raw = [];
      clearError();
      runDetection();
      return;
    }
    try {
      state.raw = parseInput(text);
      clearError();
      runDetection();
    } catch (err) {
      state.raw = [];
      showError(err.message);
      runDetection();
    }
  }, 150);

  // ---------- Events ----------
  dataInput.addEventListener('input', handleInput);

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    fileName.textContent = file.name;
    try {
      const text = await readCsvFile(file);
      dataInput.value = text;
      handleInput();
    } catch (err) {
      showError(err.message);
    }
  });

  sampleBtn.addEventListener('click', () => {
    dataInput.value = buildSample();
    handleInput();
  });

  downloadBtn.addEventListener('click', downloadResultsCsv);

  clearBtn.addEventListener('click', () => {
    dataInput.value = '';
    fileInput.value = '';
    fileName.textContent = 'No file selected';
    state.raw = [];
    clearError();
    runDetection();
  });

  methodSelect.addEventListener('change', () => {
    state.method = methodSelect.value;
    applyMethodUI();
    runDetection();
  });

  slider.addEventListener('input', () => {
    state.threshold = parseFloat(slider.value);
    thresholdValue.textContent = state.threshold.toFixed(1);
    runDetection();
  });

  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('anomaly-theme', next); } catch (_) { /* ignore */ }
    renderChart();
  });

  const handleResize = debounce(renderChart, 100);
  window.addEventListener('resize', handleResize);

  // ---------- Init ----------
  function init() {
    try {
      const saved = localStorage.getItem('anomaly-theme');
      if (saved === 'dark' || saved === 'light') {
        document.documentElement.dataset.theme = saved;
      }
    } catch (_) { /* ignore */ }

    applyMethodUI();
    attachCanvasTooltip();
    render();
  }

  init();
})();
