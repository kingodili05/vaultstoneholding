/**
 * Vaultstone Bank — Admin Panel JavaScript
 * Panels: Overview, Users, Transactions, Analytics, Security
 */

'use strict';

/* ───────────────────────────────────────────
   UTILITIES
─────────────────────────────────────────── */
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animateCounter(el, target, duration = 1400, prefix = '', suffix = '') {
  if (!el) return;
  if (reduced) { el.textContent = prefix + target.toLocaleString() + suffix; return; }
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + Math.floor(target * ease).toLocaleString() + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function showToast(msg, type = 'info') {
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const container = document.getElementById('toast-container');
  if (!container) return;
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
   NAVIGATION
─────────────────────────────────────────── */
const panelInited = {};

function switchPanel(name) {
  document.querySelectorAll('.sidebar__link[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('panel-' + name);
  if (target) target.classList.add('active');
  const titles = { overview: 'Overview', users: 'User Management', transactions: 'Transactions',
                   analytics: 'Analytics', security: 'Security Center', settings: 'System Settings' };
  const titleEl = document.getElementById('header-title');
  if (titleEl) titleEl.textContent = titles[name] || name;

  if (!panelInited[name]) {
    panelInited[name] = true;
    if (name === 'overview') initOverviewPanel();
    if (name === 'transactions') initTransactionsPanel();
    if (name === 'analytics') initAnalyticsPanel();
    if (name === 'security') initSecurityPanel();
  }
}

function initNav() {
  document.querySelectorAll('.sidebar__link[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
  });

  // Hamburger
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const closeBtn = document.getElementById('sidebar-close');

  function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('visible'); }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('visible'); }
  hamburger?.addEventListener('click', openSidebar);
  closeBtn?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);

  // Logout button
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    showToast('Logging out…', 'info');
    setTimeout(() => window.location.href = 'index.html', 1500);
  });
}

/* ───────────────────────────────────────────
   OVERVIEW PANEL — KPIs, Globe, Activity, Health
─────────────────────────────────────────── */
function initOverviewPanel() {
  // KPI counters
  const kpis = [
    ['kpi-users', 42847], ['kpi-sessions', 1284], ['kpi-flagged', 23]
  ];
  kpis.forEach(([id, val]) => animateCounter(document.getElementById(id), val, 1400));

  // Volume counter (special: $2.4B)
  const volEl = document.getElementById('kpi-volume');
  if (volEl) setTimeout(() => { volEl.textContent = '$2.4B'; }, 400);

  initGlobe();
  initActivityFeed();
  initHealthBars();
}

/* ── 3D Globe ── */
function initGlobe() {
  const container = document.getElementById('globe-container');
  if (!container || !window.THREE) return;

  const W = container.clientWidth, H = container.clientHeight || 320;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.z = 3.2;

  // Ambient + directional
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const dLight = new THREE.DirectionalLight(0xC9A84C, 0.8);
  dLight.position.set(3, 3, 3);
  scene.add(dLight);
  const bLight = new THREE.DirectionalLight(0x06B6D4, 0.4);
  bLight.position.set(-3, -2, 1);
  scene.add(bLight);

  // Globe sphere
  const globeGeo = new THREE.SphereGeometry(1, 64, 64);
  const globeMat = new THREE.MeshPhongMaterial({
    color: 0x0d1a33,
    emissive: 0x061020,
    wireframe: false,
    shininess: 40,
  });
  const globe = new THREE.Mesh(globeGeo, globeMat);
  scene.add(globe);

  // Wireframe overlay
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0xC9A84C, wireframe: true, transparent: true, opacity: 0.06
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.002, 32, 32), wireMat));

  // Glow ring
  const ringGeo = new THREE.TorusGeometry(1.1, 0.008, 16, 100);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x06B6D4, transparent: true, opacity: 0.5 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI * 0.4;
  scene.add(ring);

  // Hotspots (lat/lon → xyz on sphere)
  const latLons = [
    [40.7, -74.0], [51.5, -0.1], [35.7, 139.7], [-33.9, 151.2],
    [48.9, 2.3], [1.3, 103.8], [19.1, 72.9], [25.2, 55.3],
    [37.6, -122.4], [-23.5, -46.6],
  ];
  const dotGeo = new THREE.SphereGeometry(0.025, 8, 8);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xC9A84C });
  const cyanMat = new THREE.MeshBasicMaterial({ color: 0x06B6D4 });

  function latLonToVec3(lat, lon, r = 1.01) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  const dotPositions = latLons.map(([lat, lon]) => latLonToVec3(lat, lon));
  dotPositions.forEach((pos, i) => {
    const dot = new THREE.Mesh(dotGeo, i % 2 === 0 ? dotMat : cyanMat);
    dot.position.copy(pos);
    globe.add(dot);
  });

  // Arc lines between selected pairs
  const pairs = [[0,1],[1,2],[2,3],[4,5],[6,7],[0,8],[3,9]];
  pairs.forEach(([a, b]) => {
    const p1 = dotPositions[a], p2 = dotPositions[b];
    const mid = p1.clone().add(p2).multiplyScalar(0.5).normalize().multiplyScalar(1.35);
    const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
    const points = curve.getPoints(40);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xC9A84C, transparent: true, opacity: 0.35
    });
    const line = new THREE.Line(lineGeo, lineMat);
    globe.add(line);
  });

  // Atmosphere glow
  const atmGeo = new THREE.SphereGeometry(1.12, 32, 32);
  const atmMat = new THREE.MeshBasicMaterial({
    color: 0x06B6D4, transparent: true, opacity: 0.04, side: THREE.BackSide
  });
  scene.add(new THREE.Mesh(atmGeo, atmMat));

  let angle = 0;
  function animate() {
    if (!container.isConnected) return;
    requestAnimationFrame(animate);
    if (!reduced) {
      angle += 0.003;
      globe.rotation.y = angle;
      ring.rotation.z = angle * 0.3;
    }
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    const nw = container.clientWidth, nh = container.clientHeight;
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
  });
}

