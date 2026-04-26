/**
 * Vaultstone Bank — Enhanced Dashboard JavaScript
 * Panels: Overview, Accounts, Transfers, Cards, Investments, Settings
 */

'use strict';

/* ───────────────────────────────────────────
   UTILITIES
─────────────────────────────────────────── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Body scroll lock for modals/drawers ── */
let _scrollLockCount = 0;
function lockScroll()   { if (++_scrollLockCount === 1) document.body.style.overflow = 'hidden'; }
function unlockScroll() { if (--_scrollLockCount <= 0) { _scrollLockCount = 0; document.body.style.overflow = ''; } }

/* Patch all modal open/close with scroll lock */
function openModal(id)  { document.getElementById(id)?.classList.add('open');    lockScroll(); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); unlockScroll(); }

/* Statements pagination state */
let _stmtPage  = 1;
const _stmtPerPage = 15;
let _stmtMonth = '';
let _stmtYear  = '';

function animateCounter(el, target, duration = 1400, prefix = '', suffix = '') {
  if (reduced) { el.textContent = prefix + target + suffix; return; }
  const start = performance.now();
  const startVal = 0;
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const current = Math.floor(startVal + (target - startVal) * ease);
    el.textContent = prefix + current.toLocaleString() + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function showToast(msg, type = 'info') {
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(toast);
  if (window.gsap) {
    gsap.to(toast, { x: 0, opacity: 1, duration: 0.4, ease: 'power2.out' });
    gsap.to(toast, { x: '110%', opacity: 0, duration: 0.35, ease: 'power2.in', delay: 3.6,
      onComplete: () => toast.remove() });
  } else {
    toast.style.transform = 'translateX(0)'; toast.style.opacity = '1';
    setTimeout(() => toast.remove(), 4000);
  }
}

/* ───────────────────────────────────────────
   SIDEBAR / NAVIGATION
─────────────────────────────────────────── */
const panels = {};
const titleMap = {
  overview: 'Overview',
  accounts: 'My Accounts',
  transfers: 'Transfers',
  cards: 'Cards',
  investments: 'Investments',
  settings: 'Settings'
};

function initNav() {
  $$('.sidebar__link[data-panel]').forEach(btn => {
    panels[btn.dataset.panel] = document.getElementById('panel-' + btn.dataset.panel);
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
  });

  // Hamburger
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const closeBtn = document.getElementById('sidebar-close');

  function openSidebar() {
    sidebar.style.transform = '';
    sidebar.style.opacity = '';
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    lockScroll();
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebar.style.transform = '';
    sidebar.style.opacity = '';
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
    unlockScroll();
  }
  hamburger?.addEventListener('click', openSidebar);
  closeBtn?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);

  // Quick action buttons from overview panel
  document.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => switchPanel(el.dataset.goto));
  });
}

function switchPanel(name) {
  $$('.sidebar__link[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  $$('.panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('panel-' + name);
  if (target) target.classList.add('active');
  const titleEl = document.getElementById('header-title');
  if (titleEl) titleEl.textContent = titleMap[name] || name;

  // Lazy-init panel content
  if (name === 'investments' && !window._investInit) { initInvestPanel(); window._investInit = true; }
  if (name === 'accounts'    && !window._acctInit)   { initAccountsPanel(); window._acctInit = true; }
  if (name === 'cards'       && !window._cardsInit)  { initCardsPanel(); window._cardsInit = true; }
  if (name === 'statements'  && !window._stmtInit) {
    const uid = typeof VaultStore !== 'undefined' ? VaultStore.getCurrentUser()?.id : null;
    if (uid) renderStatements(uid);
    window._stmtInit = true;
  }
  if (name === 'transfers' && !window._xferTabInit) {
    renderMyTransfers();
    window._xferTabInit = true;
  }
}

/* ───────────────────────────────────────────
   THREE.JS — HERO CREDIT CARD SCENE
─────────────────────────────────────────── */
function initHeroScene() {
  const container = document.getElementById('hero-canvas-container');
  if (!container || !window.THREE) return;

  const W = container.clientWidth, H = container.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(0, 0, 4.5);

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xE4C97A, 1.2);
  dirLight.position.set(3, 4, 5);
  scene.add(dirLight);
  const backLight = new THREE.DirectionalLight(0x3B82F6, 0.5);
  backLight.position.set(-3, -2, -3);
  scene.add(backLight);

  // Card geometry
  function makeCard(z, tiltY, tiltX) {
    const geo = new THREE.BoxGeometry(3.2, 2.0, 0.06, 1, 1, 1);
    const mat = new THREE.MeshPhongMaterial({
      color: 0xC9A84C,
      shininess: 120,
      specular: 0xE4C97A,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = z;
    mesh.rotation.y = tiltY;
    mesh.rotation.x = tiltX;
    return mesh;
  }

  const card1 = makeCard(0, 0, 0);
  const card2 = makeCard(-0.25, -0.12, 0.05);
  card2.material = card2.material.clone();
  card2.material.color.set(0x9A7A2E);
  card2.material.opacity = 0.85;
  card2.material.transparent = true;
  scene.add(card2);
  scene.add(card1);

  // Shimmer plane on top of card1
  const shimGeo = new THREE.PlaneGeometry(3.2, 2.0);
  const shimMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const shimmer = new THREE.Mesh(shimGeo, shimMat);
  shimmer.position.z = 0.04;
  card1.add(shimmer);

  // Particles
  const partGeo = new THREE.BufferGeometry();
  const partCount = 60;
  const positions = new Float32Array(partCount * 3);
  for (let i = 0; i < partCount * 3; i++) positions[i] = (Math.random() - 0.5) * 8;
  partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const partMat = new THREE.PointsMaterial({ color: 0xC9A84C, size: 0.04, transparent: true, opacity: 0.4 });
  scene.add(new THREE.Points(partGeo, partMat));

  let time = 0;
  function animate() {
    if (!container.isConnected) return;
    requestAnimationFrame(animate);
    time += 0.012;

    if (!reduced) {
      card1.rotation.y = Math.sin(time * 0.6) * 0.18;
      card1.rotation.x = Math.cos(time * 0.4) * 0.08;
      card1.position.y = Math.sin(time * 0.7) * 0.06;
      card2.rotation.y = card1.rotation.y - 0.12;
      card2.rotation.x = card1.rotation.x + 0.05;
      card2.position.y = card1.position.y - 0.05;
      shimMat.opacity = (Math.sin(time * 1.5) + 1) * 0.05;
    }
    renderer.render(scene, camera);
  }
  animate();

  // GSAP entrance
  if (window.gsap) {
    gsap.from(card1.position, { z: -4, duration: 1.2, ease: 'power2.out' });
    gsap.from(card2.position, { z: -4.5, duration: 1.4, ease: 'power2.out', delay: 0.1 });
  }

  window.addEventListener('resize', () => {
    const nw = container.clientWidth, nh = container.clientHeight;
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
  });
}

/* ───────────────────────────────────────────
   OVERVIEW PANEL
─────────────────────────────────────────── */
function initOverviewPanel(user) {
  // Animated balance counter — use real data when available
  const balEl = document.getElementById('balance-counter');
  if (balEl) {
    const balance = user?.balance ?? 142850.47;
    const whole   = Math.floor(balance);
    const cents   = (balance % 1).toFixed(2).slice(1); // ".47"
    setTimeout(() => animateCounter(balEl, whole, 1600, '$', ''), 400);
    setTimeout(() => { if (balEl) balEl.textContent = '$' + balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }, 2100);
  }

  // Balance change label
  const balChange = document.getElementById('balance-change-label');
  if (balChange && user) {
    balChange.textContent = user.status === 'active' ? '↑ +2.4% this month' : '⏳ Pending activation';
  }

  // Income/Expense counters from real transactions
  const incEl = document.getElementById('income-counter');
  const expEl = document.getElementById('expense-counter');
  const incLabel = document.getElementById('income-label');
  const expLabel = document.getElementById('expense-label');

  if (user && typeof VaultStore !== 'undefined') {
    const txs = VaultStore.getUserTransactions(user.id);
    const now = new Date();
    const thisMonth = txs.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const income  = thisMonth.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
    const expense = thisMonth.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
    if (incEl) setTimeout(() => animateCounter(incEl, Math.round(income),  1200, '$'), 600);
    if (expEl) setTimeout(() => animateCounter(expEl, Math.round(expense), 1200, '$'), 800);
    if (incLabel) incLabel.textContent = thisMonth.filter(t => t.type === 'credit').length + ' transactions';
    if (expLabel) expLabel.textContent = thisMonth.filter(t => t.type === 'debit').length  + ' transactions';
  } else {
    if (incEl) setTimeout(() => animateCounter(incEl, 12400, 1200, '$'), 600);
    if (expEl) setTimeout(() => animateCounter(expEl, 4280,  1200, '$'), 800);
  }

  // Portfolio area chart
  const portfolioCtx = document.getElementById('portfolio-chart')?.getContext('2d');
  if (portfolioCtx && window.Chart) {
    const labels = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
    const data = [118000, 123500, 129800, 127200, 136000, 142850];
    const gradient = portfolioCtx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(201,168,76,0.35)');
    gradient.addColorStop(1, 'rgba(201,168,76,0.01)');
    new Chart(portfolioCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: '#C9A84C',
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.45,
          pointRadius: 4,
          pointBackgroundColor: '#C9A84C',
          pointBorderColor: '#0A0E1A',
          pointBorderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => '$' + ctx.parsed.y.toLocaleString() } } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6B7280' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6B7280', callback: v => '$' + (v/1000).toFixed(0) + 'k' } }
        }
      }
    });
  }
}

