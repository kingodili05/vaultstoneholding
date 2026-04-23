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
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
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
  if (name === 'accounts' && !window._acctInit) { initAccountsPanel(); window._acctInit = true; }
  if (name === 'cards' && !window._cardsInit) { initCardsPanel(); window._cardsInit = true; }
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
}

/* ───────────────────────────────────────────
   TRANSFERS PANEL
─────────────────────────────────────────── */
function initTransfersPanel() {
  const contacts = [
    { name: 'Sarah Johnson', account: '****4521', initials: 'SJ' },
    { name: 'Michael Chen', account: '****8834', initials: 'MC' },
    { name: 'Emma Wilson', account: '****2217', initials: 'EW' },
    { name: 'David Park', account: '****6650', initials: 'DP' },
    { name: 'Lisa Torres', account: '****9943', initials: 'LT' },
  ];

  const recipientInput = document.getElementById('recipient-input');
  const dropdown = document.getElementById('recipient-dropdown');

  if (recipientInput && dropdown) {
    recipientInput.addEventListener('input', () => {
      const val = recipientInput.value.toLowerCase().trim();
      if (!val) { dropdown.classList.remove('visible'); return; }
      const filtered = contacts.filter(c => c.name.toLowerCase().includes(val));
      dropdown.innerHTML = filtered.map(c => `
        <div class="recipient-item" data-name="${c.name}" data-account="${c.account}">
          <div class="avatar">${c.initials}</div>
          <div><div style="font-weight:500">${c.name}</div><div style="font-size:0.75rem;color:var(--muted)">${c.account}</div></div>
        </div>`).join('');
      dropdown.classList.toggle('visible', filtered.length > 0);
      $$('.recipient-item', dropdown).forEach(item => {
        item.addEventListener('click', () => {
          recipientInput.value = item.dataset.name;
          dropdown.classList.remove('visible');
        });
      });
    });
    document.addEventListener('click', e => {
      if (!recipientInput.contains(e.target) && !dropdown.contains(e.target))
        dropdown.classList.remove('visible');
    });
  }

  // Transfer form submit
  const transferForm = document.getElementById('transfer-form');
  const transferOrb = document.getElementById('transfer-orb');
  const transferPath = document.querySelector('.transfer-path');

  if (transferForm) {
    transferForm.addEventListener('submit', e => {
      e.preventDefault();
      const recipient = recipientInput?.value?.trim();
      const amount = document.getElementById('transfer-amount')?.value;
      if (!recipient || !amount) { showToast('Please fill in all required fields.', 'warning'); return; }
      animateTransfer(recipient, amount);
    });
  }

  function animateTransfer(recipient, amount) {
    if (transferOrb && window.gsap && !reduced) {
      transferOrb.style.display = 'block';
      const scene = document.querySelector('.transfer-scene');
      const sceneRect = scene.getBoundingClientRect();
      const pathW = scene.querySelector('.transfer-path')?.offsetWidth || 200;

      if (transferPath) transferPath.classList.add('animating');

      gsap.fromTo(transferOrb,
        { x: 0, opacity: 1, scale: 1 },
        { x: pathW + 20, opacity: 0, scale: 0.3, duration: 0.9, ease: 'power2.in',
          onComplete: () => {
            transferOrb.style.display = 'none';
            if (transferPath) transferPath.classList.remove('animating');
            showToast(`Sent $${parseFloat(amount).toLocaleString()} to ${recipient}`, 'success');
            document.getElementById('transfer-form').reset();
          }
        }
      );
    } else {
      showToast(`Sent $${parseFloat(amount).toLocaleString()} to ${recipient}`, 'success');
      document.getElementById('transfer-form').reset();
    }
  }

  // Tab switching (Send / International)
  $$('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.tabs').nextElementSibling?.parentElement || btn.closest('.card');
      $$('.tab-btn', btn.closest('.tabs')).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.tab-content', group).forEach(tc => tc.classList.toggle('active', tc.dataset.tabContent === btn.dataset.tab));
    });
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
}

/* ───────────────────────────────────────────
   THREE.JS — INVESTMENT TORUS / DONUT
─────────────────────────────────────────── */
function initInvestPanel() {
  const container = document.getElementById('invest-canvas');
  if (!container || !window.THREE) return;

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
}