/* ── Activity Feed ── */
const feedEvents = [
  { color: 'green', text: '<strong>New user</strong> registered — priya.sharma@gmail.com' },
  { color: 'blue',  text: '<strong>Wire transfer</strong> of $142,000 approved — Acct #8821' },
  { color: 'red',   text: '<strong>Failed login</strong> attempt from IP 185.220.101.45' },
  { color: 'gold',  text: '<strong>Wealth account</strong> opened — James Whitfield' },
  { color: 'green', text: '<strong>KYC verified</strong> for user carlos.mendes@corp.mx' },
  { color: 'red',   text: '<strong>Transaction flagged</strong> — risk score 92 on TXN-00882' },
  { color: 'blue',  text: '<strong>API health check</strong> passed — all systems nominal' },
  { color: 'gold',  text: '<strong>Monthly statement</strong> generated for 42,847 users' },
  { color: 'green', text: '<strong>Deposit</strong> of $250,000 — Business acct #4429' },
  { color: 'red',   text: '<strong>Suspicious pattern</strong> detected — user ID 10284' },
  { color: 'blue',  text: '<strong>Support ticket</strong> resolved — ticket #TK-1881' },
  { color: 'gold',  text: '<strong>Rate updated</strong> — EUR/USD 1.0892' },
];

let feedIdx = 0;
function initActivityFeed() {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;

  // Seed initial entries
  const initial = feedEvents.slice(0, 5);
  initial.forEach(ev => appendFeedItem(feed, ev));
  feedIdx = 5;

  // Auto-append every 3 seconds
  setInterval(() => {
    const ev = feedEvents[feedIdx % feedEvents.length];
    feedIdx++;
    appendFeedItem(feed, ev);
    // Remove oldest if too many
    while (feed.children.length > 12) feed.removeChild(feed.firstChild);
  }, 3000);
}

function appendFeedItem(feed, ev) {
  const item = document.createElement('div');
  item.className = 'activity-item';
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  item.innerHTML = `<div class="activity-dot ${ev.color}"></div><div class="activity-text">${ev.text}</div><div class="activity-time">${time}</div>`;
  feed.appendChild(item);
  feed.scrollTop = feed.scrollHeight;
}

/* ── System Health Bars ── */
function initHealthBars() {
  const bars = [
    { id: 'health-cpu',    val: 34, color: '#10B981', label: 'CPU', suffix: '%' },
    { id: 'health-mem',    val: 67, color: '#F59E0B', label: 'Memory', suffix: '%' },
    { id: 'health-api',    val: 45, color: '#3B82F6', label: 'API Latency', suffix: 'ms' },
    { id: 'health-disk',   val: 52, color: '#C9A84C', label: 'Disk', suffix: '%' },
  ];
  bars.forEach(b => {
    const fill = document.getElementById(b.id);
    if (fill) {
      fill.style.background = b.color;
      setTimeout(() => { fill.style.width = b.val + '%'; }, 300);
    }
  });
}

/* ───────────────────────────────────────────
   USERS PANEL
─────────────────────────────────────────── */
const usersData = [
  { id: 1, name: 'Alex Morgan',     email: 'alex.morgan@gmail.com',    type: 'personal', balance: 142850, status: 'active',    joined: '2022-03-14', initials: 'AM' },
  { id: 2, name: 'Sarah Johnson',   email: 'sjohnson@techcorp.io',     type: 'business', balance: 540200, status: 'active',    joined: '2021-11-02', initials: 'SJ' },
  { id: 3, name: 'Carlos Mendes',   email: 'c.mendes@corp.mx',         type: 'business', balance: 89400,  status: 'active',    joined: '2023-01-08', initials: 'CM' },
  { id: 4, name: 'Priya Sharma',    email: 'priya.sharma@gmail.com',   type: 'personal', balance: 18600,  status: 'pending',   joined: '2024-02-19', initials: 'PS' },
  { id: 5, name: 'James Whitfield', email: 'jwhitfield@wealth.co',     type: 'wealth',   balance: 2840000,status: 'active',    joined: '2020-07-22', initials: 'JW' },
  { id: 6, name: 'Elena Novak',     email: 'enovak@finance.cz',        type: 'personal', balance: 31200,  status: 'suspended', joined: '2022-09-05', initials: 'EN' },
  { id: 7, name: 'David Park',      email: 'dpark@seoultech.kr',       type: 'business', balance: 210500, status: 'active',    joined: '2021-05-30', initials: 'DP' },
  { id: 8, name: 'Fatima Al-Rashid',email: 'f.alrashid@gulf.ae',      type: 'wealth',   balance: 1120000,status: 'active',    joined: '2020-12-11', initials: 'FA' },
  { id: 9, name: 'Michael Chen',    email: 'mchen@globallog.com',      type: 'business', balance: 67300,  status: 'active',    joined: '2023-04-17', initials: 'MC' },
  { id: 10,name: 'Olivia Turner',   email: 'olivia.t@personal.net',    type: 'personal', balance: 9800,   status: 'suspended', joined: '2024-01-03', initials: 'OT' },
  { id: 11,name: 'Rajan Iyer',      email: 'rajan.iyer@bankco.in',     type: 'personal', balance: 44700,  status: 'pending',   joined: '2024-03-28', initials: 'RI' },
  { id: 12,name: 'Sophie Laurent',  email: 's.laurent@banque.fr',      type: 'wealth',   balance: 990000, status: 'active',    joined: '2021-08-14', initials: 'SL' },
];