/* ───────────────────────────────────────────
   ACCOUNTS PANEL
─────────────────────────────────────────── */
function initAccountsPanel() {
  // 3D tilt effect on account cards
  $$('.acct-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mx', x + '%');
      card.style.setProperty('--my', y + '%');
      if (!reduced) {
        const rotY = ((e.clientX - rect.left) / rect.width - 0.5) * 10;
        const rotX = -((e.clientY - rect.top) / rect.height - 0.5) * 8;
        card.style.transform = `perspective(800px) rotateY(${rotY}deg) rotateX(${rotX}deg) translateZ(4px)`;
      }
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });

  // Sparkline charts per account
  const sparkData = [
    [420, 380, 450, 510, 490, 560, 580],
    [890, 920, 870, 950, 1020, 980, 1100],
    [1800, 1950, 1820, 2100, 2250, 2180, 2400]
  ];
  $$('.sparkline').forEach((canvas, i) => {
    if (!window.Chart) return;
    const ctx = canvas.getContext('2d');
    const d = sparkData[i] || sparkData[0];
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: d.map(() => ''),
        datasets: [{ data: d, borderColor: '#C9A84C', borderWidth: 2, fill: false, tension: 0.4, pointRadius: 0 }]
      },
      options: {
        responsive: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  });

  document.getElementById('open-new-acct-btn')?.addEventListener('click', () => {
    showToast('New account application submitted. Our team will review it within 1–2 business days.', 'success');
  });
}

