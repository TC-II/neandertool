// Neandertool mascot sprite generator.
// Builds a low-poly "coal buddy" procedurally with Three.js, renders every
// animation frame at SS× resolution, then downsamples to pixel art using a
// material-ID pass + per-material colour ramps (limited palette, ordered
// dither, 1px outline). Output: one horizontal PNG strip per animation plus
// mascot.json. The game runtime (js/mascot.js) only uses those PNGs.
import * as THREE from 'three';

// ── Config ────────────────────────────────────────────────────────────────
const CFG = {
    revision: 2,
    frameW: 96,
    frameH: 112,
    ss: 4,               // supersampling factor
    viewH: 3.9,          // world units visible vertically
    camTargetY: 0.42,
    groundY: -1.42,
    seed: 7,
    anims: {
        idle:      { frames: 16, fps: 8,  loop: true },
        greet:     { frames: 24, fps: 12, loop: false },
        celebrate: { frames: 12, fps: 12, loop: true },
        exit:      { frames: 12, fps: 14, loop: false },
    },
};

const OUTLINE = [3, 6, 14, 255];
const SHADOW = [0, 0, 0, 110];

// Per-material palette ramps (dark → light). lo/hi map rendered luminance onto the ramp.
const MATS = {
    coal:   { id: 1, lo: 0.03, hi: 0.62, dither: 0.7,
              ramp: ['#0b0e16', '#131a27', '#1c2738', '#27374d', '#355069', '#4f7896', '#7fc4dc', '#c8f6ff'] },
    // Face triangles: same bands as coal but capped below the cyan/white glints,
    // so nothing between the eyes can compete with the eye whites.
    coalFace: { id: 12, lo: 0.03, hi: 0.03 + (0.62 - 0.03) * 7 / 5, dither: 0.7,
              ramp: ['#0b0e16', '#131a27', '#1c2738', '#27374d', '#355069', '#4f7896'] },
    limb:   { id: 2, lo: 0.03, hi: 0.55, dither: 0.5,
              ramp: ['#0b0e16', '#161e2c', '#233146', '#35506a', '#5d8fad'] },
    white:  { id: 3, lo: 0.25, hi: 0.95, dither: 0.4,
              ramp: ['#5b7a95', '#a0d8ef', '#d4f1f9', '#ffffff'] },
    pupil:  { id: 4, lo: 0.0, hi: 0.3, dither: 0,
              ramp: ['#05070c', '#141a28'] },
    glove:  { id: 5, lo: 0.25, hi: 0.95, dither: 0.4,
              ramp: ['#5b7a95', '#a0d8ef', '#d4f1f9', '#ffffff'] },
    boot:   { id: 6, lo: 0.05, hi: 0.6, dither: 0.4,
              ramp: ['#2a1a14', '#5d4037', '#8d6e63', '#b8998c'] },
    wood:   { id: 7, lo: 0.08, hi: 0.7, dither: 0.3,
              ramp: ['#3e2a1c', '#6d4c33', '#9c7050', '#c89c6e'] },
    steel:  { id: 8, lo: 0.08, hi: 0.85, dither: 0.5,
              ramp: ['#243040', '#45576b', '#71879d', '#a9bfd2', '#e8f7ff'] },
    ember:  { id: 9, lo: 0.3, hi: 1.0, dither: 0.3,
              ramp: ['#9a300c', '#e0600f', '#ff9800', '#ffc766'] },
    mouth:  { id: 10, lo: 0.0, hi: 0.35, dither: 0,
              ramp: ['#2a0a0e', '#5a1418'] },
    tongue: { id: 11, lo: 0.1, hi: 0.7, dither: 0,
              ramp: ['#a3261d', '#f44336', '#ff7a6b'] },
    shadow: { id: 14, shadow: true },
};
const MAT_BY_ID = {};
for (const [name, m] of Object.entries(MATS)) { m.name = name; MAT_BY_ID[m.id] = m; }
for (const m of Object.values(MATS)) if (m.ramp) m.rgb = m.ramp.map(hexToRgb);