let filteredUsers = [...usersData];
let selectedUsers = new Set();
let sortCol = null, sortDir = 1;

function renderUsersTable() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  tbody.innerHTML = filteredUsers.map(u => `
    <tr data-id="${u.id}" class="${selectedUsers.has(u.id) ? 'selected' : ''}">
      <td><input type="checkbox" class="row-check" data-id="${u.id}" ${selectedUsers.has(u.id) ? 'checked' : ''}></td>
      <td><div style="display:flex;align-items:center;gap:0.75rem"><div class="avatar">${u.initials}</div><div><div style="font-weight:500">${u.name}</div></div></div></td>
      <td style="color:var(--muted2)">${u.email}</td>
      <td><span class="badge ${u.type === 'wealth' ? 'badge-gold' : u.type === 'business' ? 'badge-blue' : 'badge-muted'}">${u.type}</span></td>
      <td style="font-weight:600">$${u.balance.toLocaleString()}</td>
      <td><span class="badge ${u.status === 'active' ? 'badge-green' : u.status === 'suspended' ? 'badge-red' : 'badge-yellow'}">${u.status}</span></td>
      <td style="color:var(--muted2)">${u.joined}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-ghost btn-icon btn-sm view-user" data-id="${u.id}" title="View" aria-label="View user">
            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="btn btn-ghost btn-icon btn-sm edit-user" data-id="${u.id}" title="Edit" aria-label="Edit user">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-ghost btn-icon btn-sm suspend-user" data-id="${u.id}" title="${u.status === 'suspended' ? 'Activate' : 'Suspend'}" aria-label="${u.status === 'suspended' ? 'Activate' : 'Suspend'} user">
            <svg viewBox="0 0 24 24">${u.status === 'suspended'
              ? '<polyline points="20 6 9 17 4 12"/>'
              : '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>'}
            </svg>
          </button>
          <button class="btn btn-danger btn-icon btn-sm delete-user" data-id="${u.id}" title="Delete" aria-label="Delete user">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');

  // Bind row actions
  tbody.querySelectorAll('.view-user').forEach(btn => btn.addEventListener('click', () => openViewUser(+btn.dataset.id)));
  tbody.querySelectorAll('.edit-user').forEach(btn => btn.addEventListener('click', () => openEditUser(+btn.dataset.id)));
  tbody.querySelectorAll('.suspend-user').forEach(btn => btn.addEventListener('click', () => toggleSuspend(+btn.dataset.id)));
  tbody.querySelectorAll('.delete-user').forEach(btn => btn.addEventListener('click', () => confirmDeleteUser(+btn.dataset.id)));
  tbody.querySelectorAll('.row-check').forEach(cb => cb.addEventListener('change', () => {
    const id = +cb.dataset.id;
    cb.checked ? selectedUsers.add(id) : selectedUsers.delete(id);
    updateBulkBar();
    const row = tbody.querySelector(`tr[data-id="${id}"]`);
    if (row) row.classList.toggle('selected', cb.checked);
  }));

  updateBulkBar();
}

function filterUsers() {
  const search = document.getElementById('user-search')?.value.toLowerCase() || '';
  const status = document.getElementById('filter-status')?.value || '';
  const type   = document.getElementById('filter-type')?.value || '';
  filteredUsers = usersData.filter(u => {
    const matchSearch = !search || u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search);
    const matchStatus = !status || u.status === status;
    const matchType   = !type   || u.type === type;
    return matchSearch && matchStatus && matchType;
  });
  if (sortCol !== null) {
    filteredUsers.sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
    });
  }
  renderUsersTable();
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const countEl = document.getElementById('bulk-count');
  if (bar && countEl) {
    bar.classList.toggle('visible', selectedUsers.size > 0);
    countEl.textContent = selectedUsers.size + ' user' + (selectedUsers.size !== 1 ? 's' : '');
  }
}

function toggleSuspend(id) {
  const u = usersData.find(x => x.id === id);
  if (!u) return;
  u.status = u.status === 'suspended' ? 'active' : 'suspended';
  filterUsers();
  showToast(`${u.name} ${u.status === 'suspended' ? 'suspended' : 'activated'}.`, u.status === 'suspended' ? 'warning' : 'success');
}

function confirmDeleteUser(id) {
  const u = usersData.find(x => x.id === id);
  if (!u) return;
  openConfirmModal(
    'Delete User',
    `Are you sure you want to permanently delete <strong>${u.name}</strong>? This action cannot be undone.`,
    'Delete', 'btn-danger',
    () => {
      const idx = usersData.findIndex(x => x.id === id);
      if (idx > -1) usersData.splice(idx, 1);
      filterUsers();
      showToast(`User ${u.name} deleted.`, 'error');
    }
  );
}

function openEditUser(id) {
  const u = usersData.find(x => x.id === id);
  if (!u) return;
  const drawer = document.getElementById('edit-drawer');
  const backdrop = document.getElementById('edit-drawer-backdrop');
  if (!drawer) return;

  document.getElementById('edit-name').value = u.name;
  document.getElementById('edit-email').value = u.email;
  document.getElementById('edit-type').value = u.type;
  document.getElementById('edit-status').value = u.status;
  document.getElementById('edit-balance').value = u.balance;

  drawer.dataset.editId = id;
  drawer.classList.add('open');
  backdrop.classList.add('open');
  document.getElementById('edit-name').focus();
}

function openViewUser(id) {
  const u = usersData.find(x => x.id === id);
  if (!u) return;
  showToast(`Viewing profile: ${u.name} — Balance: $${u.balance.toLocaleString()}`, 'info');
}

function initUsersPanel() {
  renderUsersTable();

  document.getElementById('user-search')?.addEventListener('input', filterUsers);
  document.getElementById('filter-status')?.addEventListener('change', filterUsers);
  document.getElementById('filter-type')?.addEventListener('change', filterUsers);

  // Sort headers
  document.querySelectorAll('#users-table thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = 1; }
      filterUsers();
    });
  });

  // Select all checkbox
  document.getElementById('select-all')?.addEventListener('change', function () {
    filteredUsers.forEach(u => {
      if (this.checked) selectedUsers.add(u.id); else selectedUsers.delete(u.id);
    });
    renderUsersTable();
  });

  // Bulk actions
  document.getElementById('bulk-suspend')?.addEventListener('click', () => {
    selectedUsers.forEach(id => {
      const u = usersData.find(x => x.id === id);
      if (u) u.status = 'suspended';
    });
    selectedUsers.clear();
    filterUsers();
    showToast('Selected users suspended.', 'warning');
  });
  document.getElementById('bulk-delete')?.addEventListener('click', () => {
    openConfirmModal('Delete Selected', `Delete ${selectedUsers.size} users? This cannot be undone.`, 'Delete All', 'btn-danger', () => {
      selectedUsers.forEach(id => {
        const idx = usersData.findIndex(x => x.id === id);
        if (idx > -1) usersData.splice(idx, 1);
      });
      selectedUsers.clear();
      filterUsers();
      showToast('Selected users deleted.', 'error');
    });
  });
  document.getElementById('bulk-clear')?.addEventListener('click', () => {
    document.querySelectorAll('.row-check').forEach(c => { c.checked = false; });
    selectedUsers.clear();
    document.getElementById('bulk-bar')?.classList.remove('visible');
    renderUsersTable();
  });

  // Edit drawer save
  document.getElementById('edit-save')?.addEventListener('click', () => {
    const id = +document.getElementById('edit-drawer').dataset.editId;
    const u = usersData.find(x => x.id === id);
    if (!u) return;
    u.name    = document.getElementById('edit-name').value;
    u.email   = document.getElementById('edit-email').value;
    u.type    = document.getElementById('edit-type').value;
    u.status  = document.getElementById('edit-status').value;
    u.balance = parseFloat(document.getElementById('edit-balance').value) || u.balance;
    filterUsers();
    closeDrawer();
    showToast('User updated successfully.', 'success');
  });
  document.getElementById('edit-cancel')?.addEventListener('click', closeDrawer);
  document.getElementById('edit-drawer-backdrop')?.addEventListener('click', closeDrawer);
  document.getElementById('edit-drawer-close')?.addEventListener('click', closeDrawer);

  // ESC to close drawer
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
  });
}

function closeDrawer() {
  document.getElementById('edit-drawer')?.classList.remove('open');
  document.getElementById('edit-drawer-backdrop')?.classList.remove('open');
}

/* ───────────────────────────────────────────
   TRANSACTIONS PANEL
─────────────────────────────────────────── */
const txData = [
  { id:'TXN-00001', user:'Alex Morgan',     type:'Debit',    amount:4200,    merchant:'Amazon',       date:'2026-04-21', status:'completed', risk:12 },
  { id:'TXN-00002', user:'James Whitfield', type:'Transfer', amount:142000,  merchant:'Wire — SWIFT', date:'2026-04-21', status:'completed', risk:45 },
  { id:'TXN-00003', user:'Sarah Johnson',   type:'Credit',   amount:25000,   merchant:'ACH Deposit',  date:'2026-04-20', status:'completed', risk:8  },
  { id:'TXN-00004', user:'Elena Novak',     type:'Debit',    amount:1800,    merchant:'Unknown POS',  date:'2026-04-20', status:'flagged',   risk:87 },
  { id:'TXN-00005', user:'Carlos Mendes',   type:'Transfer', amount:88000,   merchant:'Intl Wire',    date:'2026-04-19', status:'pending',   risk:62 },
  { id:'TXN-00006', user:'Priya Sharma',    type:'Credit',   amount:500,     merchant:'Salary',       date:'2026-04-19', status:'completed', risk:5  },
  { id:'TXN-00007', user:'David Park',      type:'Debit',    amount:12400,   merchant:'Seoul Trade',  date:'2026-04-18', status:'completed', risk:18 },
  { id:'TXN-00008', user:'Fatima Al-Rashid',type:'Transfer', amount:500000,  merchant:'Dubai RE',     date:'2026-04-18', status:'completed', risk:30 },
  { id:'TXN-00009', user:'Olivia Turner',   type:'Debit',    amount:340,     merchant:'Casino',       date:'2026-04-17', status:'flagged',   risk:91 },
  { id:'TXN-00010', user:'Michael Chen',    type:'Credit',   amount:9800,    merchant:'Invoice #402', date:'2026-04-17', status:'completed', risk:7  },
  { id:'TXN-00011', user:'Rajan Iyer',      type:'Debit',    amount:220,     merchant:'FX Bureau',    date:'2026-04-16', status:'completed', risk:24 },
  { id:'TXN-00012', user:'Sophie Laurent',  type:'Transfer', amount:75000,   merchant:'Paris Fund',   date:'2026-04-16', status:'pending',   risk:40 },
  { id:'TXN-00013', user:'Alex Morgan',     type:'Debit',    amount:680,     merchant:'Uber Eats',    date:'2026-04-15', status:'completed', risk:4  },
  { id:'TXN-00014', user:'James Whitfield', type:'Credit',   amount:310000,  merchant:'Dividends',    date:'2026-04-15', status:'completed', risk:3  },
  { id:'TXN-00015', user:'Elena Novak',     type:'Transfer', amount:6200,    merchant:'Unknown',      date:'2026-04-14', status:'flagged',   risk:88 },
];

function riskBadge(score) {
  if (score < 30) return `<span class="badge badge-green">${score}</span>`;
  if (score < 70) return `<span class="badge badge-yellow">${score}</span>`;
  return `<span class="badge badge-red">${score}</span>`;
}

function renderTxTable(data) {
  const tbody = document.getElementById('tx-tbody');
  if (!tbody) return;
  tbody.innerHTML = data.map(tx => `
    <tr>
      <td style="font-family:monospace;font-size:0.8rem;color:var(--muted2)">${tx.id}</td>
      <td style="font-weight:500">${tx.user}</td>
      <td><span class="badge ${tx.type==='Credit'?'badge-green':tx.type==='Debit'?'badge-red':'badge-blue'}">${tx.type}</span></td>
      <td style="font-weight:600;color:${tx.type==='Credit'?'var(--green)':'var(--text)'}">$${tx.amount.toLocaleString()}</td>
      <td style="color:var(--muted2)">${tx.merchant}</td>
      <td style="color:var(--muted2);font-size:0.8rem">${tx.date}</td>
      <td><span class="badge ${tx.status==='completed'?'badge-green':tx.status==='flagged'?'badge-red':'badge-yellow'}">${tx.status}</span></td>
      <td>${riskBadge(tx.risk)}</td>
      <td>
        <button class="btn btn-ghost btn-sm flag-tx" data-id="${tx.id}" style="${tx.status==='flagged'?'color:var(--red)':''}">
          ${tx.status === 'flagged' ? 'Unflag' : 'Flag'}
        </button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('.flag-tx').forEach(btn => {
    btn.addEventListener('click', () => {
      const tx = txData.find(t => t.id === btn.dataset.id);
      if (tx) {
        tx.status = tx.status === 'flagged' ? 'completed' : 'flagged';
        renderTxTable(txData);
        showToast(`Transaction ${tx.id} ${tx.status === 'flagged' ? 'flagged' : 'cleared'}.`, tx.status === 'flagged' ? 'warning' : 'success');
      }
    });
  });
}