/* ───────────────────────────────────────────
   TRANSFERS PANEL
─────────────────────────────────────────── */
function initTransfersPanel() {
  /* ── Sub-tab switching (Send / My Transfers / Scheduled) ── */
  $$('.tab-btn[data-transfer-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn[data-transfer-tab]').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      $$('.transfer-tab-content').forEach(tc => {
        const isTarget = tc.id === 'transfer-tab-' + btn.dataset.transferTab;
        tc.style.display = isTarget ? '' : 'none';
        tc.classList.toggle('active', isTarget);
      });
      if (btn.dataset.transferTab === 'my-transfers') renderMyTransfers();
    });
  });

  /*
   * All remaining interactions use event delegation from #panel-transfers.
   * This is necessary because dashboard-supabase.js clones and replaces
   * #transfer-form to remove the wireTransferForm listener, which would
   * destroy any direct listeners attached to child elements.
   */
  const panel = document.getElementById('panel-transfers');
  if (!panel) return;

  /* ── Input events (recipient search + fee calculation) ── */
  panel.addEventListener('input', e => {

    /* Recipient search */
    if (e.target.id === 'recipient-input') {
      const val          = e.target.value.toLowerCase().trim();
      const dropdown     = document.getElementById('recipient-dropdown');
      const internalInfo = document.getElementById('internal-recipient-info');
      const extFields    = document.getElementById('external-fields');
      if (!dropdown) return;

      if (!val) {
        dropdown.classList.remove('visible');
        if (internalInfo) internalInfo.style.display = 'none';
        if (extFields)    extFields.style.display    = 'none';
        return;
      }

      /* "External" keyword → show bank details fields */
      if (val === 'external' || val.startsWith('external ')) {
        if (extFields)    extFields.style.display    = 'block';
        if (internalInfo) internalInfo.style.display = 'none';
        dropdown.classList.remove('visible');
        return;
      }
      if (extFields) extFields.style.display = 'none';

      /* Search real users from VaultStore cache */
      const currentId = typeof VaultStore !== 'undefined' ? VaultStore.getCurrentUser()?.id : null;
      const users = (typeof VaultStore !== 'undefined' ? VaultStore.getUsers() : [])
        .filter(u => u.id !== currentId)
        .filter(u =>
          u.name.toLowerCase().includes(val) ||
          (u.email || '').toLowerCase().includes(val)
        )
        .slice(0, 6);

      if (!users.length) { dropdown.classList.remove('visible'); return; }

      dropdown.innerHTML = users.map(u => `
        <div class="recipient-item" data-name="${u.name}"
             data-account="${u.accountNumber || '—'}" data-uid="${u.id}">
          <div class="avatar" style="width:32px;height:32px;font-size:0.75rem;flex-shrink:0">
            ${u.avatar || u.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:500">${u.name}</div>
            <div style="font-size:0.75rem;color:var(--muted)">${u.accountNumber || u.email || ''}</div>
          </div>
        </div>`).join('');
      dropdown.classList.add('visible');
    }

    /* Live fee calculation */
    if (e.target.id === 'transfer-amount') {
      const amount = parseFloat(e.target.value) || 0;
      const fee    = amount >= 10000 ? +(amount * 0.001).toFixed(2) : 0;
      const total  = amount + fee;
      const fmt    = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const feeAmountEl  = document.getElementById('fee-amount');
      const feeDisplayEl = document.getElementById('fee-display');
      const feeTotalEl   = document.getElementById('fee-total');
      const summaryEl    = document.getElementById('transfer-summary');
      const summaryText  = document.getElementById('summary-text');
      if (feeAmountEl)  feeAmountEl.textContent  = fmt(amount);
      if (feeDisplayEl) feeDisplayEl.textContent = fmt(fee);
      if (feeTotalEl)   feeTotalEl.textContent   = fmt(total);
      if (summaryEl && summaryText) {
        if (amount > 0) {
          const recip = (document.getElementById('recipient-input')?.value || 'recipient').trim();
          summaryText.textContent =
            `Sending ${fmt(amount)} to ${recip}. Processing fee: ${fmt(fee)}. Total deducted: ${fmt(total)}.`;
          summaryEl.style.display = 'block';
        } else {
          summaryEl.style.display = 'none';
        }
      }
    }
  });

  /* ── Click events (dropdown select, clear button, close dropdown) ── */
  panel.addEventListener('click', e => {
    /* Recipient dropdown item selected */
    const item = e.target.closest('.recipient-item');
    if (item) {
      const recipientInput = document.getElementById('recipient-input');
      const dropdown       = document.getElementById('recipient-dropdown');
      const internalInfo   = document.getElementById('internal-recipient-info');
      if (recipientInput) recipientInput.value = item.dataset.name;
      if (dropdown)       dropdown.classList.remove('visible');
      if (internalInfo) {
        internalInfo.style.display = 'block';
        const avatarEl = document.getElementById('sel-recipient-avatar');
        const nameEl   = document.getElementById('sel-recipient-name');
        const acctEl   = document.getElementById('sel-recipient-acct');
        if (avatarEl) avatarEl.textContent = item.dataset.name.slice(0, 2).toUpperCase();
        if (nameEl)   nameEl.textContent   = item.dataset.name;
        if (acctEl)   acctEl.textContent   = item.dataset.account || '—';
      }
      return;
    }

    /* Clear recipient button */
    if (e.target.closest('#clear-recipient-btn')) {
      const recipientInput = document.getElementById('recipient-input');
      const dropdown       = document.getElementById('recipient-dropdown');
      const internalInfo   = document.getElementById('internal-recipient-info');
      const extFields      = document.getElementById('external-fields');
      if (recipientInput) recipientInput.value      = '';
      if (dropdown)       dropdown.classList.remove('visible');
      if (internalInfo)   internalInfo.style.display = 'none';
      if (extFields)      extFields.style.display    = 'none';
      return;
    }
  });

  /* Close dropdown when clicking outside the panel */
  document.addEventListener('click', e => {
    if (!e.target.closest('#panel-transfers')) {
      document.getElementById('recipient-dropdown')?.classList.remove('visible');
    }
  });
}

/* ───────────────────────────────────────────
   CARDS PANEL
─────────────────────────────────────────── */
function initCardsPanel() {
  const wrapper = document.querySelector('.cc-card-wrapper');
  if (wrapper) {
    wrapper.addEventListener('click', () => wrapper.classList.toggle('flipped'));
    const hint = wrapper.querySelector('.cc-hint');
    if (hint) hint.textContent = 'Click card to reveal details';
  }

  // Freeze toggle
  const freezeToggle = document.getElementById('freeze-toggle');
  if (freezeToggle && wrapper) {
    freezeToggle.addEventListener('change', () => {
      wrapper.classList.toggle('frozen', freezeToggle.checked);
      showToast(freezeToggle.checked ? 'Card frozen successfully.' : 'Card unfrozen.', freezeToggle.checked ? 'warning' : 'success');
    });
  }

  // Spending limit range
  const limitRange = document.getElementById('limit-range');
  const limitDisplay = document.getElementById('limit-display');
  if (limitRange && limitDisplay) {
    limitRange.addEventListener('input', () => {
      limitDisplay.textContent = '$' + parseInt(limitRange.value).toLocaleString();
    });
  }

  document.getElementById('add-new-card-btn')?.addEventListener('click', () => {
    showToast('Card request submitted. Your new Vaultstone Visa Infinite card will arrive within 5–7 business days.', 'success');
  });

  // Card preferences — persist to localStorage
  const cardPrefs = [
    ['pref-contactless',  'Contactless Payments'],
    ['pref-online',       'Online Transactions'],
    ['pref-international','International Payments'],
    ['pref-atm',          'ATM Withdrawals'],
  ];
  cardPrefs.forEach(([id, label]) => {
    const toggle = document.getElementById(id);
    if (!toggle) return;
    const stored = localStorage.getItem('vs_card_' + id);
    if (stored !== null) toggle.checked = stored === 'true';
    toggle.addEventListener('change', () => {
      localStorage.setItem('vs_card_' + id, toggle.checked);
      showToast(`${label} ${toggle.checked ? 'enabled' : 'disabled'}.`, toggle.checked ? 'success' : 'warning');
    });
  });
}

/* ───────────────────────────────────────────
   THREE.JS — INVESTMENT TORUS / DONUT
─────────────────────────────────────────── */
function initInvestPanel() {
  const container = document.getElementById('invest-canvas');
  if (container && window.THREE) try {

  const W = container.clientWidth, H = container.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
  camera.position.set(0, 0, 6);

  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);
  const dLight = new THREE.DirectionalLight(0xffffff, 1);
  dLight.position.set(4, 5, 5);
  scene.add(dLight);

  const allocations = [
    { label: 'Stocks', pct: 0.45, color: 0xC9A84C },
    { label: 'Bonds', pct: 0.25, color: 0x3B82F6 },
    { label: 'ETFs', pct: 0.20, color: 0x10B981 },
    { label: 'Crypto', pct: 0.10, color: 0xEF4444 },
  ];

  const group = new THREE.Group();
  let startAngle = 0;
  const GAP = 0.04;

  allocations.forEach((alloc) => {
    const arc = alloc.pct * Math.PI * 2 - GAP;
    const tGeo = new THREE.TorusGeometry(1.8, 0.55, 16, 80, arc);
    const tMat = new THREE.MeshPhongMaterial({ color: alloc.color, shininess: 80 });
    const torus = new THREE.Mesh(tGeo, tMat);
    torus.rotation.z = startAngle + GAP / 2;
    group.add(torus);
    startAngle += alloc.pct * Math.PI * 2;
  });

  scene.add(group);

  // Center text sphere
  const centerGeo = new THREE.SphereGeometry(0.9, 32, 32);
  const centerMat = new THREE.MeshPhongMaterial({ color: 0x111827 });
  scene.add(new THREE.Mesh(centerGeo, centerMat));

  // Animate in
  if (window.gsap && !reduced) {
    group.scale.set(0.1, 0.1, 0.1);
    gsap.to(group.scale, { x: 1, y: 1, z: 1, duration: 0.9, ease: 'power2.out' });
  }

  let t2 = 0;
  function animate2() {
    if (!container.isConnected) return;
    requestAnimationFrame(animate2);
    if (!reduced) { t2 += 0.005; group.rotation.z = t2; }
    renderer.render(scene, camera);
  }
  animate2();
  } catch (e) { console.warn('[Dashboard] Invest Three.js error:', e); }

  // Performance Chart.js
  const perfCtx = document.getElementById('perf-chart')?.getContext('2d');
  if (perfCtx && window.Chart) {
    const months = ['Oct','Nov','Dec','Jan','Feb','Mar','Apr'];
    const g2 = perfCtx.createLinearGradient(0, 0, 0, 200);
    g2.addColorStop(0, 'rgba(16,185,129,0.3)');
    g2.addColorStop(1, 'rgba(16,185,129,0.0)');
    new Chart(perfCtx, {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          label: 'Portfolio',
          data: [72000, 75400, 79200, 77800, 83100, 87500, 89340],
          borderColor: '#10B981',
          borderWidth: 2.5,
          backgroundColor: g2,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#10B981',
          pointBorderColor: '#0A0E1A',
          pointBorderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6B7280' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6B7280', callback: v => '$' + (v/1000).toFixed(0) + 'k' } }
        }
      }
    });
  }

  document.getElementById('rebalance-btn')?.addEventListener('click', () => {
    showToast('Portfolio rebalance request submitted. Our advisors will review and execute within 24 hours.', 'info');
  });
  document.getElementById('invest-btn')?.addEventListener('click', () => { openModal('invest-modal'); });
}