function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── Materials ─────────────────────────────────────────────────────────────
const LIT = {
    coal:   new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.38, metalness: 0.3, flatShading: true }),
    coalFace: new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.6, metalness: 0.2, flatShading: true }),
    limb:   new THREE.MeshStandardMaterial({ color: 0x353c4a, roughness: 0.5, metalness: 0.2, flatShading: true }),
    white:  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, flatShading: true }),
    pupil:  new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.3, flatShading: true }),
    glove:  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true }),
    boot:   new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.7, flatShading: true }),
    wood:   new THREE.MeshStandardMaterial({ color: 0xa0714f, roughness: 0.8, flatShading: true }),
    steel:  new THREE.MeshStandardMaterial({ color: 0xa8bccf, roughness: 0.3, metalness: 0.35, flatShading: true }),
    ember:  new THREE.MeshStandardMaterial({ color: 0xff8a00, emissive: 0xff6a00, emissiveIntensity: 0.9, flatShading: true }),
    mouth:  new THREE.MeshStandardMaterial({ color: 0x3a0c10, roughness: 0.6, flatShading: true }),
    tongue: new THREE.MeshStandardMaterial({ color: 0xf44336, roughness: 0.6, flatShading: true }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000 }),
};
const ID_MATS = {};
for (const [name, m] of Object.entries(MATS)) {
    const mat = new THREE.MeshBasicMaterial();
    mat.color.setRGB((m.id * 16) / 255, 0, 0); // working space is linear → exact bytes in a linear RT
    ID_MATS[name] = mat;
}

function mesh(geo, matName) {
    const m = new THREE.Mesh(geo, LIT[matName]);
    m.userData.matName = matName;
    return m;
}

// ── Model ─────────────────────────────────────────────────────────────────
// Face zone (on the unit sphere, before displacement): no random bumps here,
// otherwise a facet between the eyes turns into a bright spike.
const inFaceZone = (v) => v.z > 0.5 && Math.abs(v.x) < 0.62 && v.y > -0.55 && v.y < 0.65;

// Returns { body, face }: the lump split so the face triangles can use a
// duller material (see MATS.coalFace).
function buildCoalGeometry(rand) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    const disp = new Map();
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
        if (!disp.has(key)) {
            const r = 0.86 + rand() * 0.2; // always draw, so the rest of the lump keeps its shape
            disp.set(key, inFaceZone(v) ? 0.95 : r);
        }
        v.multiplyScalar(disp.get(key));
        v.x *= 1.02; v.y *= 1.06; v.z *= 0.86;
        if (v.y < -0.72) v.y = -0.72 + (v.y + 0.72) * 0.35; // flatter bottom
        pos.setXYZ(i, v.x, v.y, v.z);
    }
    const body = [], face = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
        const m = a.clone().add(b).add(c).divideScalar(3);
        const isFace = m.z > 0.3 && Math.abs(m.x) < 0.62 && m.y > -0.55 && m.y < 0.62;
        (isFace ? face : body).push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    const toGeo = (arr) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        g.computeVertexNormals();
        return g;
    };
    return { body: toGeo(body), face: toGeo(face) };
}

function surfaceZ(coal, x, y) {
    const rc = new THREE.Raycaster(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1));
    const hit = rc.intersectObjects(coal, false)[0];
    return hit ? hit.point.z : 0.8;
}

function buildShovel() {
    // Origin = top of the T-grip; the shovel hangs along -Y.
    const g = new THREE.Group();
    const grip = mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.3, 6), 'wood');
    grip.rotation.z = Math.PI / 2;
    grip.position.y = -0.04;
    g.add(grip);
    const handle = mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.1, 6), 'wood');
    handle.position.y = -0.6;
    g.add(handle);
    const collar = mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.16, 6), 'steel');
    collar.position.y = -1.18;
    g.add(collar);
    const s = new THREE.Shape();
    s.moveTo(-0.2, 0);
    s.lineTo(0.2, 0);
    s.lineTo(0.235, -0.26);
    s.quadraticCurveTo(0.15, -0.46, 0, -0.6);
    s.quadraticCurveTo(-0.15, -0.46, -0.235, -0.26);
    s.closePath();
    const bladeGeo = new THREE.ExtrudeGeometry(s, {
        depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 3,
    });
    bladeGeo.translate(0, 0, -0.02);
    const blade = mesh(bladeGeo, 'steel');
    blade.position.y = -1.24;
    blade.rotation.x = -0.12; // slight scoop angle so the face catches light
    g.add(blade);
    const step = mesh(new THREE.BoxGeometry(0.46, 0.05, 0.09), 'steel');
    step.position.y = -1.24;
    g.add(step);
    g.userData.length = 1.9;
    return g;
}