function initTransactionsPanel() {
  renderTxTable(txData);

  // Filters
  document.getElementById('tx-type-filter')?.addEventListener('change', applyTxFilters);
  document.getElementById('tx-status-filter')?.addEventListener('change', applyTxFilters);
  document.getElementById('tx-search')?.addEventListener('input', applyTxFilters);

  // Export CSV
  document.getElementById('export-csv')?.addEventListener('click', () => {
    showToast('Exporting transactions to CSV…', 'info');
    setTimeout(() => showToast('CSV downloaded: transactions_2026-04-22.csv', 'success'), 1200);
  });

  // Daily volume bar chart
  const txCtx = document.getElementById('tx-volume-chart')?.getContext('2d');
  if (txCtx && window.Chart) {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date('2026-03-24'); d.setDate(d.getDate() + i);
      return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    });
    const vols = Array.from({ length: 30 }, () => Math.floor(Math.random() * 3000000 + 500000));
    new Chart(txCtx, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [{ label: 'Volume ($)', data: vols, backgroundColor: 'rgba(201,168,76,0.55)', borderColor: '#C9A84C', borderWidth: 1 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => '$' + c.parsed.y.toLocaleString() } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#6B7280', maxTicksLimit: 8 } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6B7280', callback: v => '$' + (v/1000000).toFixed(1) + 'M' } }
        }
      }
    });
  }
}