/* ───────────────────────────────────────────
   SETTINGS PANEL
─────────────────────────────────────────── */
function initSettingsPanel() {
  // Theme toggle — persist and restore
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const savedTheme = localStorage.getItem('vs_theme');
    if (savedTheme === 'light') {
      themeToggle.checked = true;
      document.documentElement.setAttribute('data-theme', 'light');
    }
    themeToggle.addEventListener('change', () => {
      const isLight = themeToggle.checked;
      document.documentElement.setAttribute('data-theme', isLight ? 'light' : '');
      localStorage.setItem('vs_theme', isLight ? 'light' : 'dark');
      showToast(isLight ? 'Light theme applied.' : 'Dark theme applied.', 'info');
    });
  }

  // 2FA toggle
  const twoFA = document.getElementById('2fa-toggle');
  const qrSection = document.getElementById('2fa-qr-section');
  if (twoFA && qrSection) {
    twoFA.addEventListener('change', () => {
      qrSection.style.display = twoFA.checked ? 'flex' : 'none';
      showToast(twoFA.checked ? 'Scan QR code with your authenticator app.' : '2FA disabled.', twoFA.checked ? 'info' : 'warning');
    });
  }

  /* Password strength meter */
  const pwInput = document.getElementById('new-password-input');
  const pwBar   = document.getElementById('pw-strength-bar');
  const pwLabel = document.getElementById('pw-strength-label');
  if (pwInput && pwBar && pwLabel) {
    pwInput.addEventListener('input', () => {
      const v = pwInput.value;
      if (!v) { pwBar.style.width = '0%'; pwLabel.textContent = 'Strength: —'; return; }
      let score = 0;
      if (v.length >= 8)          score++;
      if (/[A-Z]/.test(v))        score++;
      if (/[0-9]/.test(v))        score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;
      const levels = [
        ['10%', 'var(--red)',   'Strength: Too short'],
        ['25%', 'var(--red)',   'Strength: Weak'],
        ['50%', '#F59E0B',      'Strength: Fair'],
        ['75%', '#F59E0B',      'Strength: Good'],
        ['100%','var(--green)', 'Strength: Strong'],
      ];
      const [w, c, t] = levels[score] || levels[0];
      pwBar.style.width      = w;
      pwBar.style.background = c;
      pwLabel.textContent    = t;
    });
  }

  // Generate simple QR visual (decorative)
  const qrCanvas = document.getElementById('qr-canvas');
  if (qrCanvas) {
    const ctx = qrCanvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 120, 120);
    ctx.fillStyle = '#000';
    const size = 6;
    const pattern = [
      [1,1,1,1,1,1,1,0,0,1,0,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,1,0,1,0,1,0,1,0,0,0,0,0,1],
      [1,0,1,1,1,0,1,0,0,1,0,0,1,0,1,1,1,0,1],
      [1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,1,1,0,1],
      [1,0,1,1,1,0,1,0,0,0,1,0,1,0,1,1,1,0,1],
      [1,0,0,0,0,0,1,0,1,0,0,0,1,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,0,1,0,1,0,1,1,1,1,1,1,1],
      [0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0],
      [1,0,1,1,0,1,1,1,0,1,0,1,1,0,0,1,0,1,1],
      [0,1,0,0,1,0,0,0,1,0,1,0,0,1,0,0,1,0,0],
      [1,1,1,1,1,1,1,0,0,0,1,0,1,1,1,1,1,1,1],
    ];
    pattern.forEach((row, r) => row.forEach((v, c) => {
      if (v) ctx.fillRect(c * (120/row.length), r * (120/pattern.length), 120/row.length - 0.5, 120/pattern.length - 0.5);
    }));
  }

  // Notification preferences — persist to localStorage
  const notifPrefs = [
    ['notif-pref-transactions', 'Transaction alerts'],
    ['notif-pref-transfers',    'Transfer alerts'],
    ['notif-pref-statements',   'Monthly statements'],
    ['notif-pref-promo',        'Promotional emails'],
    ['notif-pref-invest',       'Investment updates'],
  ];
  notifPrefs.forEach(([id, label]) => {
    const toggle = document.getElementById(id);
    if (!toggle) return;
    const stored = localStorage.getItem('vs_notif_' + id);
    if (stored !== null) toggle.checked = stored === 'true';
    toggle.addEventListener('change', () => {
      localStorage.setItem('vs_notif_' + id, toggle.checked);
      showToast(`${label} ${toggle.checked ? 'enabled' : 'disabled'}.`, toggle.checked ? 'success' : 'warning');
    });
  });
}

