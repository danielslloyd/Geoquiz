# 3D Textured Globe — Build Spec

## Goal

A standalone, no-build, pure-JS 3D globe prototype:

- **Satellite texture** — equirectangular color image mapped onto a sphere
- **GPU elevation displacement** — vertex shader reads a grayscale heightmap and displaces vertices outward along sphere normals; mountains physically protrude from the geometry
- **Hillshade composite** — pre-baked terrain shading image blended as a multiply layer on top of satellite texture, adding terrain detail
- **Baked borders** — country borders and coastlines from GeoJSON converted to `THREE.LineSegments` geometry, lifted above the sphere surface and terrain-displaced to follow the heightmap
- **Click detection** — Three.js raycaster → lat/lon → `d3.geoContains` for country identification
- **UI** — sliders for elevation scale and hillshade strength, checkbox to toggle borders

No npm, no bundler, no build step. `node server.js` then open `localhost:3000`.

---

## File Structure

```
globe-3d/
├── server.js
├── index.html
├── globe.js
├── textures/
│   ├── satellite.jpg      # equirectangular RGB, min 2048×1024
│   ├── heightmap.png      # equirectangular grayscale, same dims (PNG, not JPEG)
│   └── hillshade.jpg      # equirectangular grayscale, same dims
└── data/
    └── countries.geojson  # Natural Earth 110m admin-0 countries
```

---

## Run Instructions

```bash
node server.js
# → http://localhost:3000
```

---

## Data Assets

### Satellite texture (`textures/satellite.jpg`)

NASA Blue Marble Next Generation — public domain. Search "NASA Visible Earth Blue Marble Next Generation" and download one of the equirectangular JPEG files. A 4096×2048 JPEG is around 3–5 MB and loads quickly. The 8192×4096 version gives more detail but is ~20 MB.

Alternative: Natural Earth I raster (`NE1_HR_LC.jpg`) from naturalearthdata.com — easier to download, lower contrast, still looks good.

**Requirement:** must use equirectangular (geographic) projection. Do not use Mercator or other projections.

### Heightmap (`textures/heightmap.png`)

An equirectangular **grayscale PNG** encoding elevation, where:
- Black (0.0) = deepest ocean trench
- White (1.0) = highest peak (Everest ~8848m)
- Sea level sits at a normalized value of approximately **0.44–0.55** depending on the source (calibrate the `SEA_LEVEL` constant after downloading — see Gotchas)

Source options:
- ETOPO1 global relief model (NOAA, public domain) — download and export as grayscale PNG
- Natural Earth Cross-blended Hypsometric Tints includes a matching elevation raster
- Any SRTM-derived grayscale DEM rendered in equirectangular projection

**Must be PNG**, not JPEG. JPEG's block compression artifacts become visible as grid-pattern ridges in the displaced geometry.

Match the heightmap dimensions exactly to the satellite texture dimensions for clean UV alignment.

### Hillshade (`textures/hillshade.jpg`)

A grayscale image encoding terrain illumination: bright = sunlit slope, dark = shadowed valley. JPEG is fine for this layer.

Sources:
- The Natural Earth hypsometric package includes a hillshade
- SRTM-derived hillshades from naturalearthdata.com ("Natural Earth I with Shaded Relief and Water")
- Can omit this initially — set `uHillshadeStrength` slider to 0

### Country borders (`data/countries.geojson`)

Natural Earth **110m admin-0 countries** as GeoJSON. Around 500 KB.

Download from: https://github.com/nvkelso/natural-earth-vector (look in `geojson/ne_110m_admin_0_countries.geojson`) or from naturalearthdata.com under Cultural > Admin 0 Countries.

Each `feature.properties.NAME` is the country name. Geometry is `Polygon` or `MultiPolygon`.

---

## server.js

Uses only Node.js built-ins — no npm install required.