function buildMascot() {
    const rand = mulberry32(CFG.seed);
    const rig = {};

    const root = new THREE.Group();
    rig.root = root;

    // Legs (not affected by body squash)
    const legGeo = new THREE.CylinderGeometry(0.075, 0.07, 0.36, 6);
    legGeo.translate(0, -0.18, 0);
    const bootGeo = new THREE.SphereGeometry(0.2, 7, 5);
    bootGeo.scale(1.0, 0.62, 1.35);
    for (const side of [1, -1]) {
        const hip = new THREE.Group();
        hip.position.set(0.34 * side, -0.72, 0);
        hip.add(mesh(legGeo, 'limb'));
        const boot = mesh(bootGeo, 'boot');
        boot.position.set(0.02 * side, -0.42, 0.07);
        hip.add(boot);
        root.add(hip);
        rig[side > 0 ? 'legL' : 'legR'] = hip;
    }

    // Body pivot at the bottom so squash keeps the feet planted
    const bodyPivot = new THREE.Group();
    bodyPivot.position.y = -0.72;
    root.add(bodyPivot);
    rig.bodyPivot = bodyPivot;
    const body = new THREE.Group();
    body.position.y = 0.72;
    bodyPivot.add(body);

    const coalGeo = buildCoalGeometry(rand);
    const coal = [mesh(coalGeo.body, 'coal'), mesh(coalGeo.face, 'coalFace')];
    for (const m of coal) { m.updateMatrixWorld(true); body.add(m); }

    // Face
    const eyeGeo = new THREE.SphereGeometry(0.25, 10, 8);
    const pupilGeo = new THREE.SphereGeometry(0.13, 8, 6);
    const glintGeo = new THREE.SphereGeometry(0.05, 5, 4);
    const happyGeo = new THREE.TorusGeometry(0.15, 0.055, 5, 9, Math.PI);
    rig.eyes = []; rig.pupils = []; rig.happyEyes = [];
    for (const side of [1, -1]) {
        const ex = 0.3 * side, ey = 0.22;
        const z = surfaceZ(coal, ex, ey);
        const eye = new THREE.Group();
        eye.position.set(ex, ey, z - 0.1);
        eye.rotation.y = 0.18 * side;
        const white = mesh(eyeGeo, 'white');
        white.scale.set(0.9, 1.1, 0.7);
        eye.add(white);
        const pupil = new THREE.Group();
        const p = mesh(pupilGeo, 'pupil');
        p.scale.set(1, 1.15, 0.6);
        pupil.add(p);
        const glint = mesh(glintGeo, 'white');
        glint.position.set(0.05, 0.06, 0.07);
        pupil.add(glint);
        pupil.position.set(0, 0, 0.14);
        eye.add(pupil);
        body.add(eye);
        rig.eyes.push(eye); rig.pupils.push(pupil);

        const happy = mesh(happyGeo, 'white');
        happy.position.set(ex, ey - 0.05, z + 0.01);
        happy.rotation.y = 0.18 * side;
        happy.scale.set(1, 1, 0.6);
        happy.visible = false;
        body.add(happy);
        rig.happyEyes.push(happy);

        const cheek = mesh(new THREE.SphereGeometry(0.085, 6, 4), 'ember');
        const cx = 0.52 * side, cy = -0.1;
        cheek.position.set(cx, cy, surfaceZ(coal, cx, cy) - 0.03);
        cheek.scale.set(1.3, 0.8, 0.5);
        body.add(cheek);
    }

    const mz = surfaceZ(coal, 0, -0.14);
    const smile = mesh(new THREE.TorusGeometry(0.12, 0.035, 5, 9, Math.PI), 'mouth');
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.07, mz - 0.01);
    body.add(smile);
    rig.smile = smile;
    const open = new THREE.Group();
    const cavity = mesh(new THREE.SphereGeometry(0.2, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 'mouth');
    cavity.rotation.x = 0;
    cavity.scale.set(1, 1.1, 0.5);
    open.add(cavity);
    const tongue = mesh(new THREE.SphereGeometry(0.1, 6, 4), 'tongue');
    tongue.position.set(0.0, -0.13, 0.05);
    tongue.scale.set(1.1, 0.6, 0.6);
    open.add(tongue);
    open.position.set(0, -0.1, mz - 0.03);
    open.visible = false;
    body.add(open);
    rig.openMouth = open;

    // Arms
    const armGeo = new THREE.CylinderGeometry(0.065, 0.06, 0.62, 6);
    armGeo.translate(0, -0.31, 0);
    const handGeo = new THREE.SphereGeometry(0.14, 7, 5);
    for (const side of [1, -1]) {
        const shoulder = new THREE.Group();
        shoulder.position.set(0.86 * side, -0.02, 0.02);
        shoulder.add(mesh(armGeo, 'limb'));
        const hand = new THREE.Group();
        hand.position.y = -0.68;
        const glove = mesh(handGeo, 'glove');
        glove.scale.set(1, 1.05, 1);
        hand.add(glove);
        const cuff = mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.07, 7), 'glove');
        cuff.position.y = 0.12;
        hand.add(cuff);
        shoulder.add(hand);
        body.add(shoulder);
        rig[side > 0 ? 'armL' : 'armR'] = shoulder;
        rig[side > 0 ? 'handL' : 'handR'] = hand;
    }

    // Shovel in the right hand (viewer's left)
    const shovelPivot = new THREE.Group();
    const shovel = buildShovel();
    shovelPivot.add(shovel);
    shovelPivot.position.z = 0.04;
    rig.handR.add(shovelPivot);
    rig.shovelPivot = shovelPivot;
    rig.shovel = shovel;

    // Ground shadow (separate so it stays on the floor)
    const shadow = mesh(new THREE.CircleGeometry(0.85, 16), 'shadow');
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = CFG.groundY + 0.005;
    shadow.scale.set(1.1, 0.8, 1);
    rig.shadow = shadow;

    return rig;
}