/* ───────────────────────────────────────────
   VAULTSTORE — LOAD REAL USER DATA
─────────────────────────────────────────── */
function loadUserData() {
  if (typeof VaultStore === 'undefined') return null;
  const user = VaultStore.requireAuth();
  if (!user) return null;

  /* KYC pending banner */
  if (user.kycStatus !== 'approved' || user.status !== 'active') {
    const banner = document.createElement('div');
    banner.id = 'kyc-banner';
    banner.style.cssText = [
      'background:rgba(245,158,11,0.12)',
      'border:1px solid rgba(245,158,11,0.3)',
      'border-radius:8px',
      'padding:0.75rem 1.25rem',
      'font-size:0.875rem',
      'color:#FCD34D',
      'display:flex',
      'align-items:center',
      'gap:0.75rem',
      'margin-bottom:1.25rem',
    ].join(';');
    const label = user.kycStatus === 'under_review'
      ? '🕐  Your identity documents are under review. Full access unlocks once approved (1–2 business days).'
      : '⚠️  Identity verification required. <a href="kyc.html" style="color:#C9A84C;font-weight:600;text-decoration:underline">Complete KYC →</a>';
    banner.innerHTML = label;
    const contentArea = document.querySelector('.content-area');
    if (contentArea) contentArea.prepend(banner);
  }

  /* Sidebar user info */
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const sidebarName   = document.getElementById('sidebar-name');
  const sidebarAcct   = document.getElementById('sidebar-account');
  const sidebarBadge  = document.getElementById('sidebar-status-badge');
  const headerAvatar  = document.getElementById('header-avatar');

  if (sidebarAvatar) sidebarAvatar.textContent = user.avatar || (user.name || 'U').slice(0,2).toUpperCase();
  if (sidebarName)   sidebarName.textContent   = user.name || 'Unknown';
  if (sidebarAcct)   sidebarAcct.textContent   = user.accountNumber || '— — — —';
  if (headerAvatar)  headerAvatar.textContent   = user.avatar || (user.name || 'U').slice(0,2).toUpperCase();

  if (sidebarBadge) {
    const statusMap = { active: ['badge-green', 'Active'], pending: ['badge-yellow', 'Pending'], pending_kyc: ['badge-yellow', 'KYC'], suspended: ['badge-red', 'Suspended'] };
    const [cls, lbl] = statusMap[user.status] || ['badge-muted', user.status];
    sidebarBadge.className = 'badge ' + cls;
    sidebarBadge.textContent = lbl;
  }

  /* Profile form pre-fill */
  const profileName  = document.getElementById('profile-name');
  const profileEmail = document.getElementById('profile-email');
  const profilePhone = document.getElementById('profile-phone');
  if (profileName)  profileName.value  = user.name  || '';
  if (profileEmail) profileEmail.value = user.email || '';
  if (profilePhone) profilePhone.value = user.phone || '';

  /* Receive modal account details */
  const receiveAcctEl = document.getElementById('receive-account-number');
  const receiveNameEl = document.getElementById('receive-name');
  if (receiveAcctEl) receiveAcctEl.textContent = user.accountNumber || '—';
  if (receiveNameEl) receiveNameEl.textContent = user.name || '—';

  /* Card panel — populate holder name and masked number from account */
  const cardHolder    = document.getElementById('card-holder-name');
  const cardNumMasked = document.getElementById('card-number-masked');
  const cardNumFull   = document.getElementById('card-number-full');
  const cardBackNum   = document.getElementById('card-back-number');
  const last4 = user.cardNumber || (user.accountNumber || '').replace(/\D/g, '').slice(-4) || '——';
  if (cardHolder)    cardHolder.textContent    = user.name || '—';
  if (cardNumMasked) cardNumMasked.textContent = `•••• •••• •••• ${last4}`;
  if (cardNumFull)   cardNumFull.textContent   = `•••• •••• •••• ${last4}`;
  if (cardBackNum)   cardBackNum.textContent   = last4;

  /* Transfer scene — "from" node */
  const fromNodeAcct = document.getElementById('from-node-acct');
  if (fromNodeAcct) fromNodeAcct.textContent = (user.accountNumber || '').slice(-7) || 'My Account';

  /* Account panel balances */
  const checkBal  = document.getElementById('acct-checking-balance');
  const savBal    = document.getElementById('acct-savings-balance');
  const invBal    = document.getElementById('acct-invest-balance');
  const checkNum  = document.getElementById('acct-checking-number');
  const checkAvail = document.getElementById('acct-checking-available');
  const savAvail  = document.getElementById('acct-savings-available');
  const invAvail  = document.getElementById('acct-invest-available');
  const investTotal = document.getElementById('invest-total');
  const investGain  = document.getElementById('invest-gain');

  const fmt = v => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (checkBal)    checkBal.textContent     = fmt(user.balance);
  if (savBal)      savBal.textContent       = fmt(user.savingsBalance);
  if (invBal)      invBal.textContent       = fmt(user.investmentBalance);

  /* Transfer panel available balance */
  const xferBal = document.getElementById('transfer-balance-display');
  if (xferBal) xferBal.textContent = fmt(user.balance);
  if (checkNum)    checkNum.textContent     = user.accountNumber || '—';
  if (checkAvail)  checkAvail.textContent   = fmt(user.balance);
  if (savAvail)    savAvail.textContent     = fmt(user.savingsBalance);
  if (invAvail)    invAvail.textContent     = fmt(user.investmentBalance);
  if (investTotal) investTotal.textContent  = fmt(user.investmentBalance);
  if (investGain)  {
    const gain = user.investmentBalance * 0.184;
    investGain.textContent = '+' + fmt(gain);
  }

  /* Recent transactions */
  renderRecentTransactions(user.id);

  /* Account transaction history */
  renderAccountTransactions(user.id);

  return user;
}

function renderRecentTransactions(userId) {
  const tbody = document.getElementById('recent-tx-tbody');
  if (!tbody || typeof VaultStore === 'undefined') return;
  const txs = VaultStore.getUserTransactions(userId).slice(0, 8);
  if (!txs.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:2rem">No transactions yet.</td></tr>';
    return;
  }
  tbody.innerHTML = txs.map(tx => {
    const isCredit = tx.type === 'credit';
    const d = new Date(tx.date);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `<tr>
      <td style="font-weight:500">${tx.description}</td>
      <td style="color:var(--muted);font-size:0.8rem">${dateStr}</td>
      <td><span class="badge badge-muted" style="font-size:0.7rem">${tx.category}</span></td>
      <td style="text-align:right;font-weight:600;color:${isCredit ? 'var(--green)' : 'var(--text)'}">
        ${isCredit ? '+' : '−'}$${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
    </tr>`;
  }).join('');
}