```js
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;

const MIME = {
  '.html':    'text/html; charset=utf-8',
  '.js':      'application/javascript; charset=utf-8',
  '.css':     'text/css',
  '.json':    'application/json',
  '.geojson': 'application/json',
  '.png':     'image/png',
  '.jpg':     'image/jpeg',
  '.jpeg':    'image/jpeg',
  '.webp':    'image/webp',
};

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(__dirname, urlPath);

  // Prevent directory traversal
  if (!filePath.startsWith(__dirname + path.sep) && filePath !== __dirname) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'Not found: ' + urlPath : 'Server error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    const isAsset = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': isAsset ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(data);
  });

}).listen(PORT, () => {
  console.log(`Globe → http://localhost:${PORT}`);
});
```

---

## index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3D Globe</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; font-family: system-ui, sans-serif; color: #fff; }

    #canvas-container { width: 100vw; height: 100vh; }

    #controls {
      position: fixed; top: 16px; right: 16px; z-index: 10;
      background: rgba(0, 0, 0, 0.72);
      padding: 14px 18px; border-radius: 10px;
      display: flex; flex-direction: column; gap: 12px;
      min-width: 210px; font-size: 13px;
    }
    #controls label { display: flex; flex-direction: column; gap: 4px; }
    #controls input[type=range] { cursor: pointer; accent-color: #4a9eff; }
    .check-row { display: flex; align-items: center; gap: 8px; cursor: pointer; }

    #tooltip {
      position: fixed; bottom: 24px; left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.78);
      padding: 7px 18px; border-radius: 6px;
      font-size: 14px; pointer-events: none;
      opacity: 0; transition: opacity 0.15s;
    }
    #tooltip.show { opacity: 1; }

    #loading {
      position: fixed; inset: 0; z-index: 20;
      background: #000;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; letter-spacing: 0.04em;
    }
  </style>
</head>
<body>

<div id="loading">Loading…</div>
<div id="canvas-container"></div>

<div id="controls">
  <label>
    Elevation scale
    <input type="range" id="elevation-scale" min="0" max="0.15" step="0.005" value="0.05">
  </label>
  <label>
    Hillshade strength
    <input type="range" id="hillshade-strength" min="0" max="1" step="0.05" value="0.6">
  </label>
  <label class="check-row">
    <input type="checkbox" id="borders-toggle" checked>
    Show borders
  </label>
</div>

<div id="tooltip"></div>

<script type="importmap">
{
  "imports": {
    "three":         "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/",
    "d3-geo":        "https://cdn.jsdelivr.net/npm/d3-geo@3/+esm"
  }
}
</script>

<script type="module" src="globe.js"></script>

</body>
</html>
```

**Note:** The `<script type="importmap">` block must appear before any `<script type="module">` tag. Importmaps require HTTP — they don't work from `file://`.

---

## globe.js

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { geoContains } from 'd3-geo';

// ─── Config ───────────────────────────────────────────────────────────────────

const SPHERE_RADIUS = 1;
const SPHERE_W_SEGS = 512;   // longitude divisions (try 256 on low-end hardware)
const SPHERE_H_SEGS = 256;   // latitude divisions
const BORDER_LIFT   = 0.002; // extra offset above terrain to prevent z-fighting

// Normalized grayscale value (0–1) at sea level in your heightmap.
// Calibrate this after downloading your heightmap — see Gotchas section.
// Natural Earth hypsometric ≈ 0.44; ETOPO1 ≈ 0.55
const SEA_LEVEL = 0.44;

// ─── Shaders ─────────────────────────────────────────────────────────────────

// The /* glsl */ comment is a hint for editor syntax highlighting only.

const vertexShader = /* glsl */`
  uniform sampler2D uHeightMap;
  uniform float     uElevationScale;
  uniform float     uSeaLevel;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying float vElevation; // passed to fragment shader (unused currently, useful for debugging)

  void main() {
    vUv = uv;

    // Sample the heightmap. The SphereGeometry UV matches equirectangular:
    // uv.x: 0 = lon -180, 1 = lon +180
    // uv.y: 0 = lat +90 (north pole), 1 = lat -90 (south pole)
    float h = texture2D(uHeightMap, uv).r;

    // Remap so 0 = sea level, 1 = max elevation. Ocean (h < seaLevel) → 0 (no displacement).
    float landH = max(0.0, (h - uSeaLevel) / (1.0 - uSeaLevel));
    vElevation = landH;

    // Displace vertex outward along its sphere normal.
    // 'normal' for a sphere == normalize(position), pointing radially outward.
    vec3 displaced = position + normal * landH * uElevationScale;

    // World-space normal for large-scale diffuse lighting.
    // Uses the undisplaced normal — valid approximation for uElevationScale <= 0.1.
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D uSatellite;
  uniform sampler2D uHillshade;
  uniform float     uHillshadeStrength;
  uniform vec3      uLightDir;   // normalized, world space (fixed sun direction)

  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying float vElevation;

  void main() {
    vec3  sat = texture2D(uSatellite, vUv).rgb;
    float hs  = texture2D(uHillshade,  vUv).r;

    // Hillshade multiply blend: darkens shadowed valleys while keeping lit slopes bright.
    // Multiply hs by 1.5 to compensate for the typically mid-gray average of hillshade images.
    float hsScaled = clamp(hs * 1.5, 0.0, 1.0);
    vec3 color = sat * mix(1.0, hsScaled, uHillshadeStrength);

    // Large-scale diffuse from the actual sphere geometry (responds to globe rotation).
    // This is what makes the 3D mountain silhouettes visible at the globe edge.
    float diff  = max(dot(normalize(vWorldNormal), normalize(uLightDir)), 0.0);
    float light = 0.35 + diff * 0.65;   // 35% ambient floor + 65% diffuse

    gl_FragColor = vec4(color * light, 1.0);
  }
`;