// ── Poses & animations ────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { const c = 1.9; t = clamp01(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };

function basePose() {
    return {
        rootY: 0, yaw: 0.32, spin: 0, scale: 1,
        squash: 1, tilt: 0, lean: 0,
        armL: { z: 0.38, x: 0 }, armR: { z: -0.34, x: 0 },
        legL: { x: 0, z: 0 }, legR: { x: 0, z: 0 },
        shovel: { tilt: 0.14, hold: 1.0, twist: 0.5 },
        blink: 1, happy: false, mouthOpen: false, look: { x: 0.02, y: 0 },
    };
}

function idlePose(t) {
    const p = basePose();
    const b = Math.sin(TAU * t);
    p.squash = 1 + 0.035 * b;
    p.yaw += 0.05 * Math.sin(TAU * t);
    p.tilt = 0.025 * Math.sin(TAU * t + 0.8);
    p.armL.z += 0.07 * b;
    p.armR.z -= 0.03 * b;
    p.shovel.tilt += 0.02 * Math.sin(TAU * t + 0.8);
    const f = Math.round(t * 16);
    if (f === 12) p.blink = 0.1;
    else if (f === 11 || f === 13) p.blink = 0.55;
    p.look.x = t > 0.3 && t < 0.7 ? 0.05 : 0.02;
    return p;
}

function greetPose(t) {
    const p = basePose();
    // Pop in: 0 → 0.25
    const pop = t / 0.25;
    if (pop < 1) {
        p.scale = Math.max(0.05, easeOutBack(pop));
        p.rootY = Math.sin(Math.PI * clamp01(pop)) * 0.45;
        p.squash = 1 + 0.12 * Math.sin(Math.PI * clamp01(pop));
        p.spin = (1 - smooth(pop)) * -1.2;
    }
    // Wave: 0.25 → 1, arm goes up, waves 3 times, comes back to idle pose
    const w = clamp01((t - 0.25) / 0.75);
    const env = smooth(w / 0.15) * (1 - smooth((w - 0.85) / 0.15));
    const wave = Math.sin(TAU * 3 * w);
    p.armL.z = lerp(0.38, 2.55 + 0.35 * wave, env);
    p.armL.x = 0.4 * env;
    p.tilt = -0.09 * env;
    p.mouthOpen = env > 0.3 && w < 0.8;
    p.look.x = lerp(0.02, 0.06, env);
    p.look.y = 0.03 * env;
    if (Math.round(t * 24) === 21) p.blink = 0.1;
    return p;
}