function applyTxFilters() {
  const type   = document.getElementById('tx-type-filter')?.value || '';
  const status = document.getElementById('tx-status-filter')?.value || '';
  const search = document.getElementById('tx-search')?.value.toLowerCase() || '';
  const filtered = txData.filter(t => {
    return (!type || t.type.toLowerCase() === type.toLowerCase())
        && (!status || t.status === status)
        && (!search || t.user.toLowerCase().includes(search) || t.id.toLowerCase().includes(search));
  });
  renderTxTable(filtered);
}

/* ───────────────────────────────────────────
   ANALYTICS PANEL
─────────────────────────────────────────── */
function initAnalyticsPanel() {
  // User growth line chart
  const growthCtx = document.getElementById('growth-chart')?.getContext('2d');
  if (growthCtx && window.Chart) {
    const months = ['May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr'];
    const users  = [28000,30200,32100,34500,36800,38200,39500,40100,41000,41900,42300,42847];
    const g = growthCtx.createLinearGradient(0, 0, 0, 200);
    g.addColorStop(0, 'rgba(201,168,76,0.3)');
    g.addColorStop(1, 'rgba(201,168,76,0.0)');
    new Chart(growthCtx, {
      type: 'line',
      data: { labels: months, datasets: [{ label: 'Users', data: users, borderColor: '#C9A84C', backgroundColor: g, fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#C9A84C', pointBorderColor: '#0A0E1A', pointBorderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6B7280' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6B7280', callback: v => (v/1000).toFixed(0) + 'k' } }
        }
      }
    });
  }

  // Doughnut: account types
  const donutCtx = document.getElementById('acct-type-chart')?.getContext('2d');
  if (donutCtx && window.Chart) {
    new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: ['Personal', 'Business', 'Wealth'],
        datasets: [{ data: [68, 24, 8], backgroundColor: ['#C9A84C','#3B82F6','#10B981'], borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#9CA3AF', padding: 16, font: { size: 13 } } },
          tooltip: { callbacks: { label: c => c.label + ': ' + c.parsed + '%' } }
        }
      }
    });
  }

  // Bar: geographic distribution
  const geoCtx = document.getElementById('geo-chart')?.getContext('2d');
  if (geoCtx && window.Chart) {
    new Chart(geoCtx, {
      type: 'bar',
      data: {
        labels: ['USA','UK','UAE','India','Germany','France','Japan','Brazil','Singapore','Australia'],
        datasets: [{
          label: 'Users',
          data: [12400, 7200, 5800, 4900, 3800, 3100, 2700, 2400, 2100, 1800],
          backgroundColor: ['#C9A84C','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#F97316','#14B8A6'],
          borderWidth: 0, borderRadius: 4,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6B7280' } },
          y: { grid: { display: false }, ticks: { color: '#9CA3AF' } }
        }
      }
    });
  }

  // Three.js 3D bar chart: revenue by quarter
  initRevenueChart3D();
}

