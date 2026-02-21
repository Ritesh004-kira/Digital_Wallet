/* ============================================================
   DigiWallet — Frontend Logic
   Connects to Flask REST API, handles all UI interactions
   ============================================================ */

const API = 'http://127.0.0.1:5000/api';

// ─── State ───────────────────────────────────────────────────
let allTransactions = [];
let donutChart = null;
let reportCatChart = null;
let reportBarChart = null;
let selectedType = 'income';

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setTopbarDate();
    initBackground();
    initNav();
    initModal();
    initFilters();
    loadDashboard();
    prefillDateTime();
});

// ─── Date/Time ────────────────────────────────────────────────
function setTopbarDate() {
    const el = document.getElementById('topbar-date');
    const now = new Date();
    el.textContent = now.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

function prefillDateTime() {
    const now = new Date();
    document.getElementById('f-day').value = now.getDate();
    document.getElementById('f-month').value = now.getMonth() + 1;
    document.getElementById('f-year').value = now.getFullYear();
    document.getElementById('f-hour').value = now.getHours();
    document.getElementById('f-minute').value = now.getMinutes();
}

// ─── Navigation ───────────────────────────────────────────────
function initNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => switchSection(btn.dataset.section));
    });
}

function switchSection(name) {
    // sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${name}`).classList.add('active');
    // nav items
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-section="${name}"]`).classList.add('active');
    // titles
    const titles = {
        dashboard: ['Dashboard', 'Overview of your financial activity'],
        transactions: ['All Transactions', 'Browse and filter your transaction history'],
        report: ['Monthly Report', 'Detailed breakdown of your monthly finances'],
    };
    document.getElementById('page-title').textContent = titles[name][0];
    document.getElementById('page-subtitle').textContent = titles[name][1];

    if (name === 'transactions') loadTransactions();
    if (name === 'dashboard') loadDashboard();
}

// ─── Dashboard ────────────────────────────────────────────────
async function loadDashboard() {
    try {
        const [bal, txns] = await Promise.all([
            fetchJSON(`${API}/balance`),
            fetchJSON(`${API}/transactions`),
        ]);
        allTransactions = txns;
        updateStats(bal);
        updateDonut(bal);
        renderRecentList(txns.slice(0, 6));
    } catch (e) {
        showToast('Could not connect to backend. Is Flask running?', 'error');
    }
}

function updateStats(bal) {
    animateValue('stat-balance', bal.balance, true, '$');
    animateValue('stat-income', bal.total_income, true, '$');
    animateValue('stat-expense', bal.total_expense, true, '$');
    animateValue('stat-tx', bal.tx_count, false, '');

    // balance fill bar (% saved of income)
    const pct = bal.total_income > 0
        ? Math.min(100, ((bal.balance / bal.total_income) * 100))
        : 0;
    document.getElementById('balance-fill').style.width = pct + '%';
}

function updateDonut(bal) {
    const income = bal.total_income || 0;
    const expense = bal.total_expense || 0;
    const savedPct = income > 0
        ? Math.round(((income - expense) / income) * 100)
        : 0;

    document.getElementById('chart-pct').textContent = savedPct + '%';

    const data = income === 0 && expense === 0
        ? [1, 0]
        : [income, expense];

    const ctx = document.getElementById('donut-chart').getContext('2d');
    if (donutChart) donutChart.destroy();
    donutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Income', 'Expense'],
            datasets: [{
                data,
                backgroundColor: ['rgba(78,203,141,0.85)', 'rgba(232,85,106,0.85)'],
                borderColor: ['rgba(78,203,141,0.3)', 'rgba(232,85,106,0.3)'],
                borderWidth: 2,
                hoverOffset: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` $${ctx.parsed.toFixed(2)}`
                    }
                }
            }
        }
    });
}

function renderRecentList(txns) {
    const container = document.getElementById('recent-list');
    if (!txns.length) {
        container.innerHTML = '<div class="empty-state">No transactions yet</div>';
        return;
    }
    container.innerHTML = txns.map(t => txItemHTML(t)).join('');
}

function txItemHTML(t) {
    const sign = t.type === 'income' ? '+' : '-';
    const dt = `${pad(t.day)}/${pad(t.month)}/${t.year}`;
    return `
    <div class="tx-item">
      <div class="tx-type-badge ${t.type}">${t.type === 'income' ? '↑' : '↓'}</div>
      <div class="tx-info">
        <div class="tx-cat">${escHtml(t.category.replace(/_/g, ' '))}</div>
        <div class="tx-merchant">${escHtml(t.merchant.replace(/_/g, ' '))} · ${dt} ${pad(t.hour)}:${pad(t.minute)}</div>
      </div>
      <div class="tx-amount ${t.type}">${sign}$${t.amount.toFixed(2)}</div>
    </div>`;
}

// ─── Transactions Section ─────────────────────────────────────
async function loadTransactions() {
    try {
        const txns = await fetchJSON(`${API}/transactions`);
        allTransactions = txns;
        applyFilters();
    } catch (e) {
        showToast('Failed to load transactions', 'error');
    }
}

function initFilters() {
    document.getElementById('filter-type').addEventListener('change', applyFilters);
    document.getElementById('filter-sort').addEventListener('change', applyFilters);
}

function applyFilters() {
    const type = document.getElementById('filter-type').value;
    const sort = document.getElementById('filter-sort').value;
    let data = [...allTransactions];

    if (type !== 'all') data = data.filter(t => t.type === type);

    data.sort((a, b) => {
        const da = new Date(a.year, a.month - 1, a.day, a.hour, a.minute);
        const db = new Date(b.year, b.month - 1, b.day, b.hour, b.minute);
        if (sort === 'newest') return db - da;
        if (sort === 'oldest') return da - db;
        if (sort === 'highest') return b.amount - a.amount;
        if (sort === 'lowest') return a.amount - b.amount;
        return 0;
    });

    renderTxTable(data);
    document.getElementById('tx-count-badge').textContent = `${data.length} record${data.length !== 1 ? 's' : ''}`;
}

function renderTxTable(data) {
    const tbody = document.getElementById('tx-tbody');
    const empty = document.getElementById('tx-empty');

    if (!data.length) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    tbody.innerHTML = data.map(t => `
    <tr>
      <td><span class="pill ${t.type}">${t.type}</span></td>
      <td style="font-weight:700;color:${t.type === 'income' ? 'var(--green)' : 'var(--red)'}">
        ${t.type === 'income' ? '+' : '-'}$${t.amount.toFixed(2)}
      </td>
      <td>${escHtml(t.category.replace(/_/g, ' '))}</td>
      <td>${escHtml(t.merchant.replace(/_/g, ' '))}</td>
      <td style="color:var(--white-60);font-size:0.82rem">
        ${pad(t.day)}/${pad(t.month)}/${t.year} &nbsp; ${pad(t.hour)}:${pad(t.minute)}
      </td>
    </tr>`).join('');
}

// ─── Modal ────────────────────────────────────────────────────
function initModal() {
    const overlay = document.getElementById('modal-overlay');
    const closeBtn = document.getElementById('modal-close');
    const addBtn = document.getElementById('btn-add');
    const submit = document.getElementById('btn-submit');

    addBtn.addEventListener('click', () => openModal());
    closeBtn.addEventListener('click', () => closeModal());
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    submit.addEventListener('click', handleSubmit);

    // Type toggle
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedType = btn.dataset.type;
        });
    });

    // ESC to close
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });
}

function openModal() {
    prefillDateTime();
    document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    clearForm();
}

function clearForm() {
    ['f-amount', 'f-category', 'f-merchant'].forEach(id => {
        document.getElementById(id).value = '';
    });
    selectedType = 'income';
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('type-income').classList.add('active');
}

async function handleSubmit() {
    const amount = parseFloat(document.getElementById('f-amount').value);
    const category = document.getElementById('f-category').value.trim();
    const merchant = document.getElementById('f-merchant').value.trim();
    const day = parseInt(document.getElementById('f-day').value);
    const month = parseInt(document.getElementById('f-month').value);
    const year = parseInt(document.getElementById('f-year').value);
    const hour = parseInt(document.getElementById('f-hour').value);
    const minute = parseInt(document.getElementById('f-minute').value);

    if (!amount || amount <= 0) return showToast('Enter a valid amount', 'error');
    if (!category) return showToast('Enter a category', 'error');
    if (!merchant) return showToast('Enter a merchant', 'error');

    setSubmitLoading(true);

    try {
        const res = await fetch(`${API}/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: selectedType, amount, category, merchant, day, month, year, hour, minute }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        showToast('Transaction added successfully! ✓', 'success');
        closeModal();
        loadDashboard();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        setSubmitLoading(false);
    }
}