// ─── Scene Setup ─────────────────────────────────────────────────────────────

const container = document.getElementById('canvas-container');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap at 2× for perf
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000510);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.001,
  100
);
camera.position.set(0, 0, 2.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed   = 0.5;
controls.minDistance   = 1.1;
controls.maxDistance   = 10;
controls.enablePan     = false;

// ─── Atmosphere halo ─────────────────────────────────────────────────────────

// A slightly-larger back-facing sphere creates a subtle blue rim.
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(1.03, 64, 32),
  new THREE.MeshBasicMaterial({
    color: 0x1155bb,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.18,
  })
));

// ─── Globe Mesh ───────────────────────────────────────────────────────────────

const globeGeo = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_W_SEGS, SPHERE_H_SEGS);

const uniforms = {
  uSatellite:         { value: null },
  uHeightMap:         { value: null },
  uHillshade:         { value: null },
  uElevationScale:    { value: 0.05 },
  uHillshadeStrength: { value: 0.6 },
  uSeaLevel:          { value: SEA_LEVEL },
  uLightDir:          { value: new THREE.Vector3(1.5, 1.0, 1.0).normalize() },
};

const globe = new THREE.Mesh(
  globeGeo,
  new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader })
);
scene.add(globe);

// ─── Heightmap CPU Sampler ────────────────────────────────────────────────────

// We need to sample the heightmap in JavaScript to correctly displace border
// geometry to match the GPU's vertex displacement. Without this, border lines
// sit at a fixed radius and clip through mountains.
//
// After the heightmap texture loads, call buildHeightmapSampler(texture) to
// decode its pixels into a Float32Array and return a sample(lon, lat) function.

function buildHeightmapSampler(texture) {
  const img    = texture.image;
  const w      = img.width;
  const h      = img.height;
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx  = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data; // RGBA Uint8ClampedArray

  // Returns normalized [0,1] elevation at (lon, lat).
  // lon in [-180, 180], lat in [-90, 90].
  return function sample(lon, lat) {
    const u = ((lon + 180) / 360) * w;
    const v = ((90 - lat) / 180) * h;
    const x = Math.max(0, Math.min(w - 1, Math.floor(u)));
    const y = Math.max(0, Math.min(h - 1, Math.floor(v)));
    return data[(y * w + x) * 4] / 255; // red channel
  };
}

// ─── Border Geometry Helpers ──────────────────────────────────────────────────

