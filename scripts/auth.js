/* ============================================================
   Vaultstone Bank — Auth JavaScript
   login.html + signup.html
   ============================================================ */

'use strict';

/* ── Utility ─────────────────────────────────────────────── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ============================================================
   1. THREE.JS — LOGIN VAULT DOOR SCENE
   ============================================================ */
function initVaultScene() {
  const canvas = document.getElementById('login-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const W = canvas.parentElement.clientWidth;
  const H = canvas.parentElement.clientHeight;

  /* Renderer */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  /* Scene */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060810);
  scene.fog = new THREE.FogExp2(0x060810, 0.025);

  /* Camera */
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 200);
  camera.position.set(0, 0, 9);

  /* ── Materials ── */
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xC9A84C,
    metalness: 0.95,
    roughness: 0.12,
    envMapIntensity: 1.4
  });
  const goldDarkMat = new THREE.MeshStandardMaterial({
    color: 0x8B6914,
    metalness: 0.9,
    roughness: 0.25
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x1a2236,
    metalness: 0.85,
    roughness: 0.20
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xC9A84C,
    metalness: 0.98,
    roughness: 0.08,
    emissive: 0xC9A84C,
    emissiveIntensity: 0.08
  });

  /* ── Vault Door Group ── */
  const vaultGroup = new THREE.Group();
  scene.add(vaultGroup);

  /* Door Face — large disc */
  const doorGeo = new THREE.CylinderGeometry(3.2, 3.2, 0.38, 64, 1);
  const door = new THREE.Mesh(doorGeo, steelMat);
  door.rotation.x = Math.PI / 2;
  door.castShadow = true;
  vaultGroup.add(door);

  /* Door face inner circle */
  const innerGeo = new THREE.CylinderGeometry(2.55, 2.55, 0.44, 64, 1);
  const innerDoor = new THREE.Mesh(innerGeo, goldDarkMat);
  innerDoor.rotation.x = Math.PI / 2;
  innerDoor.position.z = 0.02;
  vaultGroup.add(innerDoor);

  /* Outer ring */
  const ringGeo = new THREE.TorusGeometry(3.2, 0.12, 16, 80);
  const outerRing = new THREE.Mesh(ringGeo, rimMat);
  vaultGroup.add(outerRing);

  /* Inner ring */
  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.55, 0.09, 16, 80),
    rimMat
  );
  vaultGroup.add(innerRing);

  /* Vault Bolts — arranged in a circle */
  const boltGroup = new THREE.Group();
  vaultGroup.add(boltGroup);
  const NUM_BOLTS = 8;
  for (let i = 0; i < NUM_BOLTS; i++) {
    const angle = (i / NUM_BOLTS) * Math.PI * 2;
    const boltGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.55, 16, 1);
    const bolt = new THREE.Mesh(boltGeo, goldMat);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(
      Math.cos(angle) * 2.95,
      Math.sin(angle) * 2.95,
      0.2
    );
    bolt.castShadow = true;
    boltGroup.add(bolt);

    /* Bolt head cap */
    const capGeo = new THREE.SphereGeometry(0.22, 12, 12, 0, Math.PI);
    const cap = new THREE.Mesh(capGeo, goldMat);
    cap.rotation.x = -Math.PI / 2;
    cap.position.copy(bolt.position);
    cap.position.z += 0.24;
    boltGroup.add(cap);
  }

  /* Central Wheel / Combination Lock */
  const wheelGroup = new THREE.Group();
  vaultGroup.add(wheelGroup);

  const wheelHubGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.52, 32, 1);
  const wheelHub = new THREE.Mesh(wheelHubGeo, goldMat);
  wheelHub.rotation.x = Math.PI / 2;
  wheelHub.position.z = 0.3;
  wheelGroup.add(wheelHub);

  /* Wheel spokes */
  for (let i = 0; i < 6; i++) {
    const spokeAngle = (i / 6) * Math.PI * 2;
    const spokeGeo = new THREE.BoxGeometry(0.09, 1.10, 0.12);
    const spoke = new THREE.Mesh(spokeGeo, goldMat);
    spoke.rotation.z = spokeAngle;
    spoke.position.z = 0.32;
    wheelGroup.add(spoke);
  }

  const wheelRimGeo = new THREE.TorusGeometry(0.68, 0.08, 12, 40);
  const wheelRim = new THREE.Mesh(wheelRimGeo, rimMat);
  wheelRim.position.z = 0.30;
  wheelGroup.add(wheelRim);

  /* Decorative grooves on door face */
  for (let r = 0; r < 3; r++) {
    const radii = [1.20, 1.85, 2.28];
    const groove = new THREE.Mesh(
      new THREE.TorusGeometry(radii[r], 0.025, 8, 80),
      goldDarkMat
    );
    groove.position.z = 0.22;
    vaultGroup.add(groove);
  }

  /* ── Wall frame ── */
  const frameGeo = new THREE.TorusGeometry(3.55, 0.32, 8, 60);
  const frame = new THREE.Mesh(frameGeo, steelMat);
  frame.position.z = -0.2;
  scene.add(frame);

  /* ── Floating Particles ── */
  const particleCount = 220;
  const pPositions = new Float32Array(particleCount * 3);
  const pSpeeds    = new Float32Array(particleCount);
  const pAmps      = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    pPositions[i * 3]     = (Math.random() - 0.5) * 24;
    pPositions[i * 3 + 1] = (Math.random() - 0.5) * 18;
    pPositions[i * 3 + 2] = (Math.random() - 0.5) * 14;
    pSpeeds[i] = 0.3 + Math.random() * 0.7;
    pAmps[i]   = 0.5 + Math.random() * 1.5;
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));

  const pMat = new THREE.PointsMaterial({
    color: 0xC9A84C,
    size: 0.055,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: true
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  /* ── Lighting ── */
  const ambient = new THREE.AmbientLight(0x0d1526, 1.8);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffeedd, 1.4);
  keyLight.position.set(6, 8, 8);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x3B82F6, 0.35);
  fillLight.position.set(-8, -4, 4);
  scene.add(fillLight);

  /* Gold point light — shimmer sweep */
  const shimmerLight = new THREE.PointLight(0xC9A84C, 0, 12);
  shimmerLight.position.set(-5, 2, 4);
  scene.add(shimmerLight);

  const rimLight = new THREE.PointLight(0xC9A84C, 1.2, 10);
  rimLight.position.set(0, 3.5, 5);
  scene.add(rimLight);

  /* ── Mouse Parallax ── */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  document.addEventListener('mousemove', e => {
    mouse.tx = (e.clientX / window.innerWidth  - 0.5) * 2;
    mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  /* ── Vault Door Open State ── */
  let vaultOpen = false;
  let vaultOpenTarget = 0;
  let vaultOpenCurrent = 0;

  window.openVaultDoor = function() {
    vaultOpen = true;
    vaultOpenTarget = Math.PI / 5.5;
  };

  /* ── Shimmer animation timeline ── */
  let shimmerAngle = 0;

  /* ── Resize ── */
  const observer = new ResizeObserver(() => {
    const pw = canvas.parentElement.clientWidth;
    const ph = canvas.parentElement.clientHeight;
    renderer.setSize(pw, ph);
    camera.aspect = pw / ph;
    camera.updateProjectionMatrix();
  });
  observer.observe(canvas.parentElement);

  /* ── Render Loop ── */
  let t = 0;
  function animate() {
    requestAnimationFrame(animate);
    t += 0.016;

    /* Particle drift */
    const posAttr = pGeo.attributes.position;
    for (let i = 0; i < particleCount; i++) {
      posAttr.array[i * 3 + 1] += pSpeeds[i] * 0.004;
      posAttr.array[i * 3]     += Math.sin(t * 0.3 + i) * 0.0008;
      if (posAttr.array[i * 3 + 1] > 9) posAttr.array[i * 3 + 1] = -9;
    }
    posAttr.needsUpdate = true;

    /* Slow vault door rotation */
    vaultGroup.rotation.y = Math.sin(t * 0.12) * 0.06;
    vaultGroup.rotation.x = Math.cos(t * 0.09) * 0.035;

    /* Wheel spin */
    wheelGroup.rotation.z += 0.004;

    /* Vault open animation */
    if (vaultOpen) {
      vaultOpenCurrent += (vaultOpenTarget - vaultOpenCurrent) * 0.035;
      vaultGroup.rotation.y = vaultOpenCurrent + Math.sin(t * 0.12) * 0.02;
    }

    /* Mouse parallax */
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    vaultGroup.position.x = mouse.x * 0.28;
    vaultGroup.position.y = -mouse.y * 0.18;
    camera.rotation.y = mouse.x * -0.04;
    camera.rotation.x = mouse.y * 0.025;

    /* Shimmer sweep */
    shimmerAngle += 0.018;
    shimmerLight.position.x = Math.cos(shimmerAngle) * 6;
    shimmerLight.position.y = Math.sin(shimmerAngle * 0.7) * 3;
    shimmerLight.intensity   = 1.8 + Math.sin(shimmerAngle * 2) * 1.8;

    renderer.render(scene, camera);
  }
  animate();
}

/* ============================================================
   2. THREE.JS — SIGNUP FINANCIAL DATA VIZ SCENE
   ============================================================ */
function initSignupScene() {
  const canvas = document.getElementById('signup-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const W = window.innerWidth;
  const H = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 300);
  camera.position.set(0, 8, 22);
  camera.lookAt(0, 1, 0);

  /* ── Materials ── */
  const goldBarMat = new THREE.MeshStandardMaterial({
    color: 0xC9A84C,
    metalness: 0.85,
    roughness: 0.25,
    transparent: true,
    opacity: 0.78
  });
  const goldLineMat = new THREE.LineBasicMaterial({
    color: 0xC9A84C,
    transparent: true,
    opacity: 0.35
  });
  const gridMat = new THREE.LineBasicMaterial({
    color: 0xC9A84C,
    transparent: true,
    opacity: 0.08
  });

  /* ── Grid Floor ── */
  const gridHelper = new THREE.GridHelper(30, 24, 0xC9A84C, 0xC9A84C);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.07;
  gridHelper.position.y = -0.01;
  scene.add(gridHelper);

  /* ── Bar Chart Columns ── */
  const masterGroup = new THREE.Group();
  scene.add(masterGroup);

  const COLS = 5;
  const ROWS = 4;
  const spacing = 2.8;
  const barData = [];

  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const height  = 0.8 + Math.random() * 5.5;
      const barGeo  = new THREE.BoxGeometry(0.9, height, 0.9);
      const bar     = new THREE.Mesh(barGeo, goldBarMat.clone());
      bar.material.opacity = 0.35 + Math.random() * 0.45;
      const x = (c - (COLS - 1) / 2) * spacing;
      const z = (r - (ROWS - 1) / 2) * spacing;
      bar.position.set(x, height / 2, z);
      bar.castShadow = true;
      masterGroup.add(bar);
      barData.push({ mesh: bar, targetH: height, phase: Math.random() * Math.PI * 2 });
    }
  }

  /* ── Node Dots ── */
  const nodePositions = [];
  const nodeGeo = new THREE.SphereGeometry(0.14, 10, 10);
  const nodeMat = new THREE.MeshStandardMaterial({
    color: 0xE8C97A,
    metalness: 0.7,
    roughness: 0.2,
    emissive: 0xC9A84C,
    emissiveIntensity: 0.4
  });

  for (let i = 0; i < 14; i++) {
    const angle  = (i / 14) * Math.PI * 2;
    const radius = 4.5 + Math.random() * 4;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = 0.5 + Math.random() * 4;
    const node = new THREE.Mesh(nodeGeo, nodeMat);
    node.position.set(x, y, z);
    masterGroup.add(node);
    nodePositions.push(new THREE.Vector3(x, y, z));
  }

  /* Connecting lines between nodes */
  for (let i = 0; i < nodePositions.length; i++) {
    const next = nodePositions[(i + 1) % nodePositions.length];
    const points = [nodePositions[i], next];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const line    = new THREE.Line(lineGeo, goldLineMat);
    masterGroup.add(line);

    if (i % 3 === 0) {
      const skip = nodePositions[(i + 4) % nodePositions.length];
      const pts2 = [nodePositions[i], skip];
      const lg2  = new THREE.BufferGeometry().setFromPoints(pts2);
      masterGroup.add(new THREE.Line(lg2, goldLineMat.clone()));
    }
  }

  /* ── Floating Mini Particles ── */
  const pCount = 160;
  const pPos   = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3]     = (Math.random() - 0.5) * 28;
    pPos[i * 3 + 1] = Math.random() * 10;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 28;
  }
  const pGeom = new THREE.BufferGeometry();
  pGeom.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMatS = new THREE.PointsMaterial({
    color: 0xC9A84C, size: 0.06,
    transparent: true, opacity: 0.45,
    sizeAttenuation: true
  });
  scene.add(new THREE.Points(pGeom, pMatS));

  /* ── Lighting ── */
  scene.add(new THREE.AmbientLight(0x0d1526, 2.5));
  const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
  sun.position.set(5, 12, 8);
  scene.add(sun);
  const fillL = new THREE.PointLight(0xC9A84C, 1.0, 25);
  fillL.position.set(0, 6, 0);
  scene.add(fillL);

  /* ── Resize ── */
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  /* ── Render Loop ── */
  let t = 0;
  function animate() {
    requestAnimationFrame(animate);
    t += 0.016;

    /* Slow scene rotation */
    masterGroup.rotation.y += 0.0018;

    /* Animate bar heights */
    barData.forEach(b => {
      const newH = b.targetH * (0.85 + Math.sin(t * 0.55 + b.phase) * 0.15);
      b.mesh.scale.y = newH / b.targetH;
      b.mesh.position.y = (b.targetH * b.mesh.scale.y) / 2;
    });

    /* Particle drift upward */
    const pa = pGeom.attributes.position;
    for (let i = 0; i < pCount; i++) {
      pa.array[i * 3 + 1] += 0.012;
      if (pa.array[i * 3 + 1] > 10) pa.array[i * 3 + 1] = 0;
    }
    pa.needsUpdate = true;

    renderer.render(scene, camera);
  }
  animate();
}