function setSubmitLoading(on) {
    const btn = document.getElementById('btn-submit');
    const text = document.getElementById('submit-text');
    const spinner = document.getElementById('btn-spinner');
    btn.disabled = on;
    text.style.display = on ? 'none' : 'block';
    spinner.style.display = on ? 'block' : 'none';
}

// ─── Report ───────────────────────────────────────────────────
document.getElementById('btn-generate').addEventListener('click', generateReport);

async function generateReport() {
    const month = parseInt(document.getElementById('report-month').value);
    const year = parseInt(document.getElementById('report-year').value);

    if (!year || year < 2000) return showToast('Enter a valid year', 'error');

    try {
        const data = await fetchJSON(`${API}/report?month=${month}&year=${year}`);

        document.getElementById('report-placeholder').style.display = 'none';
        document.getElementById('report-content').style.display = 'block';

        document.getElementById('r-income').textContent = `$${data.total_income.toFixed(2)}`;
        document.getElementById('r-expense').textContent = `$${data.total_expense.toFixed(2)}`;
        const sav = document.getElementById('r-savings');
        sav.textContent = `$${data.savings.toFixed(2)}`;
        sav.style.color = data.savings >= 0 ? 'var(--green)' : 'var(--red)';

        // Alert
        const alert = document.getElementById('report-alert');
        alert.style.display = data.alert ? 'flex' : 'none';

        // Category chart
        const cats = Object.keys(data.cat_breakdown);
        const vals = Object.values(data.cat_breakdown);
        const colors = generatePalette(cats.length);

        const catCtx = document.getElementById('report-cat-chart').getContext('2d');
        if (reportCatChart) reportCatChart.destroy();
        reportCatChart = new Chart(catCtx, {
            type: 'doughnut',
            data: {
                labels: cats.map(c => c.replace(/_/g, ' ')),
                datasets: [{
                    data: vals,
                    backgroundColor: colors,
                    borderColor: colors.map(c => c.replace('0.8', '0.3')),
                    borderWidth: 2,
                    hoverOffset: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: 'rgba(244,246,251,0.7)', font: { size: 12 }, padding: 12, boxWidth: 12, boxHeight: 12 }
                    },
                    tooltip: {
                        callbacks: { label: ctx => ` $${ctx.parsed.toFixed(2)}` }
                    }
                }
            }
        });

        // Bar chart
        const barCtx = document.getElementById('report-bar-chart').getContext('2d');
        if (reportBarChart) reportBarChart.destroy();
        reportBarChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ['Income', 'Expenses', 'Savings'],
                datasets: [{
                    data: [data.total_income, data.total_expense, Math.max(0, data.savings)],
                    backgroundColor: [
                        'rgba(78,203,141,0.75)',
                        'rgba(232,85,106,0.75)',
                        'rgba(240,192,64,0.75)',
                    ],
                    borderColor: [
                        'rgba(78,203,141,0.4)',
                        'rgba(232,85,106,0.4)',
                        'rgba(240,192,64,0.4)',
                    ],
                    borderWidth: 2,
                    borderRadius: 8,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ` $${ctx.parsed.y.toFixed(2)}` } }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(244,246,251,0.6)' } },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.04)' },
                        ticks: { color: 'rgba(244,246,251,0.6)', callback: v => '$' + v }
                    }
                }
            }
        });

        // Table
        const tbody = document.getElementById('report-tbody');
        const empty = document.getElementById('report-empty');
        if (!data.transactions.length) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
        } else {
            empty.style.display = 'none';
            tbody.innerHTML = data.transactions.map(t => `
        <tr>
          <td><span class="pill ${t.type}">${t.type}</span></td>
          <td style="font-weight:700;color:${t.type === 'income' ? 'var(--green)' : 'var(--red)'}">
            ${t.type === 'income' ? '+' : '-'}$${t.amount.toFixed(2)}
          </td>
          <td>${escHtml(t.category.replace(/_/g, ' '))}</td>
          <td>${escHtml(t.merchant.replace(/_/g, ' '))}</td>
          <td style="color:var(--white-60);font-size:0.82rem">
            ${pad(t.day)}/${pad(t.month)}/${t.year} &nbsp; ${pad(t.hour)}:${pad(t.minute)}
          </td>
        </tr>`).join('');
        }
    } catch (e) {
        showToast('Failed to generate report', 'error');
    }
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ⓘ',
    };
    toast.innerHTML = `<span style="font-size:1.1em;font-weight:700">${icons[type]}</span><span>${escHtml(msg)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        toast.addEventListener('animationend', () => toast.remove());
    }, 3200);
}

// ─── Particle Background ─────────────────────────────────────
function initBackground() {
    const canvas = document.getElementById('bg-canvas');
    const ctx = canvas.getContext('2d');
    let W, H, particles;

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }

    function Particle() {
        this.reset = function () {
            this.x = Math.random() * W;
            this.y = Math.random() * H;
            this.r = Math.random() * 1.5 + 0.4;
            this.vx = (Math.random() - 0.5) * 0.3;
            this.vy = (Math.random() - 0.5) * 0.3;
            this.alpha = Math.random() * 0.25 + 0.05;
            this.gold = Math.random() > 0.65;
        };
        this.reset();
        this.update = function () {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
        };
        this.draw = function () {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fillStyle = this.gold
                ? `rgba(240,192,64,${this.alpha})`
                : `rgba(244,246,251,${this.alpha * 0.6})`;
            ctx.fill();
        };
    }

    function init() {
        resize();
        const count = Math.floor((W * H) / 12000);
        particles = Array.from({ length: count }, () => new Particle());
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        // Subtle grid
        ctx.strokeStyle = 'rgba(240,192,64,0.03)';
        ctx.lineWidth = 1;
        const gridSize = 80;
        for (let x = 0; x < W; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y < H; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        // Gradient orbs
        const draw_orb = (cx, cy, r, color) => {
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            g.addColorStop(0, color);
            g.addColorStop(1, 'transparent');
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
        };
        draw_orb(W * 0.1, H * 0.2, 280, 'rgba(240,192,64,0.04)');
        draw_orb(W * 0.9, H * 0.7, 320, 'rgba(232,150,58,0.04)');
        draw_orb(W * 0.5, H * 0.9, 200, 'rgba(240,192,64,0.03)');

        particles.forEach(p => { p.update(); p.draw(); });
    }

    function animate() {
        draw();
        requestAnimationFrame(animate);
    }

    window.addEventListener('resize', init);
    init();
    animate();
}

// ─── Utilities ────────────────────────────────────────────────
async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function animateValue(id, target, isMoney, prefix) {
    const el = document.getElementById(id);
    const start = 0;
    const dur = 900;
    const t0 = performance.now();
    function step(now) {
        const elapsed = Math.min(now - t0, dur);
        const ease = 1 - Math.pow(1 - elapsed / dur, 3);
        const val = start + (target - start) * ease;
        el.textContent = isMoney
            ? `${prefix}${Math.abs(val).toFixed(2)}`
            : Math.round(val).toString();
        if (elapsed < dur) requestAnimationFrame(step);
        else el.textContent = isMoney ? `${prefix}${target.toFixed(2)}` : target.toString();
    }
    requestAnimationFrame(step);
}

function generatePalette(n) {
    const base = [
        'rgba(240,192,64,0.8)',
        'rgba(232,150,58,0.8)',
        'rgba(78,203,141,0.8)',
        'rgba(232,85,106,0.8)',
        'rgba(100,160,240,0.8)',
        'rgba(190,120,240,0.8)',
        'rgba(240,180,100,0.8)',
        'rgba(80,200,200,0.8)',
    ];
    return Array.from({ length: n }, (_, i) => base[i % base.length]);
}

function pad(n) { return String(n).padStart(2, '0'); }

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