// Convert (lon, lat) in degrees to a THREE.Vector3 on a sphere of radius r.
// Convention matches Three.js SphereGeometry UV layout.
function lonLatToVec3(lon, lat, r) {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

// Split a GeoJSON ring (array of [lon,lat]) wherever longitude jumps > 180°,
// which indicates an antimeridian crossing. Returns an array of sub-arrays.
function splitAtAntimeridian(ring) {
  const segs = [[]];
  for (let i = 0; i < ring.length; i++) {
    if (i > 0 && Math.abs(ring[i][0] - ring[i - 1][0]) > 180) {
      segs.push([]);
    }
    segs[segs.length - 1].push(ring[i]);
  }
  return segs.filter(s => s.length >= 2);
}

// Build a single THREE.LineSegments mesh from all borders in a GeoJSON
// FeatureCollection. All segments go into one draw call.
// heightSampler is the function returned by buildHeightmapSampler().
// elevationScale should match uniforms.uElevationScale.value.
function buildBorderMesh(geojson, heightSampler, elevationScale, seaLevel) {
  const positions = [];

  function processRing(ring) {
    for (const seg of splitAtAntimeridian(ring)) {
      for (let i = 1; i < seg.length; i++) {
        const [lonA, latA] = seg[i - 1];
        const [lonB, latB] = seg[i];

        // Compute terrain-displaced radius at each endpoint.
        // Must match the vertex shader formula exactly.
        const hA    = heightSampler(lonA, latA);
        const landA = Math.max(0, (hA - seaLevel) / (1 - seaLevel));
        const rA    = SPHERE_RADIUS * (1 + landA * elevationScale) + BORDER_LIFT;

        const hB    = heightSampler(lonB, latB);
        const landB = Math.max(0, (hB - seaLevel) / (1 - seaLevel));
        const rB    = SPHERE_RADIUS * (1 + landB * elevationScale) + BORDER_LIFT;

        const a = lonLatToVec3(lonA, latA, rA);
        const b = lonLatToVec3(lonB, latB, rB);
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }

  for (const feature of geojson.features) {
    const g = feature.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') {
      for (const ring of g.coordinates) processRing(ring);
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates)
        for (const ring of poly) processRing(ring);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color:       0xffffff,
    transparent: true,
    opacity:     0.45,
  }));
}

// ─── Click Detection ─────────────────────────────────────────────────────────

let geojsonFeatures = [];

const raycaster = new THREE.Raycaster();
const pointer   = new THREE.Vector2();
const tooltip   = document.getElementById('tooltip');
let tooltipTimer;

function showTooltip(text) {
  tooltip.textContent = text;
  tooltip.classList.add('show');
  clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(() => tooltip.classList.remove('show'), 3000);
}

// Convert a normalized 3D point on the unit sphere back to (lon, lat).
// This is the inverse of lonLatToVec3.
function vec3ToLonLat(p) {
  const lat = Math.asin(p.y) * (180 / Math.PI);
  // atan2(z, -x) gives the azimuthal angle; subtract 180 for lon convention
  const raw = Math.atan2(p.z, -p.x) * (180 / Math.PI) - 180;
  const lon = ((raw + 540) % 360) - 180; // normalize to [-180, 180]
  return [lon, lat];
}

renderer.domElement.addEventListener('click', (e) => {
  pointer.set(
     (e.clientX / window.innerWidth)  * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(globe);
  if (!hits.length) return;

  const [lon, lat] = vec3ToLonLat(hits[0].point.clone().normalize());

  const feature = geojsonFeatures.find(
    f => f.geometry && geoContains(f, [lon, lat])
  );

  showTooltip(
    feature
      ? feature.properties.NAME
      : `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`
  );
});

// ─── UI Wiring ────────────────────────────────────────────────────────────────

document.getElementById('elevation-scale').addEventListener('input', (e) => {
  uniforms.uElevationScale.value = parseFloat(e.target.value);
  // Note: changing elevation scale does NOT update border geometry displacement.
  // To rebuild borders at the new scale, call rebuildBorders() (see below).
  // For simplicity, borders are built once at the initial elevation scale.
});

document.getElementById('hillshade-strength').addEventListener('input', (e) => {
  uniforms.uHillshadeStrength.value = parseFloat(e.target.value);
});

let borderMesh = null;
document.getElementById('borders-toggle').addEventListener('change', (e) => {
  if (borderMesh) borderMesh.visible = e.target.checked;
});

// ─── Resize ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Load & Init ──────────────────────────────────────────────────────────────

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
}

async function init() {
  const [satellite, heightmap, hillshade, geojson] = await Promise.all([
    loadTexture('textures/satellite.jpg'),
    loadTexture('textures/heightmap.png'),
    loadTexture('textures/hillshade.jpg'),
    fetch('data/countries.geojson').then(r => r.json()),
  ]);

  // Texture settings
  for (const tex of [satellite, heightmap, hillshade]) {
    tex.wrapS       = THREE.RepeatWrapping;  // clean antimeridian seam
    tex.wrapT       = THREE.ClampToEdgeWrapping;
    tex.minFilter   = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
  }

  uniforms.uSatellite.value = satellite;
  uniforms.uHeightMap.value = heightmap;
  uniforms.uHillshade.value = hillshade;

  // Build CPU heightmap sampler and bake borders
  const heightSampler = buildHeightmapSampler(heightmap);
  geojsonFeatures = geojson.features;
  borderMesh = buildBorderMesh(
    geojson,
    heightSampler,
    uniforms.uElevationScale.value,
    SEA_LEVEL
  );
  scene.add(borderMesh);

  document.getElementById('loading').style.display = 'none';
  animate();
}