function initRevenueChart3D() {
  const container = document.getElementById('revenue-3d-container');
  if (!container || !window.THREE) return;

  const W = container.clientWidth, H = container.clientHeight || 320;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(4, 3.5, 7);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dl = new THREE.DirectionalLight(0xE4C97A, 1);
  dl.position.set(5, 8, 5);
  scene.add(dl);
  scene.add(new THREE.DirectionalLight(0x3B82F6, 0.3).position.set(-3, 2, -3) && new THREE.DirectionalLight(0x3B82F6, 0.3));

  const quarters = ['Q1 2025','Q2 2025','Q3 2025','Q4 2025'];
  const revenues = [0.58, 0.72, 0.84, 1.02]; // relative heights
  const colors   = [0xC9A84C, 0x3B82F6, 0x10B981, 0xF59E0B];

  const bars = [];
  quarters.forEach((q, i) => {
    const h = revenues[i] * 3;
    const geo = new THREE.BoxGeometry(0.7, h, 0.7);
    const mat = new THREE.MeshPhongMaterial({ color: colors[i], shininess: 80 });
    const bar = new THREE.Mesh(geo, mat);
    bar.position.set((i - 1.5) * 1.1, 0, 0);
    bar.scale.y = 0.001;
    scene.add(bar);
    bars.push({ mesh: bar, targetY: 1 });
  });

  // Grid floor
  const gridHelper = new THREE.GridHelper(6, 6, 0x222244, 0x1a2035);
  gridHelper.position.y = -1.5;
  scene.add(gridHelper);

  // Animate bars in
  if (window.gsap && !reduced) {
    bars.forEach((b, i) => {
      gsap.to(b.mesh.scale, { y: 1, duration: 0.7, ease: 'power2.out', delay: i * 0.12 });
      gsap.to(b.mesh.position, { y: revenues[i] * 3 / 2 - 1.5, duration: 0.7, ease: 'power2.out', delay: i * 0.12 });
    });
  } else {
    bars.forEach(b => { b.mesh.scale.y = 1; b.mesh.position.y = -0.5; });
  }

  let t = 0;
  function animate() {
    if (!container.isConnected) return;
    requestAnimationFrame(animate);
    if (!reduced) {
      t += 0.005;
      bars.forEach((b, i) => {
        b.mesh.position.z = Math.sin(t + i * 0.5) * 0.04;
      });
    }
    renderer.render(scene, camera);
  }
  animate();
}

/* ───────────────────────────────────────────
   SECURITY PANEL
─────────────────────────────────────────── */
const blocklist = ['185.220.101.45', '45.33.32.156', '104.16.51.111', '203.0.113.42'];

function initSecurityPanel() {
  renderBlocklist();

  document.getElementById('add-ip-btn')?.addEventListener('click', () => {
    const input = document.getElementById('add-ip-input');
    const ip = input?.value.trim();
    if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      showToast('Enter a valid IPv4 address.', 'error'); return;
    }
    if (blocklist.includes(ip)) { showToast('IP already blocked.', 'warning'); return; }
    blocklist.push(ip);
    renderBlocklist();
    input.value = '';
    showToast(`IP ${ip} added to blocklist.`, 'success');
  });

  // 2FA donut
  const twoFACtx = document.getElementById('twofa-chart')?.getContext('2d');
  if (twoFACtx && window.Chart) {
    new Chart(twoFACtx, {
      type: 'doughnut',
      data: {
        labels: ['2FA Enabled', '2FA Disabled'],
        datasets: [{ data: [62, 38], backgroundColor: ['#10B981','#374151'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#9CA3AF', padding: 16 } },
          tooltip: { callbacks: { label: c => c.label + ': ' + c.parsed + '%' } }
        }
      }
    });
  }

  // Scan button
  document.getElementById('run-scan-btn')?.addEventListener('click', runSecurityScan);
}

function renderBlocklist() {
  const list = document.getElementById('ip-list');
  if (!list) return;
  list.innerHTML = blocklist.map(ip => `
    <div class="ip-item">
      <span>${ip}</span>
      <button class="remove-ip" data-ip="${ip}" aria-label="Remove ${ip}">✕</button>
    </div>`).join('');
  list.querySelectorAll('.remove-ip').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = blocklist.indexOf(btn.dataset.ip);
      if (idx > -1) blocklist.splice(idx, 1);
      renderBlocklist();
      showToast(`IP ${btn.dataset.ip} removed from blocklist.`, 'info');
    });
  });
}

