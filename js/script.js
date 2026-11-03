/* ==========================================================================
   Long.Play — 3D hero scene (Three.js r128)
   - Sky gradient, soft clouds, distant mountains
   - Rolling terrain with ~16k wind-animated, mouse-reactive grass blades
   - Retro TV with spring-damper physics, shadows and screen glow
   - Floating light particles
   - Mouse parallax with smooth return to rest; idle animation keeps running
   ========================================================================== */
(() => {
  'use strict';

  const canvas = document.getElementById('scene');
  const isMobile =
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
    Math.min(window.innerWidth, window.innerHeight) < 600;

  /* ---------- Renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb9a0c8, 26, 95);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 400);
  const LOOK = new THREE.Vector3(0, 2.9, 0);
  const camBase = new THREE.Vector3(0, 2.0, 9);

  /* ---------- Helpers ---------- */
  // Terrain height at (x, z). Used for both the mesh and for placing grass/TV.
  function hill(x, z) {
    return (
      0.55 * Math.sin(x * 0.22 + 0.4) * Math.cos(z * 0.18) +
      0.4 * Math.cos(z * 0.35 + x * 0.12) +
      1.8 * Math.exp(-(x * x + (z + 0.5) * (z + 0.5)) / 22)
    );
  }

  function radialTexture(stops, size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => grd.addColorStop(o, col));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  function cloudTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const x = 40 + Math.random() * 176;
      const y = 64 + (Math.random() - 0.5) * 34;
      const r = 26 + Math.random() * 30;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return new THREE.CanvasTexture(c);
  }

  const softTex = radialTexture([
    [0, 'rgba(255,255,240,1)'],
    [0.25, 'rgba(255,240,200,0.6)'],
    [1, 'rgba(255,240,200,0)'],
  ]);
  const glowTex = radialTexture(
    [
      [0, 'rgba(255,240,190,1)'],
      [0.35, 'rgba(255,200,120,0.35)'],
      [1, 'rgba(255,180,100,0)'],
    ],
    256
  );

  /* ---------- Sky (gradient dome) ---------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x3956cc) },
        mid: { value: new THREE.Color(0x8290e2) },
        hor: { value: new THREE.Color(0xf6c4c4) },
      },
      vertexShader: `
        varying vec3 vP;
        void main() {
          vP = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 hor;
        varying vec3 vP;
        void main() {
          float h = normalize(vP).y;
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.7, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  scene.add(sky);

  /* ---------- Sun glow + light shafts (sunset) ---------- */
  const sunGroup = new THREE.Group();
  sunGroup.position.set(14, 6, -70);
  scene.add(sunGroup);
  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffb070,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  sunGlow.scale.set(60, 60, 1);
  sunGroup.add(sunGlow);

  const shaftMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0,
    transparent: true,
    opacity: 0.07,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const shafts = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(2.5 + Math.random() * 3, 40), shaftMat);
    shaft.position.set(-4 + i * 3.2, 14, -4 - i * 2);
    shaft.rotation.set(0.2, 0.35, -0.25 - Math.random() * 0.15);
    shafts.add(shaft);
  }
  scene.add(shafts);

  /* ---------- Clouds (far layer) ---------- */
  const clouds = new THREE.Group();
  scene.add(clouds);
  const cloudMap = cloudTexture();
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.5 + Math.random() * 0.25,
      color: i % 3 === 0 ? 0xffd9e4 : 0xf2f4ff,
    });
    const s = new THREE.Sprite(mat);
    const w = 14 + Math.random() * 14;
    s.scale.set(w, w * 0.5, 1);
    s.position.set(-60 + Math.random() * 120, 11 + Math.random() * 10, -35 - Math.random() * 20);
    s.userData.speed = 0.15 + Math.random() * 0.25;
    clouds.add(s);
  }

  /* ---------- Mountains (distant layer) ---------- */
  const mountains = new THREE.Group();
  scene.add(mountains);
  const mtnMat = new THREE.MeshLambertMaterial({ color: 0x4a4c98, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const r = 7 + Math.random() * 7;
    const h = 4 + Math.random() * 6;
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6 + (i % 3), 1), mtnMat);
    m.position.set(-62 + i * 9.5 + Math.random() * 4, h / 2 - 1.5, -55 - Math.random() * 8);
    mountains.add(m);
  }

  /* ---------- Field (terrain + grass) ---------- */
  const fieldGroup = new THREE.Group();
  scene.add(fieldGroup);

  const groundGeo = new THREE.PlaneGeometry(120, 60, 160, 80);
  groundGeo.rotateX(-Math.PI / 2);
  {
    const p = groundGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, hill(p.getX(i), p.getZ(i)) - 0.05);
    }
    groundGeo.computeVertexNormals();
  }
  {
    const p = groundGeo.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const lo = new THREE.Color(0x24391a);
    const hi = new THREE.Color(0x7a7a34);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const n = 0.5 + 0.5 * Math.sin(x * 0.4 + z * 0.27) * Math.cos(z * 0.31);
      const k = Math.min(1, Math.max(0, (p.getY(i) + 0.5) / 3.0));
      c.copy(lo).lerp(hi, k * 0.7 + n * 0.3);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  fieldGroup.add(ground);

  // Single thin tapered blade, base at y=0, tip at y=1
  const bladeGeo = new THREE.PlaneGeometry(0.07, 1, 1, 5);
  bladeGeo.translate(0, 0.5, 0);
  {
    const p = bladeGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) * (1 - y * 0.85) + y * y * 0.05);
      p.setZ(i, p.getZ(i) + y * y * 0.15);
    }
    bladeGeo.computeVertexNormals();
  }

  // Uniforms shared by the grass shader (wind + mouse push)
  const grassUniforms = {
    uTime: { value: 0 },
    uWind: { value: 1 },
    uMouse: { value: new THREE.Vector2(999, 999) },
  };

  const grassMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, grassUniforms);
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\nuniform vec2 uMouse;\nvarying float vH;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        vec3 transformed = vec3(position);
        vec4 baseW = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float h = position.y;
        vH = h;
        float h2 = h * h;

        // Wind: layered sines so neighbouring blades move differently
        float g = sin(uTime * 1.4 + baseW.x * 0.45 + baseW.z * 0.3)
                + 0.45 * sin(uTime * 2.9 + baseW.x * 1.1 - baseW.z * 0.7);
        transformed.x += g * h2 * 0.32 * uWind;
        transformed.z += cos(uTime * 1.1 + baseW.z * 0.5) * h2 * 0.18 * uWind;

        // Mouse: blades bend away from the cursor
        vec2 dm = baseW.xz - uMouse;
        float dl = length(dm);
        float push = smoothstep(1.6, 0.0, dl);
        transformed.x += (dm.x / (dl + 0.001)) * push * h2 * 0.9;
        transformed.z += (dm.y / (dl + 0.001)) * push * h2 * 0.9;
        `
      );
    shader.fragmentShader =
      'varying float vH;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n        diffuseColor.rgb *= mix(0.35, 1.0, vH);'
      );
  };

  const BLADES = isMobile ? 9000 : 24000;
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, BLADES);
  grass.castShadow = true;
  grass.receiveShadow = true;

  const palette = [
    new THREE.Color(0x2f5a22),
    new THREE.Color(0x6b8f2e),
    new THREE.Color(0xb7a040),
    new THREE.Color(0x8fa23a),
    new THREE.Color(0x3e6b2a),
    new THREE.Color(0xd4b25a),
    new THREE.Color(0xe0c070),
  ];
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    for (let i = 0; i < BLADES; i++) {
      const x = (Math.random() * 2 - 1) * 15;
      const z = -3 + Math.random() * 10;
      pos.set(x, hill(x, z) - 0.02, z);
      e.set((Math.random() - 0.5) * 0.45, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.45);
      q.setFromEuler(e);
      s.set(0.8 + Math.random() * 0.5, 0.45 + Math.random() * 1.05, 1);
      m.compose(pos, q, s);
      grass.setMatrixAt(i, m);
      const c = palette[(Math.random() * palette.length) | 0].clone();
      c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);
      grass.setColorAt(i, c);
    }
    grass.instanceMatrix.needsUpdate = true;
    grass.instanceColor.needsUpdate = true;
  }
  fieldGroup.add(grass);

  /* ---------- Retro TV ---------- */
  const tvGroup = new THREE.Group();
  const TV_SCALE = 1.35;
  const tvBaseY = hill(0, 0) - 0.6; // sink base into the crest so TV sits at ~55% height
  tvGroup.position.set(0, tvBaseY, 0);
  tvGroup.scale.setScalar(TV_SCALE);
  scene.add(tvGroup);

  function roundRectShape(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  const TV_Y = 0.95; // body centre height in TV-local units
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x2c46a8,
    roughness: 0.4,
    metalness: 0.05,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
  });
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundRectShape(1.35, 1.05, 0.14), {
      depth: 0.75,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 5,
      curveSegments: 10,
    }),
    bodyMat
  );
  body.position.y = TV_Y;
  body.castShadow = true;
  body.receiveShadow = true;
  tvGroup.add(body);

  // Dark bezel behind the glowing screen
  const bezel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.02, 0.82),
    new THREE.MeshStandardMaterial({ color: 0x080707, roughness: 0.7 })
  );
  bezel.position.set(0, TV_Y + 0.02, 0.83);
  tvGroup.add(bezel);

  // Screen: warm white centre fading to amber edges
  const screenTex = radialTexture(
    [
      [0, 'rgba(255,255,250,1)'],
      [0.5, 'rgba(255,246,200,1)'],
      [1, 'rgba(255,190,80,1)'],
    ],
    256
  );
  const screenMat = new THREE.MeshBasicMaterial({
    map: screenTex,
    color: new THREE.Color(1.6, 1.5, 1.25),
    toneMapped: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.72), screenMat);
  screen.position.set(0, TV_Y + 0.02, 0.845);
  tvGroup.add(screen);

  // Glass sheen
  const sheen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.72),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.06,
      roughness: 0.05,
      metalness: 0.0,
    })
  );
  sheen.position.set(0, TV_Y + 0.02, 0.85);
  tvGroup.add(sheen);

  // Feet
  const footMat = new THREE.MeshStandardMaterial({ color: 0x141211, roughness: 0.6 });
  [-0.42, 0.42].forEach((x) => {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.42, 12), footMat);
    f.position.set(x, 0.21, 0.2);
    f.castShadow = true;
    tvGroup.add(f);
  });

  // Side knobs
  const knobMat = new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 0.35, metalness: 0.6 });
  [0.2, 0.45].forEach((y) => {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 14), knobMat);
    k.rotation.z = Math.PI / 2;
    k.position.set(0.7, TV_Y - 0.45 + y * 0.5, 0.45);
    tvGroup.add(k);
  });

  // Antennas (V-shape, pivot at top centre)
  const antGroup = new THREE.Group();
  antGroup.position.set(0, TV_Y + 0.55, 0.35);
  tvGroup.add(antGroup);
  const antMat = new THREE.MeshStandardMaterial({ color: 0xbfc4cc, metalness: 0.9, roughness: 0.28 });
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.rotation.z = side * 0.42;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 8), antMat);
    rod.position.y = 0.7;
    rod.castShadow = true;
    pivot.add(rod);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), antMat);
    tip.position.y = 1.4;
    pivot.add(tip);
    antGroup.add(pivot);
  });

  // Warm light from the screen onto the grass
  const screenLight = new THREE.PointLight(0xffd8a0, 2.2, 7, 1.6);
  screenLight.position.set(0, TV_Y, 1.4);
  tvGroup.add(screenLight);

  // Glow halo (additive sprite)
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffe3a0,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  halo.scale.set(3.4, 2.7, 1);
  halo.position.set(0, TV_Y, 0.9);
  tvGroup.add(halo);

  const haloWide = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffc98a,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  haloWide.scale.set(7.5, 5.8, 1);
  haloWide.position.set(0, TV_Y, 0.4);
  tvGroup.add(haloWide);

  /* ---------- Floating particles (foreground layer) ---------- */
  const PN = isMobile ? 180 : 380;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PN * 3);
  const pBase = new Float32Array(PN * 3);
  const pSeed = new Float32Array(PN * 2);
  for (let i = 0; i < PN; i++) {
    pBase[i * 3] = (Math.random() * 2 - 1) * 14;
    pBase[i * 3 + 1] = 0.5 + Math.random() * 8.5;
    pBase[i * 3 + 2] = -6 + Math.random() * 12;
    pSeed[i * 2] = Math.random() * 10;
    pSeed[i * 2 + 1] = Math.random() * 10;
  }
  pPos.set(pBase);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      size: 0.22,
      map: softTex,
      color: 0xfff2cc,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
  );
  scene.add(particles);

  /* ---------- Lights ---------- */
  const hemi = new THREE.HemisphereLight(0x9fb7ff, 0x2a3d1a, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd0a0, 1.7);
  sun.position.set(-7, 9, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0008;
  sun.shadow.radius = 4;
  sun.target.position.set(0, 1.5, 0);
  scene.add(sun);
  scene.add(sun.target);

  /* ---------- Input ---------- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0, last: -1e9 };
  const IDLE_MS = 2500;

  window.addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    mouse.last = performance.now();
  });

  // Ray plane used to convert the cursor into a point on the grass
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const grassPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2.0);
  const hitPoint = new THREE.Vector3();
  const mouseGrass = new THREE.Vector2(999, 999);

  /* ---------- Spring-damper for the TV (inertia) ---------- */
  const tvYaw = { x: 0, v: 0 };
  const tvPitch = { x: 0, v: 0 };
  function spring(s, target, dt, k, d) {
    const a = (target - s.x) * k - s.v * d;
    s.v += a * dt;
    s.x += s.v * dt;
  }

  /* ---------- Responsive camera ---------- */
  function applyCameraFit() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.fov = aspect < 0.8 ? 58 : 42;
    camBase.z = aspect < 0.8 ? 13 : aspect < 1.2 ? 11 : 9;
    camera.updateProjectionMatrix();
  }
  applyCameraFit();

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyCameraFit();
  });

  /* ---------- Loop ---------- */
  let t = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;

    // Cursor easing: returns to rest when the mouse stops
    const idle = now - mouse.last > IDLE_MS;
    const tx = idle ? 0 : mouse.tx;
    const ty = idle ? 0 : mouse.ty;
    const k = 1 - Math.exp(-dt * 2.2);
    mouse.x += (tx - mouse.x) * k;
    mouse.y += (ty - mouse.y) * k;

    // Camera: gentle parallax + slow autonomous drift (runs without mouse)
    camera.position.set(
      camBase.x + mouse.x * 1.4 + Math.sin(t * 0.13) * 0.22,
      camBase.y + mouse.y * 0.5 + Math.sin(t * 0.17) * 0.06,
      camBase.z
    );
    camera.lookAt(LOOK.x + mouse.x * 0.25, LOOK.y + mouse.y * 0.12, LOOK.z);

    // Layer parallax: far layers move less, near layers move more
    sky.position.copy(camera.position); // sky dome follows the camera
    clouds.position.x = -mouse.x * 0.15;
    mountains.position.x = -mouse.x * 0.5;
    fieldGroup.position.x = -mouse.x * 0.9;
    particles.position.x = -mouse.x * 1.4;

    // Cursor -> point on grass (smoothly tracked)
    if (!idle) {
      ndc.set(mouse.tx, -mouse.ty);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(grassPlane, hitPoint)) {
        mouseGrass.set(hitPoint.x - fieldGroup.position.x, hitPoint.z);
      }
    } else {
      mouseGrass.set(999, 999);
    }
    grassUniforms.uMouse.value.lerp(mouseGrass, 1 - Math.exp(-dt * 6));
    grassUniforms.uTime.value = t;
    grassUniforms.uWind.value = 1 + 0.3 * Math.sin(t * 0.3);

    // TV: spring physics driven by mouse + autonomous sway
    const yawTarget = mouse.x * 0.5 + Math.sin(t * 0.55) * 0.09;
    const pitchTarget = mouse.y * 0.18 + Math.sin(t * 0.8) * 0.025;
    spring(tvYaw, yawTarget, dt, 26, 5.5);
    spring(tvPitch, pitchTarget, dt, 22, 5);
    tvGroup.rotation.set(
      tvPitch.x,
      tvYaw.x,
      -0.07 + Math.sin(t * 0.7) * 0.02 - tvYaw.v * 0.01
    );
    tvGroup.position.y = tvBaseY + Math.sin(t * 0.9) * 0.05;

    // Screen breathes slightly
    const pulse = Math.sin(t * 2.1);
    halo.material.opacity = 0.66 + 0.06 * pulse;
    screenMat.color.setRGB(1.8 + 0.05 * pulse, 1.75 + 0.04 * pulse, 1.35);
    screenLight.intensity = 2.2 + 0.15 * pulse;

    // Clouds drift and wrap
    clouds.children.forEach((c) => {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 70) c.position.x = -70;
    });

    // Particles float on their own sine paths
    for (let i = 0; i < PN; i++) {
      const sx = pSeed[i * 2];
      const sy = pSeed[i * 2 + 1];
      pPos[i * 3] = pBase[i * 3] + Math.sin(t * 0.25 + sx) * 0.5;
      pPos[i * 3 + 1] = pBase[i * 3 + 1] + Math.sin(t * 0.45 + sy) * 0.4;
      pPos[i * 3 + 2] = pBase[i * 3 + 2] + Math.cos(t * 0.2 + sx) * 0.3;
    }
    pGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  }

  requestAnimationFrame(frame);
})();