function renderAccountTransactions(userId) {
  const tbody = document.getElementById('acct-tx-tbody');
  if (!tbody || typeof VaultStore === 'undefined') return;
  const txs = VaultStore.getUserTransactions(userId).slice(0, 15);
  if (!txs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem">No transactions yet.</td></tr>';
    return;
  }
  tbody.innerHTML = txs.map(tx => {
    const isCredit = tx.type === 'credit';
    const d = new Date(tx.date);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const fmt = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<tr>
      <td style="font-weight:500">${tx.description}</td>
      <td style="color:var(--muted);font-size:0.8rem">${dateStr}</td>
      <td><span class="badge badge-muted" style="font-size:0.7rem">${tx.category}</span></td>
      <td style="text-align:right;font-weight:600;color:${isCredit ? 'var(--green)' : 'var(--red)'}">
        ${isCredit ? '+' : '−'}${fmt(tx.amount)}
      </td>
      <td style="text-align:right;color:var(--muted);font-size:0.8rem">${fmt(tx.balance)}</td>
    </tr>`;
  }).join('');
}

/* ── My Transfers table ── */
function renderMyTransfers() {
  const tbody = document.getElementById('my-transfers-tbody');
  if (!tbody || typeof VaultStore === 'undefined') return;
  const transfers = typeof VaultStore.getTransfers === 'function' ? VaultStore.getTransfers() : [];

  if (!transfers.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem">No transfers yet.</td></tr>';
    return;
  }

  const statusColors = { pending: 'badge-yellow', approved: 'badge-green', rejected: 'badge-red', processing: 'badge-blue' };
  const fmt = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  tbody.innerHTML = [...transfers]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50)
    .map(t => {
      const dateStr = new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const cls     = statusColors[t.status] || 'badge-muted';
      return `<tr>
        <td style="font-weight:500">${t.toName || '—'}</td>
        <td style="color:var(--muted);font-size:0.8rem">${t.toBank || '—'}</td>
        <td style="color:var(--muted);font-size:0.8rem">${dateStr}</td>
        <td style="text-align:right;font-weight:600">${fmt(t.amount)}</td>
        <td style="text-align:right">
          <span class="badge ${cls}" style="font-size:0.7rem;text-transform:capitalize">${t.status}</span>
        </td>
      </tr>`;
    }).join('');
}

/* ── Statements table with filter + pagination ── */
function renderStatements(userId) {
  const tbody = document.getElementById('statements-tbody');
  if (!tbody || typeof VaultStore === 'undefined') return;

  const uid = userId || VaultStore.getCurrentUser()?.id;
  if (!uid) return;

  let txs = [...VaultStore.getUserTransactions(uid)]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (_stmtMonth !== '') txs = txs.filter(t => new Date(t.date).getMonth() === parseInt(_stmtMonth));
  if (_stmtYear  !== '') txs = txs.filter(t => new Date(t.date).getFullYear() === parseInt(_stmtYear));

  const total = txs.length;
  const pages = Math.ceil(total / _stmtPerPage) || 1;
  _stmtPage   = Math.min(_stmtPage, pages);
  const slice = txs.slice((_stmtPage - 1) * _stmtPerPage, _stmtPage * _stmtPerPage);
  const fmt   = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (!slice.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem">No transactions found.</td></tr>';
  } else {
    tbody.innerHTML = slice.map(tx => {
      const isCredit = tx.type === 'credit';
      const dateStr  = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `<tr>
        <td style="color:var(--muted);font-size:0.8rem">${dateStr}</td>
        <td style="font-weight:500">${tx.description}</td>
        <td><span class="badge badge-muted" style="font-size:0.7rem">${tx.category || '—'}</span></td>
        <td style="text-align:right;font-weight:500;color:var(--red)">${isCredit ? '—' : fmt(tx.amount)}</td>
        <td style="text-align:right;font-weight:500;color:var(--green)">${isCredit ? fmt(tx.amount) : '—'}</td>
        <td style="text-align:right;color:var(--muted);font-size:0.8rem">${tx.balance ? fmt(tx.balance) : '—'}</td>
      </tr>`;
    }).join('');
  }

  /* Pagination controls */
  const pg = document.getElementById('stmt-pagination');
  if (pg) {
    if (pages <= 1) { pg.innerHTML = ''; return; }
    pg.innerHTML = Array.from({ length: pages }, (_, i) => i + 1)
      .map(i => `<button class="btn btn-ghost btn-sm${i === _stmtPage ? ' active' : ''}" data-stmt-page="${i}">${i}</button>`)
      .join('');
    pg.querySelectorAll('[data-stmt-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        _stmtPage = parseInt(btn.dataset.stmtPage);
        renderStatements(uid);
      });
    });
  }
}

/* ── Notifications drawer ── */
function loadNotifications(userId) {
  if (typeof VaultStore === 'undefined') return;
  const notifs = VaultStore.getNotifications(userId);
  const unread  = VaultStore.getUnreadCount(userId);

  const badge    = document.getElementById('notif-badge');
  const labelEl  = document.getElementById('notif-unread-label');
  const listEl   = document.getElementById('notif-list');

  if (badge) {
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
  }
  if (labelEl) labelEl.textContent = unread > 0 ? `${unread} unread notification${unread !== 1 ? 's' : ''}` : 'All caught up';

  if (listEl) {
    if (!notifs.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:2.5rem 1rem;color:var(--muted)">No notifications yet.</div>';
      return;
    }
    const typeColors = { success: 'var(--green)', error: 'var(--red)', warning: '#F59E0B', info: 'var(--blue)' };
    listEl.innerHTML = notifs.map(n => {
      const d = new Date(n.createdAt);
      const time = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `<div class="notif-item${n.read ? '' : ' notif-item--unread'}" data-id="${n.id}"
        style="padding:1rem 1.25rem;border-bottom:1px solid var(--border2);cursor:pointer;transition:background 0.18s;${n.read ? '' : 'background:rgba(201,168,76,0.04);'}">
        <div style="display:flex;gap:0.75rem;align-items:flex-start">
          <div style="width:8px;height:8px;border-radius:50%;background:${typeColors[n.type] || 'var(--muted)'};flex-shrink:0;margin-top:0.35rem"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:0.875rem;font-weight:${n.read ? '400' : '600'}">${n.title}</div>
            <div style="font-size:0.8125rem;color:var(--muted);line-height:1.5;margin-top:0.2rem">${n.message}</div>
            <div style="font-size:0.75rem;color:var(--muted2);margin-top:0.35rem">${time}</div>
          </div>
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', () => {
        VaultStore.markNotificationRead(item.dataset.id);
        item.classList.remove('notif-item--unread');
        item.style.background = '';
        item.querySelector('div > div > div:first-child').style.fontWeight = '400';
        loadNotifications(userId);
      });
    });
  }
}

function openNotifDrawer(userId) {
  loadNotifications(userId);
  document.getElementById('notif-drawer')?.classList.add('open');
  document.getElementById('notif-backdrop')?.classList.add('open');
  document.getElementById('notif-drawer')?.setAttribute('aria-hidden', 'false');
  lockScroll();
}

function closeNotifDrawer() {
  document.getElementById('notif-drawer')?.classList.remove('open');
  document.getElementById('notif-backdrop')?.classList.remove('open');
  document.getElementById('notif-drawer')?.setAttribute('aria-hidden', 'true');
  unlockScroll();
}