const scanMessages = [
  '[+] Initializing security scan...',
  '[+] Checking SSL/TLS certificates...',
  '[+] Scanning for open ports...',
  '[+] Analyzing user authentication logs...',
  '[+] Running brute-force detection...',
  '[+] Verifying API endpoint security...',
  '[+] Checking SQL injection vectors...',
  '[+] Scanning for XSS vulnerabilities...',
  '[+] Auditing admin access logs...',
  '[+] Verifying encryption keys...',
  '[✓] SSL: OK — TLS 1.3 active',
  '[✓] No critical open ports detected',
  '[!] WARNING: 3 accounts with expired passwords',
  '[✓] API endpoints: Secured',
  '[✓] No SQL injection vectors found',
  '[✓] XSS protection headers active',
  '[✓] Admin 2FA: Enabled',
  '[✓] Encryption: AES-256 verified',
  '[+] Generating report...',
  '[✓] SCAN COMPLETE — 1 warning, 0 critical issues.',
];

function runSecurityScan() {
  const btn = document.getElementById('run-scan-btn');
  const scanArea = document.getElementById('scan-progress');
  const scanLog  = document.getElementById('scan-log');
  if (!scanArea || !scanLog) return;

  btn.disabled = true;
  btn.textContent = 'Scanning…';
  scanArea.classList.add('visible');
  scanLog.innerHTML = '';

  let i = 0;
  const interval = setInterval(() => {
    const line = document.createElement('div');
    line.className = 'scan-log-line';
    line.style.color = scanMessages[i].includes('WARNING') ? '#F59E0B'
                      : scanMessages[i].includes('✓') ? '#10B981' : '#9CA3AF';
    line.textContent = scanMessages[i];
    scanLog.appendChild(line);
    scanLog.scrollTop = scanLog.scrollHeight;
    i++;
    if (i >= scanMessages.length) {
      clearInterval(interval);
      btn.disabled = false;
      btn.textContent = 'Run Security Scan';
      showToast('Security scan complete — 1 warning found.', 'warning');
    }
  }, 180);
}

/* ───────────────────────────────────────────
   CONFIRM MODAL
─────────────────────────────────────────── */
let confirmCallback = null;

function openConfirmModal(title, body, actionLabel, actionClass, cb) {
  confirmCallback = cb;
  const modal = document.getElementById('confirm-modal');
  const backdrop = document.getElementById('confirm-backdrop');
  if (!modal) return;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-body').innerHTML = body;
  const btn = document.getElementById('confirm-action');
  btn.textContent = actionLabel;
  btn.className = 'btn ' + actionClass;
  backdrop.classList.add('open');
}

function initConfirmModal() {
  document.getElementById('confirm-action')?.addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
    document.getElementById('confirm-backdrop').classList.remove('open');
  });
  document.getElementById('confirm-cancel')?.addEventListener('click', () => {
    confirmCallback = null;
    document.getElementById('confirm-backdrop').classList.remove('open');
  });
  document.getElementById('confirm-close')?.addEventListener('click', () => {
    confirmCallback = null;
    document.getElementById('confirm-backdrop').classList.remove('open');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      confirmCallback = null;
      document.getElementById('confirm-backdrop')?.classList.remove('open');
    }
  });
}

/* ───────────────────────────────────────────
   VAULTSTORE — PENDING KYC & TRANSFERS
─────────────────────────────────────────── */
function renderPendingKYC() {
  if (typeof VaultStore === 'undefined') return;
  const users = VaultStore.getUsers().filter(u => u.kycStatus === 'under_review');

  let container = document.getElementById('pending-kyc-section');
  if (!container) {
    container = document.createElement('div');
    container.id = 'pending-kyc-section';
    container.style.cssText = 'margin-bottom:1.5rem';
    const panel = document.getElementById('panel-overview');
    if (panel) panel.prepend(container);
  }

  if (!users.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="card-header">
        <div>
          <div class="card-title">Pending KYC Reviews</div>
          <div class="card-subtitle">${users.length} awaiting approval</div>
        </div>
        <span class="badge badge-yellow">${users.length} pending</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Account Type</th>
              <th>Submitted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="kyc-pending-tbody">
            ${users.map(u => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:0.75rem">
                    <div class="avatar" style="width:34px;height:34px;font-size:0.8rem">${u.avatar}</div>
                    <div style="font-weight:500">${u.name}</div>
                  </div>
                </td>
                <td style="color:var(--muted2)">${u.email}</td>
                <td><span class="badge badge-muted">${u.accountType}</span></td>
                <td style="color:var(--muted2);font-size:0.8rem">${u.kycData ? new Date(u.kycData.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</td>
                <td>
                  <div class="action-btns">
                    <button class="btn btn-sm" style="background:rgba(16,185,129,0.15);color:#10B981;border:1px solid rgba(16,185,129,0.3)"
                      data-kyc-approve="${u.id}">✓ Approve</button>
                    <button class="btn btn-ghost btn-sm"
                      data-kyc-reject="${u.id}">✕ Reject</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  container.querySelectorAll('[data-kyc-approve]').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.kycApprove;
      openConfirmModal(
        'Approve KYC',
        `Approve identity verification for <strong>${VaultStore.getUser(uid)?.name}</strong>? Their account will become fully active.`,
        'Approve', 'btn-primary',
        () => {
          VaultStore.approveKYC(uid);
          showToast(`KYC approved for ${VaultStore.getUser(uid)?.name || 'user'}.`, 'success');
          renderPendingKYC();
          updateKPIs();
        }
      );
    });
  });

  container.querySelectorAll('[data-kyc-reject]').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.kycReject;
      openConfirmModal(
        'Reject KYC',
        `Reject identity verification for <strong>${VaultStore.getUser(uid)?.name}</strong>? They will be asked to re-submit.`,
        'Reject', 'btn-danger',
        () => {
          VaultStore.rejectKYC(uid, 'Documents could not be verified. Please resubmit clearer images.');
          showToast(`KYC rejected for ${VaultStore.getUser(uid)?.name || 'user'}.`, 'warning');
          renderPendingKYC();
          updateKPIs();
        }
      );
    });
  });
}