/* ============================================================
   3. LOGIN PAGE LOGIC
   ============================================================ */
function initLoginPage() {
  if (!document.getElementById('login-form')) return;

  /* GSAP form slide-in */
  if (typeof gsap !== 'undefined') {
    gsap.from('.auth-card', {
      x: 60,
      opacity: 0,
      duration: 0.85,
      ease: 'power3.out',
      delay: 0.15
    });
    gsap.from('.auth-card > *', {
      y: 18,
      opacity: 0,
      duration: 0.6,
      ease: 'power2.out',
      stagger: 0.07,
      delay: 0.3
    });
  }

  /* Floating label polyfill for autofill */
  $$('.field-group__input, .field-group__select').forEach(input => {
    const check = () => {
      if (input.value) input.classList.add('has-value');
      else input.classList.remove('has-value');
    };
    input.addEventListener('input', check);
    input.addEventListener('change', check);
    check();
  });

  /* Password show/hide */
  $$('.field-group__toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.closest('.field-group').querySelector('.field-group__input');
      const isPass = field.type === 'password';
      field.type = isPass ? 'text' : 'password';
      btn.innerHTML = isPass
        ? `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7s4-7 9-7c1.17 0 2.29.21 3.33.59M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><line x1="3" y1="3" x2="21" y2="21"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>`;
    });
  });

  /* Form submit */
  const form = document.getElementById('login-form');
  const btn  = document.getElementById('login-btn');

  form.addEventListener('submit', e => {
    e.preventDefault();
    let valid = true;

    /* Validate */
    const emailInput = document.getElementById('login-email');
    const passInput  = document.getElementById('login-password');

    valid = validateField(emailInput, 'email') && valid;
    valid = validateField(passInput, 'password') && valid;

    if (!valid) {
      shakeElement(form);
      return;
    }

    /* Loading state */
    btn.classList.add('loading');
    btn.disabled = true;

    setTimeout(() => {
      /* Trigger vault open */
      if (typeof window.openVaultDoor === 'function') window.openVaultDoor();

      /* GSAP success */
      if (typeof gsap !== 'undefined') {
        gsap.to('.auth-card', { scale: 0.96, opacity: 0.8, duration: 0.5, ease: 'power2.in' });
      }

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1200);
    }, 1600);
  });
}

