/* ================================================================
   SKY RUNNER 3D — endless runner built with Three.js
   ================================================================ */
(function () {
  'use strict';

  // ---------- ค่าคงที่ของเกม ----------
  const LANES = [-2.4, 0, 2.4];       // ตำแหน่ง x ของ 3 เลน
  const ROAD_WIDTH = 8;
  const SEG_DEPTH = 8;                // ความลึกของแผ่นพื้นแต่ละชิ้น
  const SEG_COUNT = 22;               // จำนวนแผ่นพื้นที่หมุนเวียนใช้
  const SPAWN_Z = -150;               // จุดเกิดสิ่งกีดขวาง
  const KILL_Z = 14;                  // เลยจุดนี้แล้วรีไซเคิล
  const GRAVITY = -30;
  const JUMP_VELOCITY = 11.5;
  const SLIDE_TIME = 0.7;
  const BASE_SPEED = 13;
  const MAX_SPEED = 34;
  const SPEED_RAMP = 0.22;            // ความเร็วเพิ่มต่อวินาที
  const LANE_LERP = 12;               // ความไวการเปลี่ยนเลน

  // ---------- เซฟถาวร (เงิน + เลเวลอัพเกรด) ----------
  let save = { money: 0, hp: 0, score: 0, bonus: 0, pets: {}, pet: null, chars: { runner: true }, char: 'runner', music: true };
  try {
    const raw = JSON.parse(localStorage.getItem('skyrunner-save'));
    if (raw) save = Object.assign(save, raw);
  } catch (e) { /* เซฟเสีย ใช้ค่าเริ่มต้น */ }
  if (!save.pets) save.pets = {};
  if (!save.chars) save.chars = { runner: true };
  save.chars.runner = true;

  // ---------- ตัวละคร (คุกกี้แต่ละตัวมีความสามารถเฉพาะ) ----------
  const CHARS = {
    runner: { icon: '🏃', name: 'นักวิ่งหน้าใหม่', price: 0,
              info: 'สมดุลทุกด้าน',
              colors: { shirt: 0x3d8bff, pants: 0x2b3a55, hair: 0x4a3220, skin: 0xf2c19a } },
    ninja:  { icon: '🥷', name: 'นินจาเงา', price: 2500,
              info: 'กระโดดสูงขึ้น 15% สไลด์นานขึ้น 45%',
              jumpMult: 1.15, slideMult: 1.45, accessory: 'scarf',
              colors: { shirt: 0x333344, pants: 0x222230, hair: 0x15151f, skin: 0xe8b48c } },
    knight: { icon: '🛡️', name: 'อัศวินเกราะทอง', price: 4000,
              info: 'HP +50 และชนเจ็บลดครึ่ง',
              hpBonus: 50, dmgMult: 0.5, accessory: 'helmet',
              colors: { shirt: 0xd4af37, pants: 0x8a7020, hair: 0x4a3220, skin: 0xf2c19a } },
    witch:  { icon: '🧙‍♀️', name: 'แม่มดมินท์', price: 6000,
              info: 'แต้ม x1.25 และโบนัสไทม์ยาวขึ้น 25%',
              scoreMult: 1.25, bonusMult: 1.25, accessory: 'hat',
              colors: { shirt: 0x7a4fd0, pants: 0x4a2f80, hair: 0x53e0c4, skin: 0xf7d8c0 } },
    thief:  { icon: '🦝', name: 'จอมโจรราตรี', price: 8000,
              info: 'ได้เงินจากเหรียญ x1.5',
              coinMult: 1.5, accessory: 'mask',
              colors: { shirt: 0x8b2635, pants: 0x2a1a20, hair: 0x33202a, skin: 0xefc4a0 } },
  };
  function CH() { return CHARS[save.char && save.chars[save.char] ? save.char : 'runner']; }

  // ---------- เพื่อนซี้ (Pet สไตล์ Cookie Run) ----------
  const PETS = {
    chick:  { icon: '🐤', name: 'เจี๊ยบทอง',   price: 500,  cd: 5,  info: 'ทุก 5 วิ ออกไข่ทอง +30 แต้ม' },
    fairy:  { icon: '💗', name: 'แฟรี่หัวใจ',  price: 800,  cd: 6,  info: 'ทุก 6 วิ ฟื้นเลือด 8' },
    magbot: { icon: '🤖', name: 'แม็กบอท',    price: 1200, cd: 10, info: 'ทุก 10 วิ เปิดแม่เหล็ก 3 วิ' },
    turtle: { icon: '🐢', name: 'เต่าโล่',     price: 1800, cd: 15, info: 'ทุก 15 วิ สร้างโล่ให้ (ถ้ายังไม่มี)' },
  };
  function currentPet() { return save.pet && save.pets[save.pet] ? save.pet : null; }
  let petTimer = 0;                   // คูลดาวน์สกิลสัตว์เลี้ยง
  function persistSave() { localStorage.setItem('skyrunner-save', JSON.stringify(save)); }

  const UPGRADE_MAX = 10;
  function upgradeCost(level) { return Math.floor(100 * Math.pow(1.55, level)); }
  function maxHP() { return 100 + 20 * save.hp + (CH().hpBonus || 0); }
  function scoreMult() { return (1 + 0.1 * save.score) * (CH().scoreMult || 1); }
  function bonusDuration() { return (6 + 0.8 * save.bonus) * (CH().bonusMult || 1); }

  // ---------- สถานะเกม ----------
  let state = 'menu';                 // menu | playing | over
  let speed = BASE_SPEED;
  let distance = 0;
  let coins = 0;
  let coinPoints = 0;                 // แต้มจากเหรียญ (ช่วงโบนัสได้ x2)
  let hp = maxHP();                   // เลือดแบบ Cookie Run: ลดตามเวลา ชนแล้วลดฮวบ
  let best = Number(localStorage.getItem('skyrunner-best') || 0);
  let targetLane = 1;
  let playerX = 0;
  let playerY = 0;                    // ความสูงจากพื้น (กระโดด)
  let velocityY = 0;
  let onGround = true;
  let slideTimer = 0;
  let crashTimer = 0;
  let spawnDistance = 0;              // ระยะสะสมสำหรับเกิดของ
  let runTime = 0;
  let smashBonus = 0;                 // คะแนนโบนัสจากการชนสิ่งกีดขวางแตก

  // ---------- Bonus Time (สไตล์ Cookie Run) ----------
  let bonusTimer = 0;                 // > 0 = กำลังอยู่ในช่วงโบนัส
  let nextBonusAt = 400;              // ระยะทางที่จะเริ่มโบนัสครั้งถัดไป

  // ---------- สถานะไอเทม (สไตล์ Cookie Run) ----------
  const MAGNET_TIME = 8, BOOST_TIME = 3.5, GIANT_TIME = 6;
  let magnetTimer = 0;
  let boostTimer = 0;
  let giantTimer = 0;
  let invulnTimer = 0;                // อมตะชั่วคราวหลังโล่แตก
  let shieldOn = false;
  let giantScale = 1;
  let slideFactor = 1;
  let lastItemDistance = 0;
  let nextItemGap = 40;               // ระยะทางขั้นต่ำก่อนไอเทมชิ้นถัดไป

  // ---------- Three.js พื้นฐาน ----------
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const NORMAL_SKY = new THREE.Color(0x8ec9ee);
  const BONUS_SKY = new THREE.Color(0xffd9a0);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec9ee);
  scene.fog = new THREE.Fog(0x8ec9ee, 55, 145);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 4.6, 8.5);
  camera.lookAt(0, 1.4, -8);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- แสง ----------
  scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x7a6f5a, 0.85));
  const sun = new THREE.DirectionalLight(0xfff2d9, 1.15);
  sun.position.set(10, 22, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 10;  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 80;
  scene.add(sun);

  // ---------- วัสดุที่ใช้ร่วมกัน ----------
  const MAT = {
    stone:   new THREE.MeshLambertMaterial({ color: 0x9aa3b0 }),
    stoneDk: new THREE.MeshLambertMaterial({ color: 0x7d8695 }),
    edge:    new THREE.MeshLambertMaterial({ color: 0x6b7484 }),
    line:    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
    grass:   new THREE.MeshLambertMaterial({ color: 0x6fbf5e }),
    dirt:    new THREE.MeshLambertMaterial({ color: 0x9c7a52 }),
    trunk:   new THREE.MeshLambertMaterial({ color: 0x7a5636 }),
    leaf:    new THREE.MeshLambertMaterial({ color: 0x3f9e4d }),
    cloud:   new THREE.MeshLambertMaterial({ color: 0xffffff }),
    gold:    new THREE.MeshLambertMaterial({ color: 0xffd54a, emissive: 0x8a6a00 }),
    danger:  new THREE.MeshLambertMaterial({ color: 0xe05548 }),
    dangerW: new THREE.MeshLambertMaterial({ color: 0xf5f0e8 }),
    wood:    new THREE.MeshLambertMaterial({ color: 0xa8763e }),
    skin:    new THREE.MeshLambertMaterial({ color: 0xf2c19a }),
    shirt:   new THREE.MeshLambertMaterial({ color: 0x3d8bff }),
    pants:   new THREE.MeshLambertMaterial({ color: 0x2b3a55 }),
    shoe:    new THREE.MeshLambertMaterial({ color: 0xf5f0e8 }),
    hair:    new THREE.MeshLambertMaterial({ color: 0x4a3220 }),
    magnetR: new THREE.MeshLambertMaterial({ color: 0xe23b3b, emissive: 0x551111 }),
    magnetW: new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }),
    bubble:  new THREE.MeshLambertMaterial({ color: 0x66ccff, transparent: true, opacity: 0.32, emissive: 0x2266aa, depthWrite: false }),
    bubbleI: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x88aacc }),
    rocketR: new THREE.MeshLambertMaterial({ color: 0xff5533, emissive: 0x441111 }),
    rocketW: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    potion:  new THREE.MeshLambertMaterial({ color: 0x59d64f, transparent: true, opacity: 0.9, emissive: 0x1a5514 }),
    flame:   new THREE.MeshBasicMaterial({ color: 0xffaa33 }),
    heart:   new THREE.MeshLambertMaterial({ color: 0xff4d6d, emissive: 0x66101f }),
  };

  // ---------- ธีมฉาก (เปลี่ยนตามระยะทางแบบด่าน Cookie Run) ----------
  const THEMES = [
    { name: '☁️ ทุ่งเมฆสีคราม', sky: 0x8ec9ee, grass: 0x6fbf5e, leaf: 0x3f9e4d, trunk: 0x7a5636,
      dirt: 0x9c7a52, stone: 0x9aa3b0, stoneDk: 0x7d8695, edge: 0x6b7484, cloud: 0xffffff, sun: 0xfff2d9 },
    { name: '🌲 ป่ามรกต', sky: 0x9fd8b0, grass: 0x4aa348, leaf: 0x1f7a33, trunk: 0x5f4426,
      dirt: 0x7a5f42, stone: 0x8fa08a, stoneDk: 0x71856f, edge: 0x5c7059, cloud: 0xeafff0, sun: 0xe8ffd9 },
    { name: '🌋 ภูเขาไฟคำราม', sky: 0xe08a5a, grass: 0x7a5348, leaf: 0xd25f2a, trunk: 0x4a3328,
      dirt: 0x5f4038, stone: 0x6a5f66, stoneDk: 0x544a52, edge: 0x453d44, cloud: 0x9a8a88, sun: 0xffb27a },
    { name: '🌌 ราตรีอวกาศ', sky: 0x232348, grass: 0x6a5fd0, leaf: 0x9a7ae8, trunk: 0x3a3358,
      dirt: 0x44406a, stone: 0x7a7a9a, stoneDk: 0x5f5f80, edge: 0x4a4a68, cloud: 0x9a86e0, sun: 0xcdd6ff },
  ];
  const THEME_DISTANCE = 550;         // วิ่งกี่เมตรถึงเปลี่ยนฉาก
  const THEME_MATS = [
    [MAT.grass, 'grass'], [MAT.leaf, 'leaf'], [MAT.trunk, 'trunk'], [MAT.dirt, 'dirt'],
    [MAT.stone, 'stone'], [MAT.stoneDk, 'stoneDk'], [MAT.edge, 'edge'], [MAT.cloud, 'cloud'],
  ];
  const themeTargets = {};
  for (const key of ['sky', 'grass', 'leaf', 'trunk', 'dirt', 'stone', 'stoneDk', 'edge', 'cloud', 'sun']) {
    themeTargets[key] = new THREE.Color(THEMES[0][key]);
  }
  let themeIndex = 0;
  function setTheme(i) {
    themeIndex = i;
    const th = THEMES[i];
    for (const key of Object.keys(themeTargets)) themeTargets[key].setHex(th[key]);
  }

  // ---------- พื้นทางวิ่ง (แผ่นหมุนเวียน) ----------
  const roadSegments = [];
  (function buildRoad() {
    const topGeo = new THREE.BoxGeometry(ROAD_WIDTH, 0.5, SEG_DEPTH);
    const baseGeo = new THREE.BoxGeometry(ROAD_WIDTH - 1.2, 1.4, SEG_DEPTH - 1.5);
    const lineGeo = new THREE.BoxGeometry(0.08, 0.02, SEG_DEPTH * 0.55);
    for (let i = 0; i < SEG_COUNT; i++) {
      const seg = new THREE.Group();
      const top = new THREE.Mesh(topGeo, i % 2 ? MAT.stone : MAT.stoneDk);
      top.position.y = -0.25;
      top.receiveShadow = true;
      seg.add(top);
      const base = new THREE.Mesh(baseGeo, MAT.edge);
      base.position.y = -1.2;
      seg.add(base);
      for (const x of [-1.2, 1.2]) {
        const line = new THREE.Mesh(lineGeo, MAT.line);
        line.position.set(x, 0.01, 0);
        seg.add(line);
      }
      seg.position.z = -i * SEG_DEPTH + 20;
      scene.add(seg);
      roadSegments.push(seg);
    }
  })();

  // ---------- เกาะลอยข้างทาง ----------
  const islands = [];
  function makeTree(scale) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1, 6), MAT.trunk);
    trunk.position.y = 0.5;
    t.add(trunk);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 7), MAT.leaf);
    leaf.position.y = 1.7;
    t.add(leaf);
    t.scale.setScalar(scale);
    return t;
  }
  function makeIsland() {
    const g = new THREE.Group();
    const r = 2 + Math.random() * 2.5;
    const topper = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, 0.5, 9), MAT.grass);
    g.add(topper);
    const rock = new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, r * 1.6, 8), MAT.dirt);
    rock.rotation.x = Math.PI;
    rock.position.y = -r * 0.8 - 0.2;
    g.add(rock);
    const trees = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < trees; i++) {
      const tree = makeTree(0.7 + Math.random() * 0.8);
      tree.position.set((Math.random() - 0.5) * r, 0.25, (Math.random() - 0.5) * r);
      g.add(tree);
    }
    return g;
  }
  for (let i = 0; i < 14; i++) {
    const isl = makeIsland();
    resetIsland(isl, true);
    scene.add(isl);
    islands.push(isl);
  }
  function resetIsland(isl, randomZ) {
    const side = Math.random() < 0.5 ? -1 : 1;
    isl.position.set(
      side * (9 + Math.random() * 16),
      -2 - Math.random() * 6,
      randomZ ? -Math.random() * 170 + 10 : SPAWN_Z - Math.random() * 40
    );
    isl.userData.bobPhase = Math.random() * Math.PI * 2;
    isl.userData.baseY = isl.position.y;
  }

  // ---------- เมฆ ----------
  const clouds = [];
  function makeCloud() {
    const g = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.8 + Math.random() * 0.9, 8, 6), MAT.cloud);
      s.position.set(i * 1.1 - n * 0.55, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.8);
      g.add(s);
    }
    return g;
  }
  for (let i = 0; i < 10; i++) {
    const c = makeCloud();
    c.position.set((Math.random() - 0.5) * 70, 8 + Math.random() * 12, -Math.random() * 180 + 10);
    c.userData.drift = 0.3 + Math.random() * 0.5;
    scene.add(c);
    clouds.push(c);
  }

  // ---------- ตัวละครผู้เล่น ----------
  const player = new THREE.Group();
  const rig = {};
  (function buildPlayer() {
    function box(w, h, d, mat, x, y, z, parent) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      (parent || player).add(m);
      return m;
    }
    // วัสดุเฉพาะตัวผู้เล่น — เปลี่ยนสีตามตัวละครที่เลือก
    rig.mats = {
      shirt: MAT.shirt.clone(),
      pants: MAT.pants.clone(),
      hair: MAT.hair.clone(),
      skin: MAT.skin.clone(),
    };
    rig.torso = box(0.55, 0.6, 0.32, rig.mats.shirt, 0, 1.05, 0);
    rig.head = box(0.4, 0.4, 0.4, rig.mats.skin, 0, 1.58, 0);
    box(0.44, 0.16, 0.44, rig.mats.hair, 0, 1.78, -0.02); // ผม
    // แขน-ขา: ใช้ pivot group เพื่อหมุนที่หัวไหล่/สะโพก
    function limb(w, len, mat, x, y) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
      seg.position.y = -len / 2;
      seg.castShadow = true;
      pivot.add(seg);
      player.add(pivot);
      return pivot;
    }
    rig.armL = limb(0.16, 0.55, rig.mats.skin, -0.38, 1.3);
    rig.armR = limb(0.16, 0.55, rig.mats.skin, 0.38, 1.3);
    rig.legL = limb(0.2, 0.62, rig.mats.pants, -0.15, 0.72);
    rig.legR = limb(0.2, 0.62, rig.mats.pants, 0.15, 0.72);
    box(0.2, 0.12, 0.3, MAT.shoe, 0, -0.62, 0.04, rig.legL);
    box(0.2, 0.12, 0.3, MAT.shoe, 0, -0.62, 0.04, rig.legR);

    // เครื่องแต่งกายประจำตัวละคร (โชว์เฉพาะตัวที่ใส่)
    rig.acc = {};
    const scarfMat = new THREE.MeshLambertMaterial({ color: 0xd03030 });
    rig.acc.scarf = new THREE.Group();
    rig.acc.scarf.add(box(0.44, 0.12, 0.44, scarfMat, 0, 1.38, 0, rig.acc.scarf));
    rig.acc.scarf.add(box(0.14, 0.4, 0.06, scarfMat, 0.12, 1.2, 0.26, rig.acc.scarf));
    player.add(rig.acc.scarf);

    const steel = new THREE.MeshLambertMaterial({ color: 0xc8ccd4 });
    rig.acc.helmet = new THREE.Group();
    rig.acc.helmet.add(box(0.46, 0.22, 0.46, steel, 0, 1.82, 0, rig.acc.helmet));
    rig.acc.helmet.add(box(0.08, 0.16, 0.5, new THREE.MeshLambertMaterial({ color: 0xd03030 }), 0, 1.96, 0, rig.acc.helmet));
    player.add(rig.acc.helmet);

    const purple = new THREE.MeshLambertMaterial({ color: 0x5a3a9e });
    rig.acc.hat = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 12), purple);
    brim.position.y = 1.8;
    rig.acc.hat.add(brim);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.55, 12), purple);
    cone.position.y = 2.1;
    rig.acc.hat.add(cone);
    player.add(rig.acc.hat);

    rig.acc.mask = new THREE.Group();
    rig.acc.mask.add(box(0.42, 0.11, 0.06, new THREE.MeshLambertMaterial({ color: 0x1a1a22 }), 0, 1.64, -0.2, rig.acc.mask));
    player.add(rig.acc.mask);
  })();

  function applyCharacter() {
    const c = CH();
    rig.mats.shirt.color.setHex(c.colors.shirt);
    rig.mats.pants.color.setHex(c.colors.pants);
    rig.mats.hair.color.setHex(c.colors.hair);
    rig.mats.skin.color.setHex(c.colors.skin);
    for (const k of Object.keys(rig.acc)) rig.acc[k].visible = c.accessory === k;
  }
  applyCharacter();
  player.position.set(0, 0, 0);
  scene.add(player);

  // เงากลมใต้ตัว (จางลงเมื่อกระโดด)
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  scene.add(blob);

  // ---------- เอฟเฟกต์ติดตัวผู้เล่นตอนไอเทมทำงาน ----------
  const shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(1.15, 20, 14), MAT.bubble);
  shieldBubble.position.y = 0.95;
  shieldBubble.visible = false;
  player.add(shieldBubble);

  const magnetAura = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.06, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.65 })
  );
  magnetAura.rotation.x = Math.PI / 2;
  magnetAura.position.y = 0.25;
  magnetAura.visible = false;
  player.add(magnetAura);

  const boostFlame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.0, 8), MAT.flame);
  boostFlame.rotation.x = Math.PI / 2;   // ชี้ไปด้านหลังผู้เล่น
  boostFlame.position.set(0, 0.95, 0.75);
  boostFlame.visible = false;
  player.add(boostFlame);

  // ---------- โมเดลสัตว์เลี้ยง (ลอยตามข้างตัวผู้เล่น) ----------
  const petMeshes = {};
  (function buildPets() {
    const yellow = new THREE.MeshLambertMaterial({ color: 0xffd94a, emissive: 0x554400 });
    const orange = new THREE.MeshLambertMaterial({ color: 0xff9233 });
    const black  = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const pink   = new THREE.MeshLambertMaterial({ color: 0xff8fb0, emissive: 0x5c1f33 });
    const white  = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const gray   = new THREE.MeshLambertMaterial({ color: 0xaab4c0 });
    const cyan   = new THREE.MeshBasicMaterial({ color: 0x55e0ff });
    const shell  = new THREE.MeshLambertMaterial({ color: 0x3f8e4d });
    const lime   = new THREE.MeshLambertMaterial({ color: 0x7ed07a });

    function petGroup(kind) {
      const g = new THREE.Group();
      g.visible = false;
      scene.add(g);
      petMeshes[kind] = g;
      return g;
    }
    // 🐤 เจี๊ยบทอง
    {
      const g = petGroup('chick');
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 12), yellow);
      g.add(body);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 6), orange);
      beak.rotation.x = -Math.PI / 2;
      beak.position.set(0, 0.02, -0.28);
      g.add(beak);
      for (const x of [-0.11, 0.11]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), black);
        eye.position.set(x, 0.1, -0.22);
        g.add(eye);
      }
      for (const x of [-0.26, 0.26]) {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), yellow);
        wing.scale.set(0.5, 1, 1.2);
        wing.position.set(x, -0.02, 0.05);
        g.add(wing);
      }
    }
    // 💗 แฟรี่หัวใจ
    {
      const g = petGroup('fairy');
      for (const x of [-0.09, 0.09]) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), pink);
        lobe.position.set(x, 0.08, 0);
        g.add(lobe);
      }
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.3, 4), pink);
      tip.rotation.x = Math.PI;
      tip.rotation.y = Math.PI / 4;
      tip.position.y = -0.1;
      g.add(tip);
      for (const x of [-0.22, 0.22]) {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), white);
        wing.scale.set(0.25, 1.1, 0.7);
        wing.position.set(x, 0.1, 0.08);
        g.add(wing);
      }
    }
    // 🤖 แม็กบอท
    {
      const g = petGroup('magbot');
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 0.34), gray);
      g.add(body);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.04), cyan);
      visor.position.set(0, 0.05, -0.18);
      g.add(visor);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), gray);
      stem.position.y = 0.26;
      g.add(stem);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), MAT.magnetR);
      bulb.position.y = 0.36;
      g.add(bulb);
    }
    // 🐢 เต่าโล่
    {
      const g = petGroup('turtle');
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), shell);
      dome.scale.y = 0.65;
      g.add(dome);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), lime);
      head.position.set(0, 0.02, -0.3);
      g.add(head);
      for (const x of [-0.2, 0.2]) {
        const fin = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lime);
        fin.scale.set(1.4, 0.5, 1);
        fin.position.set(x, -0.1, 0.12);
        g.add(fin);
      }
    }
    for (const k of Object.keys(petMeshes)) {
      petMeshes[k].traverse(m => { if (m.isMesh) m.castShadow = true; });
    }
  })();
  function updatePetVisibility() {
    const sel = currentPet();
    for (const k of Object.keys(petMeshes)) petMeshes[k].visible = k === sel;
  }

  // ---------- สิ่งกีดขวางและเหรียญ (pool) ----------
  // ชนิด: 'block' บล็อกเต็มเลน (หลบเลน), 'hurdle' รั้วเตี้ย (กระโดด), 'bar' คานสูง (สไลด์)
  const obstacles = [];
  const coinPool = [];

  function makeObstacle(type) {
    const g = new THREE.Group();
    g.userData.type = type;
    if (type === 'block') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.4, 1.2), MAT.danger);
      m.position.y = 1.2; m.castShadow = true;
      g.add(m);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.4, 1.22), MAT.dangerW);
      stripe.position.y = 1.5;
      g.add(stripe);
      g.userData.box = { w: 1.9, hMin: 0, hMax: 2.4, d: 1.2 };
    } else if (type === 'hurdle') {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.28, 0.28), MAT.wood);
      bar.position.y = 0.62; bar.castShadow = true;
      g.add(bar);
      for (const x of [-0.85, 0.85]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.16), MAT.wood);
        post.position.set(x, 0.375, 0);
        g.add(post);
      }
      g.userData.box = { w: 1.9, hMin: 0, hMax: 0.78, d: 0.3 };
    } else { // bar — คานสูง ต้องสไลด์ลอด
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 0.5), MAT.danger);
      bar.position.y = 1.45; bar.castShadow = true;
      g.add(bar);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.12, 0.52), MAT.dangerW);
      stripe.position.y = 1.32;
      g.add(stripe);
      for (const x of [-0.9, 0.9]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.0, 0.14), MAT.stoneDk);
        post.position.set(x, 1.0, 0);
        g.add(post);
      }
      g.userData.box = { w: 1.9, hMin: 1.15, hMax: 1.85, d: 0.5 };
    }
    g.visible = false;
    scene.add(g);
    obstacles.push(g);
    return g;
  }
  for (let i = 0; i < 8; i++) { makeObstacle('block'); makeObstacle('hurdle'); makeObstacle('bar'); }

  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 14);
  for (let i = 0; i < 130; i++) {
    const c = new THREE.Mesh(coinGeo, MAT.gold);
    c.rotation.z = Math.PI / 2;
    c.visible = false;
    scene.add(c);
    coinPool.push(c);
  }

  function freeObstacle(type) {
    for (const o of obstacles) if (!o.visible && o.userData.type === type) return o;
    return null;
  }
  function freeCoin() {
    for (const c of coinPool) if (!c.visible) return c;
    return null;
  }

  // ---------- ไอเทมพิเศษ (สไตล์ Cookie Run) ----------
  const items = [];
  function makeItem(kind) {
    const g = new THREE.Group();
    g.userData.kind = kind;
    if (kind === 'magnet') {
      // แม่เหล็กเกือกม้าสีแดงปลายขาว
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.16), MAT.magnetR);
      base.position.y = -0.22;
      g.add(base);
      for (const x of [-0.23, 0.23]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.16), MAT.magnetR);
        arm.position.set(x, 0.02, 0);
        g.add(arm);
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), MAT.magnetW);
        tip.position.set(x, 0.31, 0);
        g.add(tip);
      }
    } else if (kind === 'shield') {
      // ฟองใสมีแกนเพชรขาวข้างใน
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), MAT.bubble);
      g.add(orb);
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), MAT.bubbleI);
      g.add(core);
    } else if (kind === 'boost') {
      // จรวดลำเล็ก
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 10), MAT.rocketW);
      g.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 10), MAT.rocketR);
      nose.position.y = 0.35;
      g.add(nose);
      for (const x of [-0.18, 0.18]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.14), MAT.rocketR);
        fin.position.set(x, -0.2, 0);
        g.add(fin);
      }
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.25, 8), MAT.flame);
      fire.rotation.x = Math.PI;
      fire.position.y = -0.36;
      g.add(fire);
    } else if (kind === 'heart') {
      // หัวใจฟื้นเลือด
      for (const x of [-0.11, 0.11]) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), MAT.heart);
        lobe.position.set(x, 0.1, 0);
        g.add(lobe);
      }
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.36, 4), MAT.heart);
      tip.rotation.x = Math.PI;
      tip.rotation.y = Math.PI / 4;
      tip.position.y = -0.12;
      g.add(tip);
    } else { // giant — ขวดยาโตยักษ์สีเขียว
      const flask = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), MAT.potion);
      flask.position.y = -0.08;
      g.add(flask);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 8), MAT.potion);
      neck.position.y = 0.22;
      g.add(neck);
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 8), MAT.wood);
      cork.position.y = 0.38;
      g.add(cork);
    }
    g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    g.visible = false;
    scene.add(g);
    items.push(g);
    return g;
  }
  for (const k of ['magnet', 'shield', 'boost', 'giant']) { makeItem(k); makeItem(k); }
  for (let i = 0; i < 3; i++) makeItem('heart'); // หัวใจเจอบ่อยกว่าอย่างอื่น

  function trySpawnItem(z) {
    if (distance - lastItemDistance < nextItemGap) return;
    const free = items.filter(i => !i.visible);
    if (!free.length) return;
    const x = LANES[Math.floor(Math.random() * 3)];
    // เลี่ยงจุดที่ทับสิ่งกีดขวาง — ถ้าทับให้รอลองใหม่เฟรมถัดไป
    for (const o of obstacles) {
      if (o.visible && Math.abs(o.position.z - z) < 4.5 && Math.abs(o.position.x - x) < 1.2) return;
    }
    const it = free[Math.floor(Math.random() * free.length)];
    it.position.set(x, 0.9, z);
    it.visible = true;
    lastItemDistance = distance;
    nextItemGap = 55 + Math.random() * 50;
  }

  function activateItem(kind) {
    if (kind === 'magnet') magnetTimer = MAGNET_TIME;
    else if (kind === 'shield') shieldOn = true;
    else if (kind === 'boost') boostTimer = BOOST_TIME;
    else if (kind === 'giant') giantTimer = GIANT_TIME;
    else if (kind === 'heart') hp = Math.min(maxHP(), hp + 40);
    sfx.item();
  }

  // ---------- พาร์ติเคิล (ตอนของแตก / เก็บไอเทม) ----------
  const particles = [];
  const particleGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  for (let i = 0; i < 50; i++) {
    const p = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    p.visible = false;
    scene.add(p);
    particles.push(p);
  }
  function burst(pos, color, count) {
    let used = 0;
    for (const p of particles) {
      if (p.visible) continue;
      p.visible = true;
      p.material.color.setHex(color);
      p.material.opacity = 1;
      p.position.copy(pos);
      p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6 + 2, (Math.random() - 0.5) * 6);
      p.userData.life = 0.7;
      if (++used >= count) break;
    }
  }

  // สกิลสัตว์เลี้ยง — คืนค่า false ถ้ายังไม่มีอะไรให้ทำ (จะลองใหม่เรื่อยๆ)
  function petAbility(kind, pos) {
    if (kind === 'chick') {
      smashBonus += 30;
      burst(pos, 0xffd54a, 6);
    } else if (kind === 'fairy') {
      if (hp >= maxHP()) return false;
      hp = Math.min(maxHP(), hp + 8);
      burst(pos, 0xff8fb0, 6);
    } else if (kind === 'magbot') {
      magnetTimer = Math.max(magnetTimer, 3);
      burst(pos, 0xffcc44, 6);
    } else if (kind === 'turtle') {
      if (shieldOn) return false;
      shieldOn = true;
      burst(pos, 0x66ccff, 6);
    }
    sfx.pet();
    return true;
  }

  function smashObstacle(o, reward) {
    o.visible = false;
    burst(new THREE.Vector3(o.position.x, 1.2, o.position.z), reward ? 0xff7755 : 0x999999, 10);
    if (reward) { smashBonus += 25; sfx.smash(); }
  }

  // ---------- การเกิดของสิ่งกีดขวาง ----------
  function spawnWave(z) {
    const roll = Math.random();
    const lane = Math.floor(Math.random() * 3);
    if (roll < 0.3) {
      // บล็อก 1–2 เลน (เหลืออย่างน้อย 1 เลนให้วิ่ง)
      const lanes = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, Math.random() < 0.45 ? 2 : 1);
      for (const ln of lanes) placeObstacle('block', ln, z);
      const open = [0, 1, 2].find(l => !lanes.includes(l));
      if (Math.random() < 0.6) coinLine(open, z - 2, 4, 0);
    } else if (roll < 0.55) {
      placeObstacle('hurdle', lane, z);
      if (Math.random() < 0.7) coinArc(lane, z);
    } else if (roll < 0.78) {
      placeObstacle('bar', lane, z);
      if (Math.random() < 0.6) coinLine(lane, z - 2, 4, 0);
    } else {
      // แถวเหรียญล้วน
      coinLine(lane, z, 6, 0);
    }
  }
  function placeObstacle(type, lane, z) {
    const o = freeObstacle(type);
    if (!o) return;
    o.position.set(LANES[lane], 0, z);
    o.visible = true;
  }
  function coinLine(lane, z, count, y) {
    for (let i = 0; i < count; i++) {
      const c = freeCoin();
      if (!c) return;
      c.position.set(LANES[lane], 0.55 + y, z - i * 1.6);
      c.visible = true;
    }
  }
  function coinArc(lane, z) {
    // เหรียญโค้งเหนือรั้ว — เก็บได้ตอนกระโดด
    const heights = [0.6, 1.3, 1.8, 1.3, 0.6];
    for (let i = 0; i < heights.length; i++) {
      const c = freeCoin();
      if (!c) return;
      c.position.set(LANES[lane], heights[i], z + 3.2 - i * 1.6);
      c.visible = true;
    }
  }

  // ---------- เสียง (WebAudio สังเคราะห์) ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  // ---------- เพลงประกอบ chiptune (สังเคราะห์สด วนลูป 4 ห้อง) ----------
  const MUSIC_STEP = 0.16;            // ความยาวโน้ต 1 สเต็ป (วินาที)
  // อาร์เปจจิโอ C - Am - F - G สดใสแบบเกมวิ่ง
  const MUSIC_LEAD = [
    262, 330, 392, 330, 523, 392, 330, 392,
    220, 262, 330, 262, 440, 330, 262, 330,
    175, 220, 262, 220, 349, 262, 220, 262,
    196, 247, 294, 247, 392, 294, 247, 294,
  ];
  const MUSIC_ROOTS = [65, 55, 44, 49]; // เบสของแต่ละห้อง
  let musicNext = 0;
  let musicStep = 0;
  function scheduleNote(freq, when, dur, type, vol) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(when); o.stop(when + dur);
  }
  function scheduleMusic() {
    if (!audioCtx || !save.music || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime;
    if (musicNext < now) musicNext = now + 0.05; // หลุดจังหวะ (แท็บพัก) ให้เริ่มใหม่
    while (musicNext < now + 0.3) {
      scheduleNote(MUSIC_LEAD[musicStep], musicNext, MUSIC_STEP * 1.6, 'square', 0.035);
      if (musicStep % 4 === 0) {
        scheduleNote(MUSIC_ROOTS[Math.floor(musicStep / 8)], musicNext, MUSIC_STEP * 3.5, 'triangle', 0.09);
      }
      musicNext += MUSIC_STEP;
      musicStep = (musicStep + 1) % MUSIC_LEAD.length;
    }
  }
  function tone(freq0, freq1, dur, type, vol) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq0, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq1, audioCtx.currentTime + dur);
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  }
  const sfx = {
    coin:  () => tone(900, 1500, 0.12, 'square', 0.08),
    jump:  () => tone(300, 600, 0.18, 'sine', 0.15),
    slide: () => tone(400, 150, 0.2, 'sawtooth', 0.06),
    crash: () => { tone(220, 40, 0.5, 'sawtooth', 0.25); tone(160, 30, 0.6, 'square', 0.15); },
    item:  () => { tone(500, 1000, 0.12, 'triangle', 0.12); setTimeout(() => tone(750, 1500, 0.15, 'triangle', 0.1), 90); },
    smash: () => tone(180, 50, 0.22, 'square', 0.18),
    shieldBreak: () => tone(900, 200, 0.3, 'sine', 0.18),
    hit:   () => tone(240, 60, 0.28, 'sawtooth', 0.2),
    pet:   () => { tone(880, 1400, 0.09, 'triangle', 0.09); setTimeout(() => tone(1100, 1700, 0.1, 'triangle', 0.07), 70); },
    bonusStart: () => {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, f * 1.02, 0.18, 'triangle', 0.12), i * 110));
    },
  };

  // ---------- อินพุต ----------
  function goLeft()  { if (state === 'playing') targetLane = Math.max(0, targetLane - 1); }
  function goRight() { if (state === 'playing') targetLane = Math.min(2, targetLane + 1); }
  const FLIP_TIME = 0.5;
  let airJumpUsed = false;
  let flipTimer = 0;
  function doJump() {
    if (state !== 'playing') return;
    const jv = JUMP_VELOCITY * (CH().jumpMult || 1);
    if (onGround) {
      velocityY = jv;
      onGround = false;
      slideTimer = 0;
      sfx.jump();
    } else if (!airJumpUsed) {
      // กระโดด 2 ชั้นกลางอากาศ + ตีลังกาแบบ Cookie Run
      airJumpUsed = true;
      velocityY = jv * 0.95;
      flipTimer = FLIP_TIME;
      sfx.jump();
    }
  }
  function doSlide() {
    if (state !== 'playing') return;
    if (!onGround) { velocityY = -22; } // กดลงกลางอากาศ = ดิ่งลงเร็ว
    slideTimer = SLIDE_TIME * (CH().slideMult || 1);
    sfx.slide();
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': goLeft(); break;
      case 'ArrowRight': case 'KeyD': goRight(); break;
      case 'ArrowUp': case 'KeyW': case 'Space':
        if (state === 'menu') startGame();
        else if (state === 'over' && crashTimer <= 0) restartGame();
        else doJump();
        break;
      case 'ArrowDown': case 'KeyS': doSlide(); break;
    }
  });

  let touchX = 0, touchY = 0;
  window.addEventListener('touchstart', (e) => {
    touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) < 25 && Math.abs(dy) < 25) return; // แตะเฉยๆ
    if (Math.abs(dx) > Math.abs(dy)) (dx > 0 ? goRight : goLeft)();
    else (dy < 0 ? doJump : doSlide)();
  }, { passive: true });

  // ---------- UI ----------
  const el = {
    score: document.getElementById('score-value'),
    coin: document.getElementById('coin-value'),
    best: document.getElementById('best-value'),
    menu: document.getElementById('menu-overlay'),
    over: document.getElementById('gameover-overlay'),
    finalScore: document.getElementById('final-score'),
    recordMsg: document.getElementById('record-msg'),
    itemHud: document.getElementById('item-hud'),
    charCards: document.getElementById('char-cards'),
    petCards: document.getElementById('pet-cards'),
    musicBtn: document.getElementById('music-btn'),
    themeToast: document.getElementById('theme-toast'),
    hpFill: document.getElementById('hp-fill'),
    hpText: document.getElementById('hp-text'),
    bonusBanner: document.getElementById('bonus-banner'),
    money: document.getElementById('money-value'),
    earned: document.getElementById('earned-money'),
    shopCards: document.getElementById('shop-cards'),
  };
  el.best.textContent = best;
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', restartGame);
  document.getElementById('menu-btn').addEventListener('click', backToMenu);
  el.musicBtn.textContent = save.music ? '🔊' : '🔇';
  el.musicBtn.addEventListener('click', () => {
    save.music = !save.music;
    persistSave();
    ensureAudio();
    el.musicBtn.textContent = save.music ? '🔊' : '🔇';
  });

  // ---------- ร้านค้าอัพเกรด ----------
  const UPGRADES = {
    hp:    { icon: '❤️', name: 'พลังชีวิต',  info: l => 'HP สูงสุด ' + (100 + 20 * l) },
    score: { icon: '✨', name: 'ตัวคูณแต้ม', info: l => 'คะแนน x' + (1 + 0.1 * l).toFixed(1) },
    bonus: { icon: '🌈', name: 'โบนัสไทม์',  info: l => 'นาน ' + (6 + 0.8 * l).toFixed(1) + ' วิ' },
  };
  function renderShop() {
    el.money.textContent = save.money.toLocaleString();
    let html = '';
    for (const key of Object.keys(UPGRADES)) {
      const u = UPGRADES[key];
      const lv = save[key];
      const maxed = lv >= UPGRADE_MAX;
      const cost = upgradeCost(lv);
      const afford = !maxed && save.money >= cost;
      html += '<div class="shop-card">' +
        '<div class="shop-icon">' + u.icon + '</div>' +
        '<div class="shop-name">' + u.name + ' <span class="shop-level">Lv.' + lv + (maxed ? ' MAX' : '') + '</span></div>' +
        '<div class="shop-info">' + u.info(lv) + (maxed ? '' : ' → ' + u.info(lv + 1)) + '</div>' +
        (maxed
          ? '<div class="shop-maxed">สูงสุดแล้ว</div>'
          : '<button class="shop-buy" data-upg="' + key + '"' + (afford ? '' : ' disabled') + '>🪙 ' + cost.toLocaleString() + '</button>') +
        '</div>';
    }
    el.shopCards.innerHTML = html;
    for (const btn of el.shopCards.querySelectorAll('.shop-buy')) {
      btn.addEventListener('click', () => buyUpgrade(btn.dataset.upg));
    }
    // ---------- การ์ดตัวละคร ----------
    let charHtml = '';
    for (const key of Object.keys(CHARS)) {
      const c = CHARS[key];
      const owned = !!save.chars[key];
      const selected = CH() === c;
      let action;
      if (!owned) {
        action = '<button class="shop-buy" data-char-buy="' + key + '"' +
                 (save.money >= c.price ? '' : ' disabled') + '>🪙 ' + c.price.toLocaleString() + '</button>';
      } else if (selected) {
        action = '<div class="shop-maxed">✓ ใช้อยู่</div>';
      } else {
        action = '<button class="shop-buy" data-char-sel="' + key + '">เลือกใช้</button>';
      }
      charHtml += '<div class="shop-card' + (selected ? ' shop-card-selected' : '') + '">' +
        '<div class="shop-icon">' + c.icon + '</div>' +
        '<div class="shop-name">' + c.name + '</div>' +
        '<div class="shop-info">' + c.info + '</div>' +
        action + '</div>';
    }
    el.charCards.innerHTML = charHtml;
    for (const btn of el.charCards.querySelectorAll('[data-char-buy]')) {
      btn.addEventListener('click', () => buyChar(btn.dataset.charBuy));
    }
    for (const btn of el.charCards.querySelectorAll('[data-char-sel]')) {
      btn.addEventListener('click', () => selectChar(btn.dataset.charSel));
    }
    // ---------- การ์ดสัตว์เลี้ยง ----------
    let petHtml = '';
    for (const key of Object.keys(PETS)) {
      const p = PETS[key];
      const owned = !!save.pets[key];
      const selected = currentPet() === key;
      let action;
      if (!owned) {
        action = '<button class="shop-buy" data-pet-buy="' + key + '"' +
                 (save.money >= p.price ? '' : ' disabled') + '>🪙 ' + p.price.toLocaleString() + '</button>';
      } else if (selected) {
        action = '<button class="shop-buy pet-active" data-pet-sel="' + key + '">✓ ใช้อยู่ (กดเพื่อถอด)</button>';
      } else {
        action = '<button class="shop-buy" data-pet-sel="' + key + '">เลือกใช้</button>';
      }
      petHtml += '<div class="shop-card' + (selected ? ' shop-card-selected' : '') + '">' +
        '<div class="shop-icon">' + p.icon + '</div>' +
        '<div class="shop-name">' + p.name + '</div>' +
        '<div class="shop-info">' + p.info + '</div>' +
        action + '</div>';
    }
    el.petCards.innerHTML = petHtml;
    for (const btn of el.petCards.querySelectorAll('[data-pet-buy]')) {
      btn.addEventListener('click', () => buyPet(btn.dataset.petBuy));
    }
    for (const btn of el.petCards.querySelectorAll('[data-pet-sel]')) {
      btn.addEventListener('click', () => selectPet(btn.dataset.petSel));
    }
  }
  function buyChar(key) {
    if (save.chars[key] || save.money < CHARS[key].price) return;
    ensureAudio();
    save.money -= CHARS[key].price;
    save.chars[key] = true;
    save.char = key;                  // ซื้อแล้วสวมบทเลย
    persistSave();
    sfx.item();
    applyCharacter();
    renderShop();
  }
  function selectChar(key) {
    if (!save.chars[key]) return;
    ensureAudio();
    save.char = key;
    persistSave();
    sfx.pet();
    applyCharacter();
    renderShop();
  }
  function buyPet(key) {
    if (save.pets[key] || save.money < PETS[key].price) return;
    ensureAudio();
    save.money -= PETS[key].price;
    save.pets[key] = true;
    save.pet = key;                   // ซื้อแล้วใส่ให้เลย
    persistSave();
    sfx.item();
    updatePetVisibility();
    renderShop();
  }
  function selectPet(key) {
    ensureAudio();
    save.pet = save.pet === key ? null : key; // กดตัวที่ใช้อยู่ = ถอด
    persistSave();
    sfx.pet();
    updatePetVisibility();
    renderShop();
  }
  function buyUpgrade(key) {
    const cost = upgradeCost(save[key]);
    if (save[key] >= UPGRADE_MAX || save.money < cost) return;
    ensureAudio();
    save.money -= cost;
    save[key]++;
    persistSave();
    sfx.item();
    renderShop();
  }
  renderShop();
  updatePetVisibility();

  let toastTimeout = null;
  function showToast(text) {
    el.themeToast.textContent = text;
    el.themeToast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.themeToast.classList.remove('show'), 2200);
  }

  function backToMenu() {
    resetRun();
    state = 'menu';
    el.over.classList.add('hidden');
    renderShop();
    el.menu.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    resetRun();
    state = 'playing';
    el.menu.classList.add('hidden');
  }
  function restartGame() {
    resetRun();
    el.over.classList.add('hidden');
    state = 'playing';
  }
  function resetRun() {
    // ล้างสนาม
    for (const o of obstacles) o.visible = false;
    for (const c of coinPool) c.visible = false;
    for (const it of items) it.visible = false;
    for (const p of particles) p.visible = false;
    speed = BASE_SPEED;
    distance = 0; coins = 0; coinPoints = 0; runTime = 0; smashBonus = 0;
    hp = maxHP();
    bonusTimer = 0; nextBonusAt = 400;
    targetLane = 1; playerX = 0; playerY = 0; velocityY = 0;
    onGround = true; slideTimer = 0; spawnDistance = 0;
    magnetTimer = 0; boostTimer = 0; giantTimer = 0; invulnTimer = 0;
    shieldOn = false; giantScale = 1; slideFactor = 1;
    lastItemDistance = 0; nextItemGap = 40;
    petTimer = 0;
    airJumpUsed = false; flipTimer = 0;
    setTheme(0);
    updatePetVisibility();
    applyCharacter();
    shieldBubble.visible = false; magnetAura.visible = false; boostFlame.visible = false;
    el.bonusBanner.classList.add('hidden');
    player.rotation.set(0, 0, 0);
    player.scale.set(1, 1, 1);
    player.visible = true;
    camera.fov = 62;
    camera.updateProjectionMatrix();
    updateHUD();
  }
  function gameOver() {
    if (state === 'over') return;
    state = 'over';
    crashTimer = 1.0;
    sfx.crash();
    el.bonusBanner.classList.add('hidden');
    // เหรียญที่เก็บได้กลายเป็นเงินสะสมถาวร (จอมโจรได้ x1.5)
    const earned = Math.round(coins * (CH().coinMult || 1));
    save.money += earned;
    persistSave();
    el.earned.textContent = '+' + earned.toLocaleString() + ' 🪙 (รวม ' + save.money.toLocaleString() + ')';
    const score = finalScore();
    el.finalScore.textContent = score.toLocaleString();
    if (score > best) {
      best = score;
      localStorage.setItem('skyrunner-best', best);
      el.best.textContent = best;
      el.recordMsg.innerHTML = '<span class="new-record">🏆 สถิติใหม่!</span>';
    } else {
      el.recordMsg.innerHTML = '<span style="opacity:0.7">สถิติสูงสุด: ' + best.toLocaleString() + '</span>';
    }
    setTimeout(() => el.over.classList.remove('hidden'), 700);
  }
  function finalScore() {
    return Math.floor((Math.floor(distance) + coinPoints + smashBonus) * scoreMult());
  }

  // ---------- การชน (AABB อย่างง่าย) ----------
  function playerHeight() { return (slideTimer > 0 ? 0.85 : 1.8) * giantScale; }
  function checkCollisions(dt) {
    const pw = 0.55 * giantScale, pd = 0.5 * giantScale;
    const pBottom = playerY;
    const pTop = playerY + playerHeight();
    const invincible = boostTimer > 0 || giantTimer > 0 || invulnTimer > 0 || bonusTimer > 0;
    for (const o of obstacles) {
      if (!o.visible) continue;
      const b = o.userData.box;
      if (Math.abs(o.position.z) > b.d / 2 + pd / 2 + 0.1) continue;
      if (Math.abs(o.position.x - playerX) > b.w / 2 + pw / 2 - 0.15) continue;
      const oBottom = b.hMin, oTop = b.hMax;
      if (pBottom < oTop - 0.05 && pTop > oBottom + 0.05) {
        if (invincible) {
          smashObstacle(o, true);     // บูสต์/ยักษ์/โบนัส: พุ่งชนแตกกระจาย ได้โบนัส
        } else if (shieldOn) {
          shieldOn = false;           // โล่รับแทน 1 ครั้ง
          smashObstacle(o, true);
          invulnTimer = 1.0;
          sfx.shieldBreak();
        } else {
          // แบบ Cookie Run: ชนแล้วเสียเลือด สะดุดแต่วิ่งต่อ
          hp -= 25 * (CH().dmgMult || 1);
          smashObstacle(o, false);
          invulnTimer = 1.2;
          sfx.hit();
          if (hp <= 0) { gameOver(); return; }
        }
      }
    }
    const pcY = playerY + 0.9;
    // แม่เหล็ก: ดูดเหรียญใกล้ตัวเข้าหาผู้เล่น
    if (magnetTimer > 0) {
      for (const c of coinPool) {
        if (!c.visible) continue;
        const dx = playerX - c.position.x;
        const dy = pcY - c.position.y;
        const dz = -c.position.z;
        if (dx * dx + dy * dy + dz * dz < 60 && c.position.z < 2) {
          const pull = Math.min(1, 9 * dt);
          c.position.x += dx * pull;
          c.position.y += dy * pull;
          c.position.z += dz * pull;
        }
      }
    }
    // เก็บเหรียญ
    const grabR = magnetTimer > 0 ? 1.1 : 0.7;
    for (const c of coinPool) {
      if (!c.visible) continue;
      if (Math.abs(c.position.z) < grabR &&
          Math.abs(c.position.x - playerX) < grabR &&
          Math.abs(c.position.y - pcY) < 1.0 + (giantScale - 1)) {
        c.visible = false;
        coins++;
        coinPoints += bonusTimer > 0 ? 20 : 10; // ช่วงโบนัสเหรียญค่า x2
        sfx.coin();
      }
    }
    // เก็บไอเทม
    for (const it of items) {
      if (!it.visible) continue;
      if (Math.abs(it.position.z) < 0.9 &&
          Math.abs(it.position.x - playerX) < 0.9 &&
          it.position.y - playerY < 2.2) {
        it.visible = false;
        activateItem(it.userData.kind);
        burst(it.position.clone(), 0x88ddff, 8);
      }
    }
  }

  // ---------- ลูปหลัก ----------
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    scheduleMusic();

    // เกาะลอยขยับขึ้นลงเบาๆ + เมฆลอย (ทุกสถานะ)
    for (const isl of islands) {
      isl.position.y = isl.userData.baseY + Math.sin(t * 0.6 + isl.userData.bobPhase) * 0.35;
    }
    for (const c of clouds) {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 45) c.position.x = -45;
    }

    if (state === 'playing') {
      runTime += dt;
      speed = Math.min(MAX_SPEED, BASE_SPEED + runTime * SPEED_RAMP);
      const move = speed * (boostTimer > 0 ? 1.65 : 1) * dt; // บูสต์ = พุ่งแรง
      distance += move;

      // นับถอยหลังไอเทม
      if (magnetTimer > 0) magnetTimer -= dt;
      if (boostTimer > 0) boostTimer -= dt;
      if (giantTimer > 0) giantTimer -= dt;
      if (invulnTimer > 0) invulnTimer -= dt;

      // เลือดลดตามเวลาแบบ Cookie Run (ยิ่งเร็วยิ่งลดไว)
      hp -= (2.5 + speed * 0.05) * dt;
      if (hp <= 0) { hp = 0; gameOver(); }

      // สกิลสัตว์เลี้ยงตามคูลดาวน์
      const pet = currentPet();
      if (pet) {
        petTimer += dt;
        if (petTimer >= PETS[pet].cd) {
          if (petAbility(pet, petMeshes[pet].position.clone())) petTimer = 0;
          else petTimer = PETS[pet].cd; // ยังไม่มีอะไรให้ทำ รอพร้อมไว้
        }
      }

      // เปลี่ยนฉากทุกๆ THEME_DISTANCE เมตร
      const ti = Math.floor(distance / THEME_DISTANCE) % THEMES.length;
      if (ti !== themeIndex) {
        setTheme(ti);
        showToast('เข้าสู่ ' + THEMES[ti].name);
        sfx.item();
      }

      // เข้าช่วง Bonus Time เมื่อวิ่งครบระยะ
      if (bonusTimer <= 0 && distance >= nextBonusAt) {
        bonusTimer = bonusDuration();
        nextBonusAt = distance + 450;
        for (const o of obstacles) {
          if (o.visible) { burst(new THREE.Vector3(o.position.x, 1.2, o.position.z), 0xffd54a, 4); o.visible = false; }
        }
        el.bonusBanner.classList.remove('hidden');
        sfx.bonusStart();
      }
      if (bonusTimer > 0) {
        bonusTimer -= dt;
        if (bonusTimer <= 0) el.bonusBanner.classList.add('hidden');
      }

      // เลื่อนโลกเข้าหาผู้เล่น
      for (const seg of roadSegments) {
        seg.position.z += move;
        if (seg.position.z > KILL_Z + SEG_DEPTH) seg.position.z -= SEG_COUNT * SEG_DEPTH;
      }
      for (const isl of islands) {
        isl.position.z += move * 0.55; // parallax ช้ากว่า
        if (isl.position.z > KILL_Z + 10) resetIsland(isl, false);
      }
      for (const c of clouds) {
        c.position.z += move * 0.25;
        if (c.position.z > KILL_Z) c.position.z = SPAWN_Z - Math.random() * 30;
      }
      for (const o of obstacles) {
        if (!o.visible) continue;
        o.position.z += move;
        if (o.position.z > KILL_Z) o.visible = false;
      }
      for (const c of coinPool) {
        if (!c.visible) continue;
        c.position.z += move;
        c.rotation.y += dt * 5;
        if (c.position.z > KILL_Z) c.visible = false;
      }
      for (const it of items) {
        if (!it.visible) continue;
        it.position.z += move;
        it.rotation.y += dt * 2.5;
        it.position.y = 0.9 + Math.sin(t * 3 + it.position.x) * 0.15;
        if (it.position.z > KILL_Z) it.visible = false;
      }
      for (const p of particles) {
        if (p.visible) p.position.z += move;
      }

      // เกิดของใหม่ตามระยะทาง
      spawnDistance += move;
      if (bonusTimer > 0) {
        // ช่วงโบนัส: ฝนเหรียญ ไม่มีสิ่งกีดขวาง
        if (spawnDistance >= 9) {
          spawnDistance = 0;
          const lanes = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, 2);
          for (const ln of lanes) coinLine(ln, SPAWN_Z, 5, Math.random() < 0.3 ? 0.9 : 0);
        }
      } else {
        const gap = Math.max(14, 26 - speed * 0.35); // เร็วขึ้น ของถี่ขึ้นเล็กน้อย
        if (spawnDistance >= gap) {
          spawnDistance = 0;
          spawnWave(SPAWN_Z + Math.random() * 12);
        }
        trySpawnItem(SPAWN_Z + 4);
      }

      // ผู้เล่น: เลน, กระโดด, สไลด์
      playerX += (LANES[targetLane] - playerX) * Math.min(1, LANE_LERP * dt);
      if (!onGround) {
        velocityY += GRAVITY * dt;
        playerY += velocityY * dt;
        if (playerY <= 0) { playerY = 0; velocityY = 0; onGround = true; airJumpUsed = false; }
      }
      if (slideTimer > 0) slideTimer -= dt;

      checkCollisions(dt);
      updateHUD();
    }

    if (state === 'over' && crashTimer > 0) {
      crashTimer -= dt;
      // ล้มหงายหลังแบบหมุนๆ
      player.rotation.x -= dt * 7;
      player.position.z += dt * 6;
      player.position.y = Math.max(0.3, player.position.y);
    }

    // ---------- อัปเดตท่าทางตัวละคร ----------
    if (state !== 'over') {
      player.position.x = playerX;
      player.position.z = 0;
      const runSpeed = state === 'playing' ? 11 + speed * 0.25 : 8;
      const swing = Math.sin(t * runSpeed);
      const sliding = slideTimer > 0;

      // โหมดยักษ์: ค่อยๆ ขยาย/หดตัว, สไลด์: ย่อเฉพาะแกนตั้ง
      giantScale += ((giantTimer > 0 ? 1.7 : 1) - giantScale) * Math.min(1, 6 * dt);
      if (sliding) {
        slideFactor += (0.5 - slideFactor) * Math.min(1, 18 * dt);
        player.rotation.x += (-0.5 - player.rotation.x) * Math.min(1, 18 * dt);
      } else {
        slideFactor += (1 - slideFactor) * Math.min(1, 14 * dt);
        player.rotation.x += (0 - player.rotation.x) * Math.min(1, 14 * dt);
      }
      player.scale.set(giantScale, giantScale * slideFactor, giantScale);

      if (onGround && !sliding) {
        player.position.y = playerY + Math.abs(Math.sin(t * runSpeed)) * 0.07;
        rig.legL.rotation.x = swing * 0.9;
        rig.legR.rotation.x = -swing * 0.9;
        rig.armL.rotation.x = -swing * 0.8;
        rig.armR.rotation.x = swing * 0.8;
      } else if (!onGround) {
        player.position.y = playerY;
        // ท่ากลางอากาศ: กางแขน งอขา
        rig.legL.rotation.x += (0.5 - rig.legL.rotation.x) * 10 * dt;
        rig.legR.rotation.x += (-0.3 - rig.legR.rotation.x) * 10 * dt;
        rig.armL.rotation.x += (-1.2 - rig.armL.rotation.x) * 10 * dt;
        rig.armR.rotation.x += (-1.2 - rig.armR.rotation.x) * 10 * dt;
      } else {
        player.position.y = playerY;
      }

      // เอียงตัวตอนเปลี่ยนเลน
      player.rotation.z = (LANES[targetLane] - playerX) * -0.12;

      // ท่าตีลังกาตอนกระโดด 2 ชั้น (หมุนหน้าครบรอบ)
      if (flipTimer > 0) {
        flipTimer -= dt;
        if (flipTimer <= 0) {
          player.rotation.x = 0;
        } else {
          player.rotation.x = -(1 - flipTimer / FLIP_TIME) * Math.PI * 2;
        }
      }

      // เอฟเฟกต์ไอเทมติดตัว
      shieldBubble.visible = shieldOn;
      magnetAura.visible = magnetTimer > 0;
      if (magnetAura.visible) magnetAura.scale.setScalar(1 + Math.sin(t * 6) * 0.15);
      boostFlame.visible = boostTimer > 0;
      if (boostFlame.visible) boostFlame.scale.y = 0.7 + Math.random() * 0.6;
      // กะพริบช่วงอมตะหลังโล่แตก
      player.visible = invulnTimer <= 0 || Math.floor(t * 14) % 2 === 0;
    }

    // พาร์ติเคิล: ฟิสิกส์ + จางหาย
    for (const p of particles) {
      if (!p.visible) continue;
      p.userData.life -= dt;
      if (p.userData.life <= 0) { p.visible = false; continue; }
      p.userData.vel.y += GRAVITY * 0.4 * dt;
      p.position.addScaledVector(p.userData.vel, dt);
      p.rotation.x += dt * 6; p.rotation.y += dt * 5;
      p.material.opacity = p.userData.life / 0.7;
    }

    // สัตว์เลี้ยงลอยตามข้างตัว
    const petSel = currentPet();
    if (petSel) {
      const pg = petMeshes[petSel];
      pg.position.x += (player.position.x - 1.35 - pg.position.x) * Math.min(1, 6 * dt);
      pg.position.y = 1.75 + playerY * 0.6 + Math.sin(t * 2.8) * 0.15;
      pg.position.z = 1.0;
      pg.rotation.z = (player.position.x - 1.35 - pg.position.x) * 0.4;
      pg.rotation.y = Math.sin(t * 1.5) * 0.15;
    }

    // เงากลม
    blob.position.x = player.position.x;
    blob.material.opacity = Math.max(0.05, 0.25 - playerY * 0.08);
    const blobScale = Math.max(0.5, 1 - playerY * 0.15);
    blob.scale.setScalar(blobScale);

    // ท้องฟ้าเปลี่ยนตามธีมฉาก / สีทองช่วง Bonus Time
    scene.background.lerp(bonusTimer > 0 ? BONUS_SKY : themeTargets.sky, Math.min(1, 2.5 * dt));
    scene.fog.color.copy(scene.background);
    // วัสดุฉากค่อยๆ เปลี่ยนสีเข้าธีม
    const themeLerp = Math.min(1, 1.5 * dt);
    for (const [mat, key] of THEME_MATS) mat.color.lerp(themeTargets[key], themeLerp);
    sun.color.lerp(themeTargets.sun, themeLerp);

    // กล้องตามนุ่มๆ + ซูมกว้างตอนบูสต์
    camera.position.x += (playerX * 0.55 - camera.position.x) * Math.min(1, 5 * dt);
    camera.position.y += (4.6 + playerY * 0.25 - camera.position.y) * Math.min(1, 5 * dt);
    const targetFov = boostTimer > 0 ? 76 : 62;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, 6 * dt);
      camera.updateProjectionMatrix();
    }
    camera.lookAt(camera.position.x * 0.6, 1.4, -8);

    renderer.render(scene, camera);
  }

  function itemBadge(icon, frac) {
    return '<div class="item-badge"><span class="item-icon">' + icon + '</span>' +
           '<div class="item-bar"><div class="item-bar-fill" style="width:' + Math.max(0, frac * 100) + '%"></div></div></div>';
  }
  function updateHUD() {
    el.score.textContent = finalScore().toLocaleString();
    el.coin.textContent = coins;
    // แถบเลือด
    const pct = Math.max(0, hp / maxHP());
    el.hpFill.style.width = (pct * 100).toFixed(1) + '%';
    el.hpFill.style.background = 'hsl(' + Math.round(pct * 115) + ', 75%, 50%)';
    el.hpFill.classList.toggle('hp-low', pct < 0.25);
    el.hpText.textContent = Math.ceil(hp) + ' / ' + maxHP();
    let badges = '';
    if (bonusTimer > 0) badges += itemBadge('🌈', bonusTimer / bonusDuration());
    if (boostTimer > 0) badges += itemBadge('🚀', boostTimer / BOOST_TIME);
    if (giantTimer > 0) badges += itemBadge('🧪', giantTimer / GIANT_TIME);
    if (magnetTimer > 0) badges += itemBadge('🧲', magnetTimer / MAGNET_TIME);
    if (shieldOn) badges += itemBadge('🛡️', 1);
    if (badges !== el.itemHud.dataset.last) {
      el.itemHud.innerHTML = badges;
      el.itemHud.dataset.last = badges;
    }
  }

  animate();
})();