function renderPendingTransfers() {
  if (typeof VaultStore === 'undefined') return;
  const transfers = VaultStore.getPendingTransfers();

  let container = document.getElementById('pending-transfers-section');
  if (!container) {
    container = document.createElement('div');
    container.id = 'pending-transfers-section';
    container.style.cssText = 'margin-bottom:1.5rem';
    const panel = document.getElementById('panel-overview');
    const kycSection = document.getElementById('pending-kyc-section');
    if (panel) {
      if (kycSection) kycSection.after(container);
      else panel.prepend(container);
    }
  }

  if (!transfers.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Pending Transfers</div>
          <div class="card-subtitle">${transfers.length} awaiting approval</div>
        </div>
        <span class="badge badge-blue">${transfers.length} pending</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Amount</th>
              <th>Type</th>
              <th>Submitted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${transfers.map(t => `
              <tr>
                <td style="font-weight:500">${t.fromName}</td>
                <td>${t.toName}</td>
                <td style="font-weight:600;color:var(--gold)">$${t.amount.toLocaleString()}</td>
                <td><span class="badge ${t.type === 'internal' ? 'badge-green' : 'badge-blue'}">${t.type}</span></td>
                <td style="color:var(--muted2);font-size:0.8rem">${new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                <td>
                  <div class="action-btns">
                    <button class="btn btn-sm" style="background:rgba(16,185,129,0.15);color:#10B981;border:1px solid rgba(16,185,129,0.3)"
                      data-txf-approve="${t.id}">✓ Approve</button>
                    <button class="btn btn-ghost btn-sm"
                      data-txf-reject="${t.id}">✕ Reject</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  container.querySelectorAll('[data-txf-approve]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.txfApprove;
      const t  = VaultStore.getTransfers().find(x => x.id === id);
      openConfirmModal(
        'Approve Transfer',
        `Approve transfer of <strong>$${t?.amount?.toLocaleString()}</strong> from <strong>${t?.fromName}</strong> to <strong>${t?.toName}</strong>?`,
        'Approve', 'btn-primary',
        () => {
          const result = VaultStore.approveTransfer(id);
          if (result?.status === 'rejected') {
            showToast('Transfer rejected: insufficient funds.', 'error');
          } else {
            showToast('Transfer approved and processed.', 'success');
          }
          renderPendingTransfers();
        }
      );
    });
  });

  container.querySelectorAll('[data-txf-reject]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.txfReject;
      const t  = VaultStore.getTransfers().find(x => x.id === id);
      openConfirmModal(
        'Reject Transfer',
        `Reject transfer of <strong>$${t?.amount?.toLocaleString()}</strong> from <strong>${t?.fromName}</strong> to <strong>${t?.toName}</strong>?`,
        'Reject', 'btn-danger',
        () => {
          VaultStore.rejectTransfer(id, 'Rejected by compliance officer.');
          showToast('Transfer rejected.', 'warning');
          renderPendingTransfers();
        }
      );
    });
  });
}

function updateKPIs() {
  if (typeof VaultStore === 'undefined') return;
  const users     = VaultStore.getUsers();
  const suspended = users.filter(u => u.status === 'suspended').length;
  const kpiFlagged = document.getElementById('kpi-flagged');
  if (kpiFlagged) kpiFlagged.textContent = suspended;
}

/* ───────────────────────────────────────────
   INIT
─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  /* Ensure admin session exists (auto-grant for demo) */
  if (typeof VaultStore !== 'undefined' && !VaultStore.getAdminSession()) {
    VaultStore.adminLogin('Vaultstone@Admin2024');
  }

  initNav();
  initUsersPanel();
  initConfirmModal();

  /* Show pending KYC and transfers on load */
  if (typeof VaultStore !== 'undefined') {
    renderPendingKYC();
    renderPendingTransfers();
    updateKPIs();
  }

  /* Default panel: users */
  switchPanel('users');
  panelInited['overview'] = false;

  /* GSAP entrance */
  if (window.gsap && !reduced) {
    gsap.from('.sidebar', { x: -30, opacity: 0, duration: 0.6, ease: 'power2.out' });
    gsap.from('.top-header', { y: -20, opacity: 0, duration: 0.5, ease: 'power2.out', delay: 0.1 });
  }

  /* Overview panel init */
  document.querySelector('.sidebar__link[data-panel="overview"]')?.addEventListener('click', () => {
    if (!panelInited['overview']) {
      panelInited['overview'] = true;
      setTimeout(() => {
        initOverviewPanel();
        renderPendingKYC();
        renderPendingTransfers();
      }, 100);
    }
  });

  /* Logout */
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('vs_admin_session');
    showToast('Logging out…', 'info');
    setTimeout(() => { window.location.href = 'index.html'; }, 1200);
  });
});