function celebratePose(t) {
    const p = basePose();
    const hop = Math.sin(Math.PI * t);                 // one hop per loop
    p.rootY = 0.38 * hop;
    p.squash = 0.96 - 0.1 * Math.cos(TAU * t);        // squash on landing, stretch in the air
    p.yaw = 0.32 + 0.14 * Math.sin(TAU * t);
    p.tilt = 0.05 * Math.sin(TAU * t);
    const pump = Math.sin(TAU * 2 * t);
    p.armR.z = -2.55 - 0.12 * pump;                    // shovel arm up
    p.armR.x = 0.35;
    p.armL.z = 2.35 + 0.18 * Math.sin(TAU * 2 * t + Math.PI);
    p.armL.x = 0.4;
    p.shovel.tilt = Math.PI - 0.38 + 0.1 * pump;       // blade up, leaning outward
    p.shovel.hold = 0.62;
    p.shovel.twist = 0.8;
    p.legL.x = -0.45 * hop; p.legR.x = 0.35 * hop;
    p.legL.z = 0.15 * hop; p.legR.z = -0.15 * hop;
    p.happy = true;
    p.mouthOpen = true;
    return p;
}

function exitPose(t) {
    const p = basePose();
    const a = clamp01(t / 0.3);
    const b = clamp01((t - 0.3) / 0.7);
    p.squash = 1 - 0.22 * Math.sin(Math.PI * a) * (b > 0 ? 0 : 1) + 0.15 * Math.sin(Math.PI * b);
    p.armL.z = lerp(0.38, 2.0, smooth(a));
    p.armR.z = lerp(-0.34, -0.9, smooth(a));
    p.rootY = 1.3 * b * b + 0.5 * b;
    p.spin = TAU * 1.25 * smooth(b);
    p.scale = 1 - smooth(b * 1.05);
    p.happy = t > 0.15;
    p.legL.x = -0.4 * b; p.legR.x = 0.4 * b;
    return p;
}

const POSES = { idle: idlePose, greet: greetPose, celebrate: celebratePose, exit: exitPose };

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();

function applyPose(rig, p) {
    const baseY = 0;
    rig.root.position.y = baseY + p.rootY;
    rig.root.rotation.y = p.yaw + p.spin;
    rig.root.scale.setScalar(Math.max(0.0001, p.scale));
    rig.bodyPivot.scale.set(1 / Math.sqrt(p.squash), p.squash, 1 / Math.sqrt(p.squash));
    rig.bodyPivot.rotation.z = p.tilt;
    rig.bodyPivot.rotation.x = p.lean;
    rig.armL.rotation.set(p.armL.x, 0, p.armL.z);
    rig.armR.rotation.set(p.armR.x, 0, p.armR.z);
    rig.legL.rotation.set(p.legL.x, 0, p.legL.z);
    rig.legR.rotation.set(p.legR.x, 0, p.legR.z);
    // Orient the shovel in character space (independent of arm/body rotation):
    // twist around its own handle first, then tilt sideways.
    rig.shovel.position.y = p.shovel.hold;
    rig.root.updateMatrixWorld(true);
    const handQ = rig.handR.getWorldQuaternion(_q1).invert();
    const want = _q2.setFromEuler(_e.set(p.shovel.lean || 0, p.shovel.twist, p.shovel.tilt, 'ZYX'));
    rig.shovelPivot.quaternion.copy(handQ).multiply(rig.root.quaternion).multiply(want);
    for (const e of rig.eyes) { e.scale.y = p.blink; e.visible = !p.happy; }
    for (const h of rig.happyEyes) h.visible = p.happy;
    for (const pu of rig.pupils) pu.position.set(p.look.x, p.look.y, 0.14);
    rig.smile.visible = !p.mouthOpen;
    rig.openMouth.visible = p.mouthOpen;
    const lift = Math.max(0, p.rootY);
    const s = p.scale * (1 - Math.min(0.5, lift * 0.35));
    rig.shadow.scale.set(1.1 * s, 0.8 * s, 1);
    rig.shadow.visible = s > 0.08;
}

// ── Rendering ─────────────────────────────────────────────────────────────
const W = CFG.frameW, H = CFG.frameH, SS = CFG.ss;
const RW = W * SS, RH = H * SS;

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH);
renderer.setClearColor(0x000000, 0);