/* ── Wire transfer form to VaultStore ── */
function wireTransferForm(user) {
  if (!user || typeof VaultStore === 'undefined') return;
  const form = document.getElementById('transfer-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const recipientInput = document.getElementById('recipient-input');
    const amountInput    = document.getElementById('transfer-amount');
    const noteInput      = document.getElementById('transfer-note');
    const currencyEl     = document.getElementById('transfer-currency');

    const recipient = recipientInput?.value?.trim();
    const amount    = parseFloat(amountInput?.value || '0');

    if (!recipient || !amount || amount <= 0) {
      showToast('Please fill in recipient and amount.', 'warning');
      return;
    }
    if (amount > user.balance) {
      showToast('Insufficient funds for this transfer.', 'error');
      return;
    }

    const allUsers  = VaultStore.getUsers();
    const recipUser = allUsers.find(u => u.name.toLowerCase() === recipient.toLowerCase() && u.id !== user.id);

    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }

    const result = await VaultStore.createTransfer({
      fromUserId:      user.id,
      fromName:        user.name,
      toUserId:        recipUser?.id || null,
      toName:          recipient,
      toAccountNumber: recipUser?.accountNumber || document.getElementById('ext-account-number')?.value || '',
      toBank:          recipUser ? 'Vaultstone Bank' : (document.getElementById('ext-bank-name')?.value || 'External Bank'),
      amount,
      currency:        currencyEl?.value || 'USD',
      note:            noteInput?.value?.trim() || '',
      type:            recipUser ? 'internal' : 'external',
    });

    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }

    if (!result) {
      showToast('Transfer failed. Please try again.', 'error');
      return;
    }

    const orb      = document.getElementById('transfer-orb');
    const path     = document.querySelector('.transfer-path');
    const destName = document.getElementById('dest-node-name');
    if (destName) destName.textContent = recipient;

    const _resetForm = () => {
      form.reset();
      if (destName) destName.textContent = 'Recipient';
      const infoEl = document.getElementById('internal-recipient-info');
      const extEl  = document.getElementById('external-fields');
      const sumEl  = document.getElementById('transfer-summary');
      if (infoEl) infoEl.style.display = 'none';
      if (extEl)  extEl.style.display  = 'none';
      if (sumEl)  sumEl.style.display  = 'none';
      ['fee-amount','fee-display','fee-total'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '$0.00';
      });
    };

    if (orb && window.gsap && !reduced) {
      orb.style.display = 'block';
      const pathW = document.querySelector('.transfer-scene')?.offsetWidth || 200;
      if (path) path.classList.add('animating');
      gsap.fromTo(orb, { x: 0, opacity: 1, scale: 1 }, {
        x: pathW, opacity: 0, scale: 0.3, duration: 0.9, ease: 'power2.in',
        onComplete: () => {
          orb.style.display = 'none';
          if (path) path.classList.remove('animating');
          showToast(`Transfer of $${amount.toLocaleString()} to ${recipient} submitted for approval.`, 'success');
          _resetForm();
        },
      });
    } else {
      showToast(`Transfer of $${amount.toLocaleString()} to ${recipient} submitted for approval.`, 'success');
      _resetForm();
    }
  });
}