/* ============================================================
   4. SIGNUP PAGE MULTI-STEP LOGIC
   ============================================================ */
function initSignupPage() {
  if (!document.getElementById('signup-form')) return;

  let currentStep = 1;
  const TOTAL_STEPS = 4;
  let selectedAccountType = null;

  /* GSAP card entrance */
  if (typeof gsap !== 'undefined') {
    gsap.from('.signup-card', {
      y: 40,
      opacity: 0,
      duration: 0.85,
      ease: 'power3.out',
      delay: 0.2
    });
  }

  /* Floating label polyfill */
  $$('.field-group__input, .field-group__select').forEach(input => {
    const check = () => {
      if (input.value) input.classList.add('has-value');
      else input.classList.remove('has-value');
    };
    input.addEventListener('input', check);
    input.addEventListener('change', check);
    check();
  });

  /* ── Password show/hide ── */
  $$('.field-group__toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.closest('.field-group').querySelector('.field-group__input');
      const isPass = field.type === 'password';
      field.type = isPass ? 'text' : 'password';
      btn.innerHTML = isPass
        ? `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7s4-7 9-7c1.17 0 2.29.21 3.33.59M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><line x1="3" y1="3" x2="21" y2="21"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>`;
    });
  });

  /* ── Account Type Cards ── */
  $$('.account-type-card').forEach(card => {
    card.addEventListener('click', () => {
      $$('.account-type-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedAccountType = card.dataset.type;
    });

    /* 3D CSS tilt on hover */
    card.addEventListener('mousemove', e => {
      const rect   = card.getBoundingClientRect();
      const cx     = rect.left + rect.width  / 2;
      const cy     = rect.top  + rect.height / 2;
      const dx     = (e.clientX - cx) / (rect.width  / 2);
      const dy     = (e.clientY - cy) / (rect.height / 2);
      card.style.transform = `perspective(600px) rotateY(${dx * 7}deg) rotateX(${-dy * 5}deg) translateY(-2px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
      card.style.transition = 'transform 0.35s cubic-bezier(0.4,0,0.2,1)';
      setTimeout(() => { card.style.transition = ''; }, 350);
    });
  });

  /* ── Password Strength ── */
  const passwordInput = document.getElementById('signup-password');
  if (passwordInput) {
    passwordInput.addEventListener('input', () => {
      updatePasswordStrength(passwordInput.value);
    });
  }

  /* ── OTP Auto-advance ── */
  const otpInputs = $$('.otp-input');
  otpInputs.forEach((input, idx) => {
    input.addEventListener('input', e => {
      const val = e.target.value;
      if (val.length > 1) e.target.value = val.slice(-1);
      if (e.target.value) {
        e.target.classList.add('filled');
        if (idx < otpInputs.length - 1) otpInputs[idx + 1].focus();
      } else {
        e.target.classList.remove('filled');
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        otpInputs[idx - 1].focus();
        otpInputs[idx - 1].value = '';
        otpInputs[idx - 1].classList.remove('filled');
      }
      if (e.key === 'ArrowLeft'  && idx > 0) otpInputs[idx - 1].focus();
      if (e.key === 'ArrowRight' && idx < otpInputs.length - 1) otpInputs[idx + 1].focus();
    });

    input.addEventListener('paste', e => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      otpInputs.forEach((inp, i) => {
        if (pasted[i]) {
          inp.value = pasted[i];
          inp.classList.add('filled');
        }
      });
      const nextEmpty = otpInputs.findIndex(inp => !inp.value);
      if (nextEmpty >= 0) otpInputs[nextEmpty].focus();
      else otpInputs[otpInputs.length - 1].focus();
    });
  });

  /* ── Resend OTP ── */
  const resendBtn = document.getElementById('resend-otp');
  if (resendBtn) {
    resendBtn.addEventListener('click', () => {
      resendBtn.disabled = true;
      resendBtn.textContent = 'Sent!';
      otpInputs.forEach(inp => { inp.value = ''; inp.classList.remove('filled'); });
      otpInputs[0].focus();
      setTimeout(() => {
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend code';
      }, 30000);
    });
  }

  /* ── Next Buttons ── */
  $$('[data-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (validateStep(currentStep)) {
        goToStep(currentStep + 1, 1);
      } else {
        shakeElement(btn.closest('.step-panel') || document.getElementById('signup-form'));
      }
    });
  });

  /* ── Back Buttons ── */
  $$('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      goToStep(currentStep - 1, -1);
    });
  });

  /* ── Final Submit ── */
  const signupBtn = document.getElementById('signup-submit');
  if (signupBtn) {
    signupBtn.addEventListener('click', () => {
      const otp = otpInputs.map(i => i.value).join('');
      if (otp.length < 6) {
        shakeElement(signupBtn.closest('.step-panel'));
        otpInputs.forEach(i => i.classList.add('error'));
        return;
      }
      signupBtn.classList.add('loading');
      signupBtn.disabled = true;

      setTimeout(() => {
        triggerConfetti();
        const overlay = document.getElementById('success-overlay');
        if (overlay) overlay.classList.add('visible');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 2200);
      }, 1500);
    });
  }

  /* ── Step Navigation ── */
  function goToStep(next, dir) {
    if (next < 1 || next > TOTAL_STEPS) return;
    const panels     = $$('.step-panel');
    const fromPanel  = $('.step-panel.active');

    if (typeof gsap !== 'undefined' && fromPanel) {
      gsap.to(fromPanel, {
        x: dir * -60, opacity: 0, duration: 0.28,
        ease: 'power2.in',
        onComplete: () => {
          fromPanel.classList.remove('active');
          currentStep = next;
          updateProgress();
          const toPanel = document.getElementById('step-' + currentStep);
          if (toPanel) {
            toPanel.classList.add('active');
            gsap.fromTo(toPanel,
              { x: dir * 60, opacity: 0 },
              { x: 0, opacity: 1, duration: 0.35, ease: 'power2.out' }
            );
          }
        }
      });
    } else {
      fromPanel && fromPanel.classList.remove('active');
      currentStep = next;
      updateProgress();
      const toPanel = document.getElementById('step-' + currentStep);
      toPanel && toPanel.classList.add('active');
    }
  }

  function updateProgress() {
    $$('.step-progress__item').forEach((item, idx) => {
      const stepNum = idx + 1;
      item.classList.toggle('active',    stepNum === currentStep);
      item.classList.toggle('completed', stepNum < currentStep);

      const circle = item.querySelector('.step-progress__circle');
      if (circle) {
        if (stepNum < currentStep) {
          circle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
        } else {
          circle.textContent = stepNum;
        }
      }
    });
  }

  /* ── Step Validation ── */
  function validateStep(step) {
    let valid = true;
    if (step === 1) {
      valid = validateField(document.getElementById('first-name'), 'name')    && valid;
      valid = validateField(document.getElementById('last-name'),  'name')    && valid;
      valid = validateField(document.getElementById('signup-email'), 'email') && valid;
      valid = validateField(document.getElementById('dob'),          'dob')   && valid;
      const country = document.getElementById('country');
      if (country && !country.value) {
        showError(country, 'Please select your country');
        valid = false;
      } else if (country) {
        hideError(country);
      }
    }
    if (step === 2) {
      if (!selectedAccountType) {
        const grid = $('.account-type-grid');
        if (grid) shakeElement(grid);
        valid = false;
      }
    }
    if (step === 3) {
      valid = validateField(document.getElementById('signup-password'),  'password') && valid;
      valid = validateField(document.getElementById('confirm-password'), 'confirm')  && valid;
      valid = validateField(document.getElementById('phone'),            'phone')    && valid;
      const terms = document.getElementById('agree-terms');
      if (terms && !terms.checked) {
        const label = terms.closest('.checkbox-field');
        if (label) shakeElement(label);
        valid = false;
      }
    }
    return valid;
  }

  /* Init first step active */
  updateProgress();
}

/* ============================================================
   5. PASSWORD STRENGTH
   ============================================================ */
function updatePasswordStrength(val) {
  const bars  = $$('.strength-bar');
  const label = $('.strength-meter__label');
  if (!bars.length || !label) return;

  let score = 0;
  if (val.length >= 8)          score++;
  if (/[A-Z]/.test(val))        score++;
  if (/[0-9]/.test(val))        score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;

  const levels = ['', 'weak', 'fair', 'good', 'strong'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  bars.forEach((bar, i) => {
    bar.className = 'strength-bar';
    if (i < score) bar.classList.add(levels[score]);
  });

  label.className = 'strength-meter__label ' + (levels[score] || '');
  label.textContent = val.length > 0 ? (labels[score] || 'Weak') + ' password' : '';
}

/* ============================================================
   6. FORM VALIDATION HELPERS
   ============================================================ */
function validateField(input, type) {
  if (!input) return true;
  const val = input.value.trim();
  let msg   = '';

  switch (type) {
    case 'email':
      if (!val)                        msg = 'Email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) msg = 'Enter a valid email address';
      break;
    case 'password':
      if (!val)        msg = 'Password is required';
      else if (val.length < 8) msg = 'Password must be at least 8 characters';
      break;
    case 'confirm': {
      const pw = document.getElementById('signup-password');
      if (!val)           msg = 'Please confirm your password';
      else if (pw && val !== pw.value) msg = 'Passwords do not match';
      break;
    }
    case 'name':
      if (!val || val.length < 2) msg = 'This field is required';
      break;
    case 'dob':
      if (!val) msg = 'Date of birth is required';
      break;
    case 'phone':
      if (!val) msg = 'Phone number is required';
      else if (!/^\+?[\d\s\-()]{7,}$/.test(val)) msg = 'Enter a valid phone number';
      break;
  }

  if (msg) { showError(input, msg); return false; }
  hideError(input);
  return true;
}

function showError(input, msg) {
  input.classList.add('error');
  let err = input.parentElement.querySelector('.field-error');
  if (!err) {
    err = document.createElement('span');
    err.className = 'field-error';
    input.parentElement.appendChild(err);
  }
  err.textContent = msg;
  requestAnimationFrame(() => err.classList.add('visible'));
}

function hideError(input) {
  input.classList.remove('error');
  const err = input.parentElement.querySelector('.field-error');
  if (err) {
    err.classList.remove('visible');
    setTimeout(() => err.remove(), 220);
  }
}

function shakeElement(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth; /* reflow */
  el.classList.add('shake');
  el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
}

/* ============================================================
   7. CONFETTI BURST (Gold Particles)
   ============================================================ */
function triggerConfetti() {
  const colors = ['#C9A84C', '#E8C97A', '#F0D890', '#A07828', '#FFE566'];
  const count  = 90;
  const origin = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-particle';
    const size  = 5 + Math.random() * 10;
    const angle = Math.random() * Math.PI * 2;
    const speed = 120 + Math.random() * 280;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const isCircle = Math.random() > 0.5;

    Object.assign(el.style, {
      left:        origin.x + 'px',
      top:         origin.y + 'px',
      width:       size + 'px',
      height:      isCircle ? size + 'px' : (size * 0.5) + 'px',
      background:  color,
      borderRadius: isCircle ? '50%' : '2px',
      position:    'fixed',
      pointerEvents: 'none',
      zIndex:       '1001',
      willChange:  'transform, opacity'
    });

    document.body.appendChild(el);

    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 80;
    let   px = 0, py = 0, rot = 0, opacity = 1;
    let   start = null;

    function step(ts) {
      if (!start) start = ts;
      const dt = (ts - start) / 1000;
      px = vx * dt;
      py = vy * dt + 0.5 * 400 * dt * dt;
      rot = dt * (200 + Math.random() * 360);
      opacity = Math.max(0, 1 - dt * 1.4);
      el.style.transform = `translate(${px}px, ${py}px) rotate(${rot}deg)`;
      el.style.opacity   = opacity;
      if (opacity > 0) requestAnimationFrame(step);
      else el.remove();
    }

    requestAnimationFrame(step);
  }
}

/* ============================================================
   8. BOOT — Detect Page & Init
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  /* Login page */
  if (document.getElementById('login-canvas')) {
    initVaultScene();
    initLoginPage();
  }

  /* Signup page */
  if (document.getElementById('signup-canvas')) {
    initSignupScene();
    initSignupPage();
  }

  /* Live validation on blur */
  $$('input[required], select[required]').forEach(input => {
    input.addEventListener('blur', () => {
      if (input.value) hideError(input);
    });
  });
});