const rtLit = new THREE.WebGLRenderTarget(RW, RH);
rtLit.texture.colorSpace = THREE.SRGBColorSpace;
const rtId = new THREE.WebGLRenderTarget(RW, RH);

const scene = new THREE.Scene();
const fov = 18;
const camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 100);
const dist = (CFG.viewH / 2) / Math.tan((fov / 2) * Math.PI / 180);
camera.position.set(0, CFG.camTargetY + 1.4, dist);
camera.lookAt(0, CFG.camTargetY, 0);

scene.add(new THREE.HemisphereLight(0x5a7fa8, 0x0a0f18, 0.9));
const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
key.position.set(2.5, 3.5, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0x40e8ff, 3.2);
rim.position.set(-3.5, 2.2, -2.5);
scene.add(rim);
const rim2 = new THREE.DirectionalLight(0x9a7dff, 1.4);
rim2.position.set(3.5, 0.5, -3);
scene.add(rim2);

const rig = buildMascot();
scene.add(rig.root);
scene.add(rig.shadow);

const allMeshes = [];
scene.traverse((o) => { if (o.isMesh) allMeshes.push(o); });

function setPass(idPass) {
    for (const m of allMeshes) m.material = idPass ? ID_MATS[m.userData.matName] : LIT[m.userData.matName];
}

const bufLit = new Uint8Array(RW * RH * 4);
const bufId = new Uint8Array(RW * RH * 4);

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function renderFrame(pose) {
    applyPose(rig, pose);
    setPass(false);
    renderer.setRenderTarget(rtLit);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rtLit, 0, 0, RW, RH, bufLit);
    setPass(true);
    renderer.setRenderTarget(rtId);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rtId, 0, 0, RW, RH, bufId);
    renderer.setRenderTarget(null);
    return downsample();
}

function downsample() {
    const ids = new Uint8Array(W * H);
    const out = new Uint8ClampedArray(W * H * 4);
    const counts = new Uint16Array(16);
    const lums = new Float32Array(16);
    const half = (SS * SS) / 2;
    for (let oy = 0; oy < H; oy++) {
        for (let ox = 0; ox < W; ox++) {
            counts.fill(0); lums.fill(0);
            let covered = 0;
            for (let sy = 0; sy < SS; sy++) {
                // render targets are bottom-up
                const ry = RH - 1 - (oy * SS + sy);
                for (let sx = 0; sx < SS; sx++) {
                    const i = (ry * RW + ox * SS + sx) * 4;
                    if (bufId[i + 3] < 128) continue;
                    const id = Math.round(bufId[i] / 16);
                    covered++;
                    counts[id]++;
                    lums[id] += (0.2126 * bufLit[i] + 0.7152 * bufLit[i + 1] + 0.0722 * bufLit[i + 2]) / 255;
                }
            }
            if (covered < half) continue;
            let best = 0;
            for (let k = 1; k < 16; k++) if (counts[k] > counts[best]) best = k;
            // Prefer the character over the shadow when both are present
            if (best === MATS.shadow.id) {
                for (let k = 1; k < 16; k++) if (k !== best && counts[k] >= SS * 2) { best = k; break; }
            }
            const m = MAT_BY_ID[best];
            if (!m) continue;
            const o = (oy * W + ox);
            ids[o] = best;
            let c;
            if (m.shadow) c = SHADOW;
            else {
                const lum = lums[best] / counts[best];
                const t = clamp01((lum - m.lo) / (m.hi - m.lo));
                const v = t * (m.rgb.length - 1);
                const base = Math.floor(v);
                const frac = v - base;
                const thr = 0.5 + (BAYER4[(oy & 3) * 4 + (ox & 3)] - 0.5) * m.dither;
                c = m.rgb[Math.min(m.rgb.length - 1, base + (frac > thr ? 1 : 0))];
            }
            out.set(c, o * 4);
        }
    }
    // Eye sockets: coal pixels touching the eye whites get the darkest coal tone,
    // so the eyes read as set into the lump instead of pasted on top.
    const WHITE = MATS.white.id;
    const isCoal = (id) => id === MATS.coal.id || id === MATS.coalFace.id;
    const isWhite = (x, y) => x >= 0 && y >= 0 && x < W && y < H && ids[y * W + x] === WHITE;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (!isCoal(ids[y * W + x])) continue;
            if (isWhite(x - 1, y) || isWhite(x + 1, y) || isWhite(x, y - 1) || isWhite(x, y + 1)) {
                out.set(MATS.coal.rgb[0], (y * W + x) * 4);
            }
        }
    }
    // 1px outline around the character (not around the shadow)
    const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && ids[y * W + x] && ids[y * W + x] !== MATS.shadow.id;
    const outline = [];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const id = ids[y * W + x];
            if (id && id !== MATS.shadow.id) continue;
            if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) outline.push(y * W + x);
        }
    }
    for (const o of outline) out.set(OUTLINE, o * 4);
    return new ImageData(out, W, H);
}