/* ───────────────────────────────────────────
   SETTINGS PANEL
─────────────────────────────────────────── */
function initSettingsPanel() {
  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('change', () => {
      document.documentElement.setAttribute('data-theme', themeToggle.checked ? 'light' : '');
      showToast(themeToggle.checked ? 'Light theme applied.' : 'Dark theme applied.', 'info');
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

  // Profile form
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', e => {
      e.preventDefault();
      showToast('Profile updated successfully.', 'success');
    });
  }

  // Password form
  const pwForm = document.getElementById('password-form');
  if (pwForm) {
    pwForm.addEventListener('submit', e => {
      e.preventDefault();
      const np = pwForm.querySelector('[name=new-password]')?.value;
      const cp = pwForm.querySelector('[name=confirm-password]')?.value;
      if (!np || np.length < 8) { showToast('Password must be at least 8 characters.', 'error'); return; }
      if (np !== cp) { showToast('Passwords do not match.', 'error'); return; }
      showToast('Password changed successfully.', 'success');
      pwForm.reset();
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

  if (sidebarAvatar) sidebarAvatar.textContent = user.avatar || user.name.slice(0,2).toUpperCase();
  if (sidebarName)   sidebarName.textContent   = user.name;
  if (sidebarAcct)   sidebarAcct.textContent   = user.accountNumber || '— — — —';
  if (headerAvatar)  headerAvatar.textContent   = user.avatar || user.name.slice(0,2).toUpperCase();

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
}

function closeNotifDrawer() {
  document.getElementById('notif-drawer')?.classList.remove('open');
  document.getElementById('notif-backdrop')?.classList.remove('open');
  document.getElementById('notif-drawer')?.setAttribute('aria-hidden', 'true');
}

/* ── Wire transfer form to VaultStore ── */
function wireTransferForm(user) {
  if (!user || typeof VaultStore === 'undefined') return;
  const form = document.getElementById('transfer-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const recipientInput = document.getElementById('recipient-input');
    const amountInput    = document.getElementById('transfer-amount');
    const noteInput      = document.getElementById('transfer-note');

    const recipient = recipientInput?.value?.trim();
    const amount    = parseFloat(amountInput?.value || '0');
    if (!recipient || !amount || amount <= 0) {
      showToast('Please fill in all required fields.', 'warning');
      return;
    }
    if (amount > user.balance) {
      showToast('Insufficient funds for this transfer.', 'error');
      return;
    }

    /* Find internal recipient by name */
    const allUsers = VaultStore.getUsers();
    const recipUser = allUsers.find(u => u.name.toLowerCase() === recipient.toLowerCase() && u.id !== user.id);

    VaultStore.createTransfer({
      fromUserId:      user.id,
      fromName:        user.name,
      toUserId:        recipUser?.id || null,
      toName:          recipient,
      toAccountNumber: recipUser?.accountNumber || document.getElementById('ext-account-number')?.value || '',
      toBank:          recipUser ? 'Vaultstone Bank' : (document.getElementById('ext-bank-name')?.value || 'External Bank'),
      amount,
      currency:        'USD',
      note:            noteInput?.value?.trim() || '',
      type:            recipUser ? 'internal' : 'external',
    });

    /* Animate the transfer orb */
    const orb  = document.getElementById('transfer-orb');
    const path = document.querySelector('.transfer-path');
    const destName = document.getElementById('dest-node-name');
    if (destName) destName.textContent = recipient;

    if (orb && window.gsap && !reduced) {
      orb.style.display = 'block';
      const pathW = document.querySelector('.transfer-scene')?.offsetWidth || 200;
      if (path) path.classList.add('animating');
      gsap.fromTo(orb, { x: 0, opacity: 1, scale: 1 },
        { x: pathW, opacity: 0, scale: 0.3, duration: 0.9, ease: 'power2.in', onComplete: () => {
          orb.style.display = 'none';
          if (path) path.classList.remove('animating');
          showToast(`Transfer of $${amount.toLocaleString()} to ${recipient} submitted for approval.`, 'success');
          form.reset();
          if (destName) destName.textContent = 'Recipient';
        }});
    } else {
      showToast(`Transfer of $${amount.toLocaleString()} to ${recipient} submitted.`, 'success');
      form.reset();
    }
  }, true);
}

/* ───────────────────────────────────────────
   INIT ALL
─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  /* Auth guard + load real user data */
  const currentUser = (typeof VaultStore !== 'undefined') ? loadUserData() : null;

  initNav();
  initOverviewPanel(currentUser);
  initHeroScene();
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
  document.getElementById('receive-btn')?.addEventListener('click', () => {
    document.getElementById('receive-modal')?.classList.add('open');
  });
  document.getElementById('receive-modal-close')?.addEventListener('click', () => {
    document.getElementById('receive-modal')?.classList.remove('open');
  });
  document.getElementById('receive-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });
  document.getElementById('copy-account-btn')?.addEventListener('click', () => {
    const acct = document.getElementById('receive-account-number')?.textContent || '';
    navigator.clipboard?.writeText(acct).catch(() => {});
    showToast('Account number copied to clipboard.', 'success');
  });

  /* Close account modal */
  document.getElementById('close-account-btn')?.addEventListener('click', () => {
    document.getElementById('close-account-modal')?.classList.add('open');
  });
  document.getElementById('close-account-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('close-account-modal')?.classList.remove('open');
  });
  document.getElementById('close-account-modal-close')?.addEventListener('click', () => {
    document.getElementById('close-account-modal')?.classList.remove('open');
  });
  document.getElementById('close-account-submit-btn')?.addEventListener('click', () => {
    const confirmInput = document.getElementById('close-confirm-input');
    if (confirmInput?.value !== 'CLOSE MY ACCOUNT') {
      showToast('Please type "CLOSE MY ACCOUNT" to confirm.', 'warning');
      return;
    }
    document.getElementById('close-account-modal')?.classList.remove('open');
    showToast('Account closure request submitted. You will be contacted within 3 business days.', 'info');
  });

  /* Logout */
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (typeof VaultStore !== 'undefined') VaultStore.logout();
    showToast('Signing out…', 'info');
    setTimeout(() => { window.location.href = 'login.html'; }, 1000);
  });

  /* CSV download for accounts */
  document.getElementById('acct-csv-btn')?.addEventListener('click', () => {
    showToast('Downloading transaction history…', 'info');
    setTimeout(() => showToast('CSV saved: transactions.csv', 'success'), 1200);
  });

  /* Wire transfer form to VaultStore */
  if (currentUser) wireTransferForm(currentUser);
});