// ─── Render Loop ─────────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  controls.update(); // required for damping
  renderer.render(scene, camera);
}

init().catch(err => {
  const el = document.getElementById('loading');
  el.textContent = 'Error: ' + err.message;
  el.style.color = '#f55';
  console.error(err);
});
```

---

## Key Gotchas

### Calibrating SEA_LEVEL

The `SEA_LEVEL` constant (default `0.44`) tells the vertex shader which normalized grayscale value represents sea level. If it's wrong:
- Too low → ocean floor rises, continents look flooded
- Too high → mountains disappear

Calibrate it by opening your heightmap in any image editor and using the eyedropper on a coastal pixel (e.g. the mouth of the Amazon or the coast of Florida). The sampled brightness value in 0–255 range divided by 255 is your `SEA_LEVEL`.

### PNG required for heightmap

Use PNG, not JPEG, for the heightmap. JPEG's 8×8 pixel DCT compression creates block artifacts that become visible as a regular grid of ridges and valleys in the displaced geometry. The satellite texture and hillshade can be JPEG — they only affect color, not geometry.

### Antimeridian

Countries straddling ±180° longitude (Russia, Fiji, USA via Alaska, etc.) have GeoJSON rings where the longitude coordinate jumps from ~+179 to ~-179 or vice versa between consecutive points. `splitAtAntimeridian` detects this (any jump > 180°) and starts a new line segment, leaving a tiny invisible gap at the antimeridian. This is acceptable for a prototype.

### Border lift vs. elevation

Border lines are placed at `terrain_radius + BORDER_LIFT`. The terrain radius is computed per-point by the `buildBorderMesh` CPU sampler using the same formula as the vertex shader. This means borders float correctly above mountains and coastlines. If you later add a live elevation-scale slider that rebuilds borders on change, call `buildBorderMesh` again with the new scale and swap the mesh.

### Vertex shader normal accuracy

The fragment shader uses the original, undisplaced sphere normal for diffuse lighting. For the mountain silhouette effect — the primary visual goal — this is fine: the GPU actually moves the vertices, and the silhouette change is visible regardless of the lighting normal. For interior terrain shading, the hillshade texture provides the detail. If you want interior lighting to respond to the shader-displaced geometry (normals that follow the slopes), you'd compute perturbed normals via finite differences of adjacent heightmap samples in the vertex shader — adds complexity, save for later.

### Three.js version pinning

The importmap pins `three@0.165.0`. Don't change this without testing; Three.js has breaking changes between minor versions. OrbitControls lives in `three/addons/controls/OrbitControls.js` — the path changed in r152, so older tutorials may show a different import path.

### Click lon/lat math

The inverse formula in `vec3ToLonLat` is the exact inverse of `lonLatToVec3`. The `atan2(z, -x)` accounts for the orientation of Three.js's SphereGeometry (positive Z is "west" in this coordinate convention). Verify it by clicking on a well-known landmark at first startup.

---

## Optional Extensions (in rough priority order)

1. **Live border rebuild on elevation change** — call `buildBorderMesh` whenever the elevation slider changes, swap `borderMesh` in the scene. Slightly slow (~100ms for 110m GeoJSON) but acceptable.

2. **Night lights layer** — blend in a NASA Black Marble texture on the night side. In the fragment shader: `float night = 1.0 - clamp(diff * 3.0, 0.0, 1.0);` then `color = mix(color, nightLights * 2.0, night * 0.8);`.

3. **Ocean specular** — add a Blinn-Phong specular highlight on ocean pixels (`h < uSeaLevel`). Makes the ocean shimmer differently from land.

4. **Stars background** — `THREE.Points` with ~2000 points at radius 50, `THREE.PointsMaterial({ color: 0xffffff, size: 0.05 })`.

5. **Higher-res borders** — swap `ne_110m` for `ne_50m` or `ne_10m` countries GeoJSON. The 10m file is ~5 MB and has coastline detail down to individual islands. Border building is still fast.

6. **Wire back into Geoquiz** — replace the D3 SVG globe with this renderer for `useGlobe: true` modes. Bridge: on `renderer.domElement` click, run raycaster → `vec3ToLonLat` → `geoContains` → find D3 feature → call existing `handleCountryClick(event, matchedFeature)` with the matched feature object.