function groundPixelY() {
    const v = new THREE.Vector3(0, CFG.groundY, 0).project(camera);
    return Math.round((1 - (v.y + 1) / 2) * H);
}

// ── UI ────────────────────────────────────────────────────────────────────
const sheets = {};
const statusEl = document.getElementById('status');
const previewsEl = document.getElementById('previews');

function setStatus(s) { statusEl.textContent = s; }

async function renderAll() {
    previewsEl.innerHTML = '';
    for (const [name, a] of Object.entries(CFG.anims)) {
        setStatus(`Rendering ${name}…`);
        await new Promise((r) => setTimeout(r, 0));
        const sheet = document.createElement('canvas');
        sheet.width = W * a.frames;
        sheet.height = H;
        const ctx = sheet.getContext('2d');
        for (let f = 0; f < a.frames; f++) {
            ctx.putImageData(renderFrame(POSES[name](f / a.frames)), f * W, 0);
        }
        sheets[name] = sheet;
        addPreview(name, a, sheet);
    }
    setStatus('Rendered. Click "Save to assets/mascot" (needs tools/mascot/serve.py) or download.');
}

function addPreview(name, a, sheet) {
    const box = document.createElement('div');
    box.className = 'pv';
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cx = c.getContext('2d');
    let f = 0;
    setInterval(() => {
        cx.clearRect(0, 0, W, H);
        cx.drawImage(sheet, f * W, 0, W, H, 0, 0, W, H);
        f = (f + 1) % a.frames;
    }, 1000 / a.fps);
    const label = document.createElement('div');
    label.textContent = `${name} · ${a.frames}f @ ${a.fps}fps`;
    const strip = sheet;
    strip.className = 'strip';
    box.append(label, c, strip);
    previewsEl.append(box);
}

function metadata() {
    const animations = {};
    for (const [name, a] of Object.entries(CFG.anims)) {
        animations[name] = { file: `${name}.png`, frames: a.frames, fps: a.fps, loop: a.loop };
    }
    return {
        revision: CFG.revision,
        frameWidth: W,
        frameHeight: H,
        groundY: groundPixelY(),
        animations,
    };
}

const toBlob = (canvas) => new Promise((r) => canvas.toBlob(r, 'image/png'));

async function saveAll() {
    setStatus('Saving…');
    try {
        for (const name of Object.keys(CFG.anims)) {
            const res = await fetch(`/__mascot_save/${name}.png`, { method: 'POST', body: await toBlob(sheets[name]) });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        }
        const json = JSON.stringify(metadata(), null, 2) + '\n';
        const res = await fetch('/__mascot_save/mascot.json', { method: 'POST', body: json });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        setStatus('Saved to assets/mascot/ ✔');
        document.title = 'SAVED';
    } catch (e) {
        setStatus(`Save failed (${e.message}). Are you running tools/mascot/serve.py? Use Download instead.`);
        document.title = 'SAVE FAILED';
    }
}

async function downloadAll() {
    const dl = (href, name) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click(); };
    for (const name of Object.keys(CFG.anims)) dl(URL.createObjectURL(await toBlob(sheets[name])), `${name}.png`);
    dl(URL.createObjectURL(new Blob([JSON.stringify(metadata(), null, 2) + '\n'])), 'mascot.json');
}

document.getElementById('btn-render').onclick = renderAll;
document.getElementById('btn-save').onclick = saveAll;
document.getElementById('btn-download').onclick = downloadAll;

await renderAll();
if (new URLSearchParams(location.search).has('autosave')) await saveAll();
