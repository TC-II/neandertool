# Mascot sprite generator

The coal buddy is modelled procedurally in Three.js (`generate.js`) and pre-rendered
to pixel-art sprite sheets. The game itself (`js/mascot.js`) only loads the PNGs and
draws them on a 2D canvas, so there's no Three.js or WebGL at runtime.

## Regenerate the sprites

From the repo root:

```bash
python tools/mascot/serve.py
```

Then open <http://localhost:8778/tools/mascot/generate.html>. The page renders every
animation and shows animated previews plus the raw strips. Click **Save to
assets/mascot** to write:

- `assets/mascot/{idle,greet,celebrate,exit}.png`: one horizontal strip per animation
- `assets/mascot/mascot.json`: frame size, frame count, fps and loop flag for each animation

`generate.html?autosave=1` renders and saves in one go. If you serve the repo with plain
`python -m http.server`, saving isn't available; use **Download** and copy the files
into `assets/mascot/` by hand.

After regenerating, bump `revision` in `generate.js` and pass it to
`Mascot.init({ version })` so browsers don't keep the old sprites cached.

Three.js is loaded from jsdelivr (pinned to 0.160.0), so the generator needs internet
access. The game doesn't.

## How the pixel look is produced

1. Each frame is rendered twice at `ss×` resolution (4× by default):
   - a **lit pass** with flat-shaded `MeshStandardMaterial`s: a warm key light, a cyan rim
     light from behind on the left and a purple rim light on the right
   - an **ID pass** where every material draws as a flat colour that encodes its ID
2. Each output pixel takes the majority material ID from its `ss×ss` block (a pixel
   less than half covered becomes transparent). The average lit luminance is then mapped
   onto that material's colour **ramp** in `MATS`, with light 4×4 ordered dithering. The
   result is a limited palette with no blending between materials.
3. A 1px dark outline goes around the silhouette. The ground shadow is a translucent
   black ellipse.

## What to tweak

| What | Where in `generate.js` |
|---|---|
| Sprite size, supersampling, framing | `CFG.frameW/frameH/ss/viewH/camTargetY` |
| Frame counts / fps per animation | `CFG.anims` |
| Palette / shading bands | `MATS[*].ramp`, `lo`/`hi` (luminance window), `dither` |
| Lump shape | `buildCoalGeometry` (the `seed` in `CFG` changes the random facets) |
| Face, arms, legs, boots | `buildMascot` |
| Shovel | `buildShovel` |
| Lights | the `HemisphereLight`/`DirectionalLight`s after the camera setup |
| Animations | `idlePose`, `greetPose`, `celebratePose`, `exitPose`. Each maps `t ∈ [0,1)` to a pose |

Pose fields (see `basePose`): `rootY` (jump), `yaw`/`spin`, `scale`, `squash`,
`tilt`, arm/leg `{x,z}` rotations, `shovel {tilt, twist, hold}` in character space,
`blink`, `happy` (^ ^ eyes), `mouthOpen` and `look` (pupil offset).
