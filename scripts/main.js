/**
 * Vaultstone Bank — Main JavaScript
 * Three.js 3D hero, GSAP animations, scroll effects, custom cursor
 */

'use strict';

/* ============================================================
   Utility
   ============================================================ */
const qs  = (sel, ctx = document) => ctx.querySelector(sel);
const qsa = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================================================
   1. Custom Cursor
   ============================================================ */
function initCursor() {
  if (prefersReducedMotion || window.matchMedia('(pointer: coarse)').matches) return;

  const dot  = qs('.cursor-dot');
  const ring = qs('.cursor-ring');
  if (!dot || !ring) return;

  let mouseX = -100, mouseY = -100;
  let ringX  = -100, ringY  = -100;
  let rafId;

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function animateCursor() {
    // Dot follows immediately
    dot.style.left  = mouseX + 'px';
    dot.style.top   = mouseY + 'px';

    // Ring follows with lag (lerp)
    ringX += (mouseX - ringX) * 0.12;
    ringY += (mouseY - ringY) * 0.12;
    ring.style.left = ringX + 'px';
    ring.style.top  = ringY + 'px';

    rafId = requestAnimationFrame(animateCursor);
  }

  animateCursor();

  // Hover state on interactive elements
  const interactives = 'a, button, [data-cursor-hover]';
  document.addEventListener('mouseover', e => {
    if (e.target.matches(interactives) || e.target.closest(interactives)) {
      dot.classList.add('cursor-hover');
      ring.classList.add('cursor-hover');
    }
  });
  document.addEventListener('mouseout', e => {
    if (e.target.matches(interactives) || e.target.closest(interactives)) {
      dot.classList.remove('cursor-hover');
      ring.classList.remove('cursor-hover');
    }
  });

  // Hide when leaving window
  document.addEventListener('mouseleave', () => {
    dot.style.opacity  = '0';
    ring.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    dot.style.opacity  = '1';
    ring.style.opacity = '1';
  });
}

/* ============================================================
   2. Navbar
   ============================================================ */
function initNavbar() {
  const navbar = qs('.navbar');
  if (!navbar) return;

  const toggle   = qs('.navbar__toggle');
  const mobileMenu = qs('.navbar__mobile');

  let lastScroll = 0;
  let ticking = false;

  function handleScroll() {
    const currentScroll = window.scrollY;

    // Scrolled class (glass effect)
    if (currentScroll > 20) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    // Hide/show on scroll direction
    if (currentScroll > 120) {
      if (currentScroll > lastScroll + 8 && !mobileMenu?.classList.contains('open')) {
        navbar.classList.add('hidden');
      } else if (currentScroll < lastScroll - 4) {
        navbar.classList.remove('hidden');
      }
    } else {
      navbar.classList.remove('hidden');
    }

    lastScroll = Math.max(0, currentScroll);
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(handleScroll);
      ticking = true;
    }
  }, { passive: true });

  // Mobile menu toggle
  if (toggle && mobileMenu) {
    toggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      toggle.classList.toggle('open', isOpen);
      document.body.classList.toggle('menu-open', isOpen);
      toggle.setAttribute('aria-expanded', isOpen.toString());
    });

    // Close on link click
    qsa('.navbar__mobile-link', mobileMenu).forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        toggle.classList.remove('open');
        document.body.classList.remove('menu-open');
      });
    });
  }
}

/* ============================================================
   3. Three.js Hero Scene
   ============================================================ */