/* ───────────────────────────────────────────
   INIT ALL
─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  /* Wait for Supabase session cache to populate (no-op with localStorage VaultStore) */
  if (typeof VaultStore !== 'undefined' && VaultStore.ready instanceof Promise) {
    await VaultStore.ready;
  }

  /* Auth guard — also redirect admins to their own panel */
  if (typeof VaultStore !== 'undefined') {
    const _u = VaultStore.getCurrentUser();
    if (_u && _u.role === 'admin') { window.location.href = 'admin.html'; return; }
  }

  /* Auth guard + load real user data */
  const currentUser = (typeof VaultStore !== 'undefined') ? loadUserData() : null;

  initNav();
  try { initOverviewPanel(currentUser); } catch (e) { console.warn('[Dashboard] Overview init error:', e); }
  try { initHeroScene(); } catch (e) { console.warn('[Dashboard] Hero scene error:', e); }
  initTransfersPanel();
  initSettingsPanel();

  /* Default active panel */
  switchPanel('overview');

  /* GSAP entrance animation for sidebar */
  if (window.gsap && !reduced) {
    gsap.from('.sidebar', { x: -30, opacity: 0, duration: 0.6, ease: 'power2.out' });
    gsap.from('.top-header', { y: -20, opacity: 0, duration: 0.5, ease: 'power2.out', delay: 0.1 });
    gsap.from('.kpi-card', { y: 20, opacity: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out', delay: 0.25 });
  }

  /* Notification bell */
  const notifBtn = document.getElementById('notif-btn');
  if (notifBtn && currentUser) {
    notifBtn.addEventListener('click', () => openNotifDrawer(currentUser.id));
  }

  /* Notifications drawer close */
  document.getElementById('notif-close-btn')?.addEventListener('click', closeNotifDrawer);
  document.getElementById('notif-backdrop')?.addEventListener('click', closeNotifDrawer);
  document.getElementById('mark-all-read-btn')?.addEventListener('click', () => {
    if (currentUser && typeof VaultStore !== 'undefined') {
      VaultStore.markAllRead(currentUser.id);
      loadNotifications(currentUser.id);
      showToast('All notifications marked as read.', 'info');
    }
  });

  /* Receive modal */
  document.getElementById('receive-btn')?.addEventListener('click', () => { openModal('receive-modal'); });
  document.getElementById('receive-modal-close')?.addEventListener('click', () => { closeModal('receive-modal'); });
  document.getElementById('receive-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('receive-modal');
  });
  document.getElementById('copy-account-btn')?.addEventListener('click', () => {
    const acct = document.getElementById('receive-account-number')?.textContent || '';
    navigator.clipboard?.writeText(acct).catch(() => {});
    showToast('Account number copied to clipboard.', 'success');
  });

  /* Close account modal */
  document.getElementById('close-account-btn')?.addEventListener('click', () => { openModal('close-account-modal'); });
  document.getElementById('close-account-cancel-btn')?.addEventListener('click', () => { closeModal('close-account-modal'); });
  document.getElementById('close-account-modal-close')?.addEventListener('click', () => { closeModal('close-account-modal'); });
  document.getElementById('close-account-submit-btn')?.addEventListener('click', () => {
    const confirmInput = document.getElementById('close-confirm-input');
    if (confirmInput?.value !== 'CLOSE MY ACCOUNT') {
      showToast('Please type "CLOSE MY ACCOUNT" to confirm.', 'warning');
      return;
    }
    closeModal('close-account-modal');
    showToast('Account closure request submitted. You will be contacted within 3 business days.', 'info');
  });

  /* Logout */
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (typeof VaultStore !== 'undefined') VaultStore.logout();
    showToast('Signing out…', 'info');
    setTimeout(() => { window.location.href = 'login.html'; }, 1000);
  });

  /* CSV download for accounts — real export */
  document.getElementById('acct-csv-btn')?.addEventListener('click', () => {
    if (typeof VaultStore === 'undefined') return;
    const uid = VaultStore.getCurrentUser()?.id;
    if (!uid) return;
    const txs = [...VaultStore.getUserTransactions(uid)];
    if (!txs.length) { showToast('No transactions to export.', 'warning'); return; }
    const rows = [['Date','Description','Category','Type','Amount','Balance']];
    txs.forEach(tx => rows.push([
      new Date(tx.date).toLocaleDateString('en-US'),
      '"' + (tx.description || '').replace(/"/g, '""') + '"',
      tx.category || '',
      tx.type,
      tx.amount.toFixed(2),
      (tx.balance || 0).toFixed(2),
    ]));
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `vaultstone-transactions-${new Date().toISOString().slice(0,10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV downloaded.', 'success');
  });

  /* Wire transfer form to VaultStore */
  if (currentUser) wireTransferForm(currentUser);

  /* ── Refresh transfers button ── */
  document.getElementById('refresh-transfers-btn')?.addEventListener('click', async () => {
    if (typeof VaultStore === 'undefined') return;
    const u = VaultStore.getCurrentUser();
    if (!u) return;
    showToast('Refreshing transfers…', 'info');
    if (typeof VaultStore.loadDashboardData === 'function') await VaultStore.loadDashboardData(u.id);
    renderMyTransfers();
    showToast('Transfers updated.', 'success');
  });

  /* ── Statements filter helpers ── */
  function _applyStmtFilter() {
    _stmtPage  = 1;
    _stmtMonth = document.getElementById('stmt-month')?.value ?? '';
    _stmtYear  = document.getElementById('stmt-year')?.value  ?? '';
    const uid  = typeof VaultStore !== 'undefined' ? VaultStore.getCurrentUser()?.id : null;
    if (uid) { renderStatements(uid); window._stmtInit = true; }
  }

  document.getElementById('stmt-filter-btn')?.addEventListener('click', _applyStmtFilter);

  document.getElementById('stmt-clear-btn')?.addEventListener('click', () => {
    const monthEl = document.getElementById('stmt-month');
    const yearEl  = document.getElementById('stmt-year');
    if (monthEl) monthEl.value = '';
    if (yearEl)  yearEl.value  = '';
    _stmtMonth = '';
    _stmtYear  = '';
    _stmtPage  = 1;
    const uid  = typeof VaultStore !== 'undefined' ? VaultStore.getCurrentUser()?.id : null;
    if (uid) { renderStatements(uid); window._stmtInit = true; }
  });

  /* ── Invest modal ── */
  document.getElementById('invest-modal-close')?.addEventListener('click', () => { closeModal('invest-modal'); });
  document.getElementById('invest-cancel-btn')?.addEventListener('click', () => { closeModal('invest-modal'); });
  document.getElementById('invest-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('invest-modal');
  });
  document.getElementById('invest-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const amount   = parseFloat(document.getElementById('invest-amount-input')?.value || '0');
    const assetEl  = document.getElementById('invest-asset');
    const assetLbl = assetEl?.options[assetEl.selectedIndex]?.text || 'Stocks';
    if (!amount || amount < 100) { showToast('Minimum investment is $100.00.', 'warning'); return; }
    closeModal('invest-modal');
    document.getElementById('invest-form')?.reset();
    showToast(`Investment of $${amount.toLocaleString()} in ${assetLbl} submitted. Funds will be allocated next business day.`, 'success');
  });

  /* ── New Scheduled Transfer modal ── */
  document.getElementById('new-schedule-btn')?.addEventListener('click', () => {
    const schedDate = document.getElementById('sched-start-date');
    if (schedDate && !schedDate.value) {
      const t = new Date(); t.setDate(t.getDate() + 1);
      schedDate.value = t.toISOString().split('T')[0];
    }
    openModal('schedule-modal');
  });
  document.getElementById('schedule-modal-close')?.addEventListener('click', () => { closeModal('schedule-modal'); });
  document.getElementById('schedule-cancel-btn')?.addEventListener('click', () => { closeModal('schedule-modal'); });
  document.getElementById('schedule-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('schedule-modal');
  });
  document.getElementById('schedule-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const recipient = document.getElementById('sched-recipient')?.value.trim();
    const amount    = parseFloat(document.getElementById('sched-amount')?.value || '0');
    const frequency = document.getElementById('sched-frequency')?.value;
    const startDate = document.getElementById('sched-start-date')?.value;
    if (!recipient || !amount || !startDate) { showToast('Please fill in all required fields.', 'warning'); return; }
    const freqLbl  = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly' }[frequency] || frequency;
    const dateLbl  = new Date(startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    closeModal('schedule-modal');
    document.getElementById('schedule-form')?.reset();
    showToast(`${freqLbl} transfer of $${amount.toLocaleString()} to ${recipient} scheduled from ${dateLbl}.`, 'success');
  });

  /* Header avatar → navigate to settings */
  document.getElementById('header-avatar')?.addEventListener('click', () => switchPanel('settings'));

  /* ── Statements CSV download ── */
  document.getElementById('download-csv-btn')?.addEventListener('click', () => {
    if (typeof VaultStore === 'undefined') return;
    const uid = VaultStore.getCurrentUser()?.id;
    if (!uid) return;

    let txs = [...VaultStore.getUserTransactions(uid)]
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (_stmtMonth !== '') txs = txs.filter(t => new Date(t.date).getMonth() === parseInt(_stmtMonth));
    if (_stmtYear  !== '') txs = txs.filter(t => new Date(t.date).getFullYear() === parseInt(_stmtYear));

    if (!txs.length) { showToast('No transactions to export.', 'warning'); return; }

    const rows = [['Date', 'Description', 'Category', 'Type', 'Amount', 'Balance']];
    txs.forEach(tx => rows.push([
      new Date(tx.date).toLocaleDateString('en-US'),
      '"' + (tx.description || '').replace(/"/g, '""') + '"',
      tx.category || '',
      tx.type,
      tx.amount.toFixed(2),
      (tx.balance || 0).toFixed(2),
    ]));

    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `vaultstone-statements-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV downloaded.', 'success');
  });

  /* ── Mobile FAB → jump to Transfers panel ── */
  document.getElementById('mobile-fab')?.addEventListener('click', () => {
    switchPanel('transfers');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ── Header search → filter account transaction history ── */
  document.getElementById('header-search')?.addEventListener('input', function () {
    const query = this.value.toLowerCase().trim();
    const tbody = document.getElementById('acct-tx-tbody');
    if (!tbody) return;

    if (!query) {
      if (currentUser) renderAccountTransactions(currentUser.id);
      return;
    }

    if (typeof VaultStore === 'undefined' || !currentUser) return;
    const txs = VaultStore.getUserTransactions(currentUser.id).filter(tx =>
      tx.description.toLowerCase().includes(query) ||
      (tx.category  || '').toLowerCase().includes(query)
    );

    if (!txs.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem">No transactions match your search.</td></tr>';
      return;
    }
    const fmt = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    tbody.innerHTML = txs.slice(0, 50).map(tx => {
      const isCredit = tx.type === 'credit';
      const dateStr  = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `<tr>
        <td style="font-weight:500">${tx.description}</td>
        <td style="color:var(--muted);font-size:0.8rem">${dateStr}</td>
        <td><span class="badge badge-muted" style="font-size:0.7rem">${tx.category}</span></td>
        <td style="text-align:right;font-weight:600;color:${isCredit ? 'var(--green)' : 'var(--red)'}">
          ${isCredit ? '+' : '−'}${fmt(tx.amount)}
        </td>
        <td style="text-align:right;color:var(--muted);font-size:0.8rem">${tx.balance ? fmt(tx.balance) : '—'}</td>
      </tr>`;
    }).join('');

    if (!document.getElementById('panel-accounts')?.classList.contains('active')) {
      switchPanel('accounts');
    }
  });
});