function initHeroScene() {
  const canvas = qs('#hero-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const scene    = new THREE.Scene();
  const width    = window.innerWidth;
  const height   = window.innerHeight;

  // Camera
  const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
  camera.position.set(0, 0, 5.5);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  // ── Vault geometry (icosahedron) ──
  const icoGeo  = new THREE.IcosahedronGeometry(1.4, 1);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0xC9A84C,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });
  const icoMesh = new THREE.Mesh(icoGeo, wireMat);
  scene.add(icoMesh);

  // ── Inner solid icosahedron ──
  const innerGeo  = new THREE.IcosahedronGeometry(1.0, 0);
  const innerMat  = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.8,
    roughness: 0.2,
    transparent: true,
    opacity: 0.6,
  });
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  scene.add(innerMesh);

  // ── Outer ring (torus) ──
  const torusGeo  = new THREE.TorusGeometry(2.1, 0.015, 8, 80);
  const torusMat  = new THREE.MeshBasicMaterial({
    color: 0xC9A84C,
    transparent: true,
    opacity: 0.18,
  });
  const torusMesh = new THREE.Mesh(torusGeo, torusMat);
  torusMesh.rotation.x = Math.PI / 3;
  scene.add(torusMesh);

  const torusMesh2 = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.01, 8, 80),
    new THREE.MeshBasicMaterial({ color: 0xC9A84C, transparent: true, opacity: 0.1 })
  );
  torusMesh2.rotation.x = -Math.PI / 4;
  torusMesh2.rotation.y = Math.PI / 5;
  scene.add(torusMesh2);

  // ── Particle field ──
  const particleCount = 400;
  const positions = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    const r     = 3 + Math.random() * 5;
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  const partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const partMat = new THREE.PointsMaterial({
    color: 0xC9A84C,
    size: 0.022,
    transparent: true,
    opacity: 0.45,
    sizeAttenuation: true,
  });

  const particles = new THREE.Points(partGeo, partMat);
  scene.add(particles);

  // ── Lighting ──
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0xC9A84C, 1.5, 8);
  pointLight.position.set(3, 3, 3);
  scene.add(pointLight);

  const pointLight2 = new THREE.PointLight(0x4a6fa5, 0.8, 10);
  pointLight2.position.set(-3, -2, 2);
  scene.add(pointLight2);

  // ── Mouse parallax ──
  let targetX = 0, targetY = 0;
  let currentX = 0, currentY = 0;

  document.addEventListener('mousemove', e => {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    targetX  = (e.clientX - cx) / cx * 0.25;
    targetY  = (e.clientY - cy) / cy * 0.15;
  });

  // ── Clock ──
  const clock = new THREE.Clock();

  // ── Animation loop ──
  function animate() {
    const elapsed = clock.getElapsedTime();

    // Lerp mouse
    currentX += (targetX - currentX) * 0.05;
    currentY += (targetY - currentY) * 0.05;

    // Rotate geometry
    icoMesh.rotation.x  = elapsed * 0.15 + currentY * 0.3;
    icoMesh.rotation.y  = elapsed * 0.22 + currentX * 0.3;
    innerMesh.rotation.x = elapsed * 0.12;
    innerMesh.rotation.y = -elapsed * 0.18;

    torusMesh.rotation.z  = elapsed * 0.08;
    torusMesh2.rotation.z = -elapsed * 0.06;

    particles.rotation.y = elapsed * 0.04 + currentX * 0.1;
    particles.rotation.x = elapsed * 0.02 + currentY * 0.05;

    // Camera gentle drift
    camera.position.x += (currentX * 0.6 - camera.position.x) * 0.04;
    camera.position.y += (-currentY * 0.4 - camera.position.y) * 0.04;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  if (!prefersReducedMotion) {
    animate();
  } else {
    renderer.render(scene, camera);
  }

  // ── Resize handler ──
  const heroSection = canvas.closest('.hero');
  const ro = new ResizeObserver(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  if (heroSection) ro.observe(heroSection);
  else {
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
}

/* ============================================================
   4. Scroll Reveal (IntersectionObserver)
   ============================================================ */
function initScrollReveal() {
  if (prefersReducedMotion) {
    qsa('.reveal, .reveal-left').forEach(el => el.classList.add('visible'));
    return;
  }

  const opts = { threshold: 0.12, rootMargin: '0px 0px -50px 0px' };

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, opts);

  qsa('.reveal, .reveal-left').forEach(el => observer.observe(el));
}

/* ============================================================
   5. Counter Animations
   ============================================================ */
function initCounters() {
  const counters = qsa('[data-counter]');
  if (!counters.length) return;

  const easeOutQuart = t => 1 - Math.pow(1 - t, 4);

  function animateCounter(el) {
    const target   = parseFloat(el.dataset.counter);
    const prefix   = el.dataset.prefix  || '';
    const suffix   = el.dataset.suffix  || '';
    const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals) : 0;
    const duration = 1800;
    let startTime  = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed  = Math.min(timestamp - startTime, duration);
      const progress = easeOutQuart(elapsed / duration);
      const value    = progress * target;

      el.textContent = prefix + value.toFixed(decimals) + suffix;

      if (elapsed < duration) {
        requestAnimationFrame(step);
      } else {
        el.textContent = prefix + target.toFixed(decimals) + suffix;
      }
    }

    requestAnimationFrame(step);
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(el => observer.observe(el));
}

/* ============================================================
   6. Testimonial Carousel
   ============================================================ */
function initTestimonialCarousel() {
  const carousel = qs('.testimonial-carousel');
  if (!carousel) return;

  const track  = qs('.testimonial-track', carousel);
  const slides = qsa('.testimonial-slide', carousel);
  const dots   = qsa('.testimonial-dot', carousel);
  const prevBtn = qs('.testimonial-btn[data-dir="-1"]', carousel);
  const nextBtn = qs('.testimonial-btn[data-dir="1"]',  carousel);

  if (!track || !slides.length) return;

  let current   = 0;
  let autoplay;
  let isDragging = false;
  let startX    = 0;
  let dragDelta = 0;

  function getSlidesVisible() {
    if (window.innerWidth >= 1024) return 3;
    if (window.innerWidth >= 640)  return 2;
    return 1;
  }

  function maxIndex() {
    return Math.max(0, slides.length - getSlidesVisible());
  }

  function goTo(index) {
    current = Math.max(0, Math.min(index, maxIndex()));

    const slideW    = slides[0].getBoundingClientRect().width;
    const gap       = 24; // matches CSS gap var(--space-6)
    const offsetPx  = current * (slideW + gap);
    track.style.transform = `translateX(-${offsetPx}px)`;

    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  function next() { goTo(current + 1 > maxIndex() ? 0 : current + 1); }
  function prev() { goTo(current - 1 < 0 ? maxIndex() : current - 1); }

  // Buttons
  nextBtn?.addEventListener('click', () => { next(); resetAutoplay(); });
  prevBtn?.addEventListener('click', () => { prev(); resetAutoplay(); });

  // Dots
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => { goTo(i); resetAutoplay(); });
  });

  // Keyboard
  carousel.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft')  { prev(); resetAutoplay(); }
    if (e.key === 'ArrowRight') { next(); resetAutoplay(); }
  });

  // Touch/drag
  track.addEventListener('pointerdown', e => {
    isDragging = true;
    startX     = e.clientX;
    dragDelta  = 0;
    track.style.transition = 'none';
    track.setPointerCapture(e.pointerId);
  });

  track.addEventListener('pointermove', e => {
    if (!isDragging) return;
    dragDelta = e.clientX - startX;
  });

  track.addEventListener('pointerup', () => {
    isDragging = false;
    track.style.transition = '';
    if (dragDelta < -50)      { next(); resetAutoplay(); }
    else if (dragDelta > 50)  { prev(); resetAutoplay(); }
    else                      { goTo(current); }
  });

  // Autoplay
  function startAutoplay() {
    autoplay = setInterval(next, 5000);
  }

  function resetAutoplay() {
    clearInterval(autoplay);
    startAutoplay();
  }

  // Resize
  window.addEventListener('resize', () => goTo(current), { passive: true });

  // Init
  goTo(0);
  if (!prefersReducedMotion) startAutoplay();

  // Pause on hover
  carousel.addEventListener('mouseenter', () => clearInterval(autoplay));
  carousel.addEventListener('mouseleave', startAutoplay);
}

/* ============================================================
   7. Smooth Scroll for anchor links
   ============================================================ */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const offset = 80;
      const top    = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  });
}

/* ============================================================
   8. Hero load animation trigger
   ============================================================ */
function initHeroAnimation() {
  const hero = qs('.hero');
  if (!hero) return;

  // Trigger after a short frame to allow layout
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.add('hero-loaded');
    });
  });
}

/* ============================================================
   9. Features card tilt (subtle 3D tilt on hover)
   ============================================================ */
function initCardTilt() {
  if (prefersReducedMotion) return;

  const tiltTargets = [
    '.feature-card', '.product-card',
    '.culture-card', '.cert-badge', '.pillar-card',
    '.benefit-item', '.process-step', '.loan-card',
    '.invest-card',  '.glass-card',  '.svc-stat',
  ].join(', ');

  qsa(tiltTargets).forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect  = card.getBoundingClientRect();
      const x     = (e.clientX - rect.left) / rect.width  - 0.5;
      const y     = (e.clientY - rect.top)  / rect.height - 0.5;
      const depth = card.matches('.glass-card, .svc-stat') ? 4 : 6;
      card.style.transform = `
        translateY(-5px)
        perspective(700px)
        rotateX(${-y * depth}deg)
        rotateY(${x * depth}deg)
      `;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

/* ============================================================
   10. Scroll-triggered Parallax on hero gradient
   ============================================================ */
function initHeroParallax() {
  if (prefersReducedMotion) return;

  const heroContent = qs('.hero__content');
  if (!heroContent) return;

  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollY   = window.scrollY;
        const maxScroll = window.innerHeight;
        const progress  = Math.min(scrollY / maxScroll, 1);
        heroContent.style.transform = `translateY(${progress * 60}px)`;
        heroContent.style.opacity   = `${1 - progress * 1.2}`;
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

/* ============================================================
   11. Page-level Three.js canvas (non-home pages)
       Reads data-scene attribute: "network" | "shield" | "particles" | "vault404"
   ============================================================ */
function initPageCanvas() {
  const canvas = qs('#page-canvas');
  if (!canvas || typeof THREE === 'undefined' || prefersReducedMotion) return;

  const scene   = new THREE.Scene();
  const W       = canvas.parentElement.offsetWidth  || window.innerWidth;
  const H       = canvas.parentElement.offsetHeight || 400;

  const camera  = new THREE.PerspectiveCamera(55, W / H, 0.1, 1000);
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const sceneType = canvas.dataset.scene || 'particles';
  const clock     = new THREE.Clock();
  let   targetX   = 0, targetY   = 0;
  let   currentMX = 0, currentMY = 0;

  document.addEventListener('mousemove', e => {
    targetX = (e.clientX / window.innerWidth  - 0.5) * 0.5;
    targetY = (e.clientY / window.innerHeight - 0.5) * 0.3;
  });

  // ── Scene: network (careers) ──────────────────────
  if (sceneType === 'network') {
    const nodeCount = 28;
    const nodes     = [];
    const nodeGeo   = new THREE.SphereGeometry(0.06, 8, 8);
    const nodeMat   = new THREE.MeshBasicMaterial({ color: 0xC9A84C, transparent: true, opacity: 0.75 });

    for (let i = 0; i < nodeCount; i++) {
      const mesh = new THREE.Mesh(nodeGeo, nodeMat.clone());
      const r    = 1.5 + Math.random() * 2.2;
      const θ    = Math.random() * Math.PI * 2;
      const φ    = Math.acos(2 * Math.random() - 1);
      mesh.position.set(r * Math.sin(φ) * Math.cos(θ), r * Math.sin(φ) * Math.sin(θ), r * Math.cos(φ));
      mesh.userData = { phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.4 };
      scene.add(mesh);
      nodes.push(mesh);
    }

    // Connect nearby nodes with lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0xC9A84C, transparent: true, opacity: 0.12 });
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].position.distanceTo(nodes[j].position) < 1.6) {
          const geo = new THREE.BufferGeometry().setFromPoints([nodes[i].position, nodes[j].position]);
          scene.add(new THREE.Line(geo, lineMat));
        }
      }
    }

    // Outer ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.8, 0.012, 8, 90),
      new THREE.MeshBasicMaterial({ color: 0xC9A84C, transparent: true, opacity: 0.1 })
    );
    ring.rotation.x = Math.PI / 3;
    scene.add(ring);

    const group = new THREE.Group();
    nodes.forEach(n => group.add(n));
    scene.add(group);

    const animate = () => {
      const t = clock.getElapsedTime();
      currentMX += (targetX - currentMX) * 0.04;
      currentMY += (targetY - currentMY) * 0.04;
      group.rotation.y = t * 0.07 + currentMX * 0.4;
      group.rotation.x = t * 0.03 + currentMY * 0.3;
      ring.rotation.z  = t * 0.05;
      nodes.forEach(n => {
        n.material.opacity = 0.45 + 0.3 * Math.sin(t * n.userData.speed + n.userData.phase);
      });
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();
  }

  // ── Scene: shield (security) ──────────────────────
  else if (sceneType === 'shield') {
    const outer = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.8, 2),
      new THREE.MeshBasicMaterial({ color: 0xC9A84C, wireframe: true, transparent: true, opacity: 0.18 })
    );
    scene.add(outer);

    const inner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.2, 1),
      new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.9, roughness: 0.15, transparent: true, opacity: 0.55 })
    );
    scene.add(inner);

    // Orbital ring 1
    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.014, 8, 80),
      new THREE.MeshBasicMaterial({ color: 0xC9A84C, transparent: true, opacity: 0.22 })
    );
    ring1.rotation.x = Math.PI / 2.5;
    scene.add(ring1);

    // Orbital ring 2
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.0, 0.01, 8, 80),
      new THREE.MeshBasicMaterial({ color: 0x10B981, transparent: true, opacity: 0.14 })
    );
    ring2.rotation.x = Math.PI / 1.5;
    ring2.rotation.z = Math.PI / 4;
    scene.add(ring2);

    // Orbiting green particles
    const orbitCount = 60;
    const orbitPos   = new Float32Array(orbitCount * 3);
    for (let i = 0; i < orbitCount; i++) {
      const a = (i / orbitCount) * Math.PI * 2;
      orbitPos[i * 3]     = Math.cos(a) * 2.4;
      orbitPos[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
      orbitPos[i * 3 + 2] = Math.sin(a) * 2.4;
    }
    const orbitGeo = new THREE.BufferGeometry();
    orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPos, 3));
    const orbitPts = new THREE.Points(orbitGeo, new THREE.PointsMaterial({ color: 0x10B981, size: 0.04, transparent: true, opacity: 0.7 }));
    scene.add(orbitPts);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const pLight = new THREE.PointLight(0xC9A84C, 1.5, 10);
    pLight.position.set(3, 3, 3);
    scene.add(pLight);

    const animate = () => {
      const t = clock.getElapsedTime();
      currentMX += (targetX - currentMX) * 0.04;
      currentMY += (targetY - currentMY) * 0.04;
      outer.rotation.y = t * 0.14 + currentMX * 0.4;
      outer.rotation.x = t * 0.08 + currentMY * 0.3;
      inner.rotation.y = -t * 0.2;
      inner.rotation.x =  t * 0.1;
      ring1.rotation.z = t * 0.12;
      ring2.rotation.z = -t * 0.09;
      orbitPts.rotation.y = t * 0.25;
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();
  }

  // ── Scene: vault404 ──────────────────────────────
  else if (sceneType === 'vault404') {
    const pieces = [];
    for (let i = 0; i < 12; i++) {
      const geo = i % 3 === 0
        ? new THREE.TetrahedronGeometry(0.22 + Math.random() * 0.18, 0)
        : i % 3 === 1
          ? new THREE.OctahedronGeometry(0.18 + Math.random() * 0.14, 0)
          : new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xC9A84C, metalness: 0.85, roughness: 0.2,
        wireframe: i > 7,
        transparent: true, opacity: 0.55 + Math.random() * 0.35,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const r    = 1.0 + Math.random() * 1.5;
      const θ    = Math.random() * Math.PI * 2;
      const φ    = Math.acos(2 * Math.random() - 1);
      mesh.position.set(r * Math.sin(φ) * Math.cos(θ), r * Math.sin(φ) * Math.sin(θ), r * Math.cos(φ));
      mesh.userData.rotSpeed = { x: (Math.random() - 0.5) * 0.015, y: (Math.random() - 0.5) * 0.015 };
      mesh.userData.floatPhase = Math.random() * Math.PI * 2;
      scene.add(mesh);
      pieces.push(mesh);
    }

    // Central broken sphere
    const center = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.7, 1),
      new THREE.MeshBasicMaterial({ color: 0xC9A84C, wireframe: true, transparent: true, opacity: 0.3 })
    );
    scene.add(center);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const pl = new THREE.PointLight(0xC9A84C, 1.2, 8);
    pl.position.set(2, 2, 2);
    scene.add(pl);

    // Particle dust
    const dustCount = 200;
    const dustPos   = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3]     = (Math.random() - 0.5) * 7;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 7;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 7;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xC9A84C, size: 0.018, transparent: true, opacity: 0.35 })));

    const animate = () => {
      const t = clock.getElapsedTime();
      currentMX += (targetX - currentMX) * 0.04;
      currentMY += (targetY - currentMY) * 0.04;
      center.rotation.y = t * 0.18 + currentMX * 0.5;
      center.rotation.x = t * 0.1  + currentMY * 0.4;
      pieces.forEach((p, i) => {
        p.rotation.x += p.userData.rotSpeed.x;
        p.rotation.y += p.userData.rotSpeed.y;
        p.position.y += Math.sin(t * 0.6 + p.userData.floatPhase) * 0.002;
      });
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();
  }

  // ── Scene: particles (default / forgot-password) ──
  else {
    const count = 250;
    const pos   = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xC9A84C, size: 0.022, transparent: true, opacity: 0.3, sizeAttenuation: true }));
    scene.add(pts);

    // Two slow rings
    [2.2, 3.0].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.008, 6, 70),
        new THREE.MeshBasicMaterial({ color: 0xC9A84C, transparent: true, opacity: 0.08 + i * 0.04 })
      );
      ring.rotation.x = Math.PI / (3 + i);
      scene.add(ring);
    });

    const animate = () => {
      const t = clock.getElapsedTime();
      currentMX += (targetX - currentMX) * 0.03;
      currentMY += (targetY - currentMY) * 0.03;
      pts.rotation.y = t * 0.03 + currentMX * 0.15;
      pts.rotation.x = t * 0.015 + currentMY * 0.1;
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();
  }

  // Resize
  const ro = new ResizeObserver(() => {
    const parent = canvas.parentElement;
    const w = parent.offsetWidth, h = parent.offsetHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(canvas.parentElement);
}

/* ============================================================
   12. Scroll Progress Bar
   ============================================================ */
function initScrollProgress() {
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Page scroll progress');
  document.body.prepend(bar);

  window.addEventListener('scroll', () => {
    const scrollTop  = window.scrollY;
    const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
    const pct        = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width  = pct + '%';
  }, { passive: true });
}

/* ============================================================
   13. Button Ripple Effect
   ============================================================ */
function initButtonRipple() {
  if (prefersReducedMotion) return;

  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    btn.style.setProperty('--ripple-x', (e.clientX - rect.left) + 'px');
    btn.style.setProperty('--ripple-y', (e.clientY - rect.top) + 'px');
    btn.classList.remove('ripple');
    void btn.offsetWidth; // reflow
    btn.classList.add('ripple');
  });
}

/* ============================================================
   Bootstrap
   ============================================================ */
function init() {
  initCursor();
  initNavbar();
  initScrollProgress();
  initButtonRipple();
  initHeroAnimation();
  initHeroParallax();
  initScrollReveal();
  initCounters();
  initTestimonialCarousel();
  initSmoothScroll();
  initCardTilt();

  // Three.js scenes — defer to window load so canvas has real layout dimensions
  if (typeof THREE !== 'undefined') {
    requestAnimationFrame(initHeroScene);
    requestAnimationFrame(initPageCanvas);
  } else {
    window.addEventListener('load', () => {
      if (typeof THREE !== 'undefined') {
        initHeroScene();
        initPageCanvas();
      }
    }, { once: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
