export function vlog(...args) {
  console.log(`[4D-Engine ${new Date().toISOString().slice(11, 19)}]`, ...args);
}

// Generate crisp directional airplane icon on an HTML5 Canvas (immune to SVG data-URI errors)
function createAirplaneCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  ctx.translate(16, 16);

  ctx.fillStyle = "#facc15";
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  // Fuselage nose (pointing North / up)
  ctx.moveTo(0, -13);
  ctx.lineTo(2.5, -5);
  // Right wing
  ctx.lineTo(13, 1);
  ctx.lineTo(13, 4);
  ctx.lineTo(2.5, 1);
  // Right tailplane
  ctx.lineTo(2, 8);
  ctx.lineTo(6, 11);
  ctx.lineTo(6, 13);
  ctx.lineTo(0, 11);
  // Left tailplane
  ctx.lineTo(-6, 13);
  ctx.lineTo(-6, 11);
  ctx.lineTo(-2, 8);
  // Left wing
  ctx.lineTo(-2.5, 1);
  ctx.lineTo(-13, 4);
  ctx.lineTo(-13, 1);
  ctx.lineTo(-2.5, -5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  return canvas;
}

export const AIRPLANE_ICON_URI = createAirplaneCanvas();

export function headingToCesiumRotation(trackDeg) {
  return -Cesium.Math.toRadians(Number(trackDeg) || 0);
}

// Generate color-coded METAR weather badge on an HTML5 Canvas
export function createAirportWeatherBadgeUri(roleLabel, wx) {
  const cat = (wx?.flight_cat || "UNK").toUpperCase();
  const catColors = {
    VFR: "#16a34a",
    MVFR: "#2563eb",
    IFR: "#dc2626",
    LIFR: "#c026d3",
    UNK: "#475569"
  };
  const badgeBg = catColors[cat] || catColors.UNK;
  const icao = wx?.icao || roleLabel;
  const tempStr = wx?.temp_c !== null && wx?.temp_c !== undefined ? `${wx.temp_c}°C` : "--°C";
  const windStr = wx?.wspd !== null && wx?.wspd !== undefined ? `${wx.wdir ?? "VRB"}@${wx.wspd}kt` : "CALM";
  const line2 = `${windStr} | ${tempStr} | Vis ${wx?.visib ?? "--"}`;

  const canvas = document.createElement("canvas");
  canvas.width = 230;
  canvas.height = 60;
  const ctx = canvas.getContext("2d");

  // Card background
  ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
  ctx.strokeStyle = badgeBg;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(2, 2, 226, 46, 8);
  ctx.fill();
  ctx.stroke();

  // Flight Category pill
  ctx.fillStyle = badgeBg;
  ctx.beginPath();
  ctx.roundRect(166, 7, 54, 18, 4);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(cat, 193, 20);

  // Airport ICAO & Weather summary
  ctx.textAlign = "left";
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText(`${roleLabel}: ${icao}`, 12, 20);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "11px sans-serif";
  ctx.fillText(line2, 12, 38);

  // Bottom pointer triangle
  ctx.fillStyle = badgeBg;
  ctx.beginPath();
  ctx.moveTo(108, 48);
  ctx.lineTo(122, 48);
  ctx.lineTo(115, 58);
  ctx.closePath();
  ctx.fill();

  return canvas;
}

function buildGoogleTileUrl(layerCode) {
  const host = "https://" + "mt1." + "google.com";
  const path = "/vt/" + "lyrs=" + layerCode + "&x={x}&y={y}&z={z}";
  return host + path;
}

function buildCartoDarkUrl() {
  const host = "https://" + "basemaps." + "cartocdn.com";
  const path = "/dark_all/" + "{z}/{x}/{y}.png";
  return host + path;
}

export const MAP_LAYERS = {
  hybrid: () => new Cesium.UrlTemplateImageryProvider({
    url: buildGoogleTileUrl("y"),
    credit: "Map data © Google"
  }),
  roadmap: () => new Cesium.UrlTemplateImageryProvider({
    url: buildGoogleTileUrl("m"),
    credit: "Map data © Google"
  }),
  satellite: () => new Cesium.UrlTemplateImageryProvider({
    url: buildGoogleTileUrl("s"),
    credit: "Map data © Google"
  }),
  terrain: () => new Cesium.UrlTemplateImageryProvider({
    url: buildGoogleTileUrl("p"),
    credit: "Map data © Google"
  }),
  dark: () => new Cesium.UrlTemplateImageryProvider({
    url: buildCartoDarkUrl(),
    credit: "© OpenStreetMap © CARTO"
  })
};

export function initGlobe(containerId = "cesiumContainer") {
  const viewer = new Cesium.Viewer(containerId, {
    baseLayer: new Cesium.ImageryLayer(MAP_LAYERS.hybrid()),
    baseLayerPicker: false,
    timeline: false,
    animation: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: true,
    navigationHelpButton: false,
    shadows: false,
    skyAtmosphere: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity
  });

  // Cap active frame rate & disable costly WebGL shaders to keep GPU usage low
  viewer.targetFrameRate = 30;
  viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.0);
  viewer.scene.globe.enableLighting = false;
  viewer.scene.fog.enabled = false;
  viewer.scene.highDynamicRange = false;
  viewer.scene.postProcessStages.fxaa.enabled = false;

  // Enable full 3D tilt, rotation, and terrain pitch controls
  const ctrl = viewer.scene.screenSpaceCameraController;
  ctrl.enableRotate = true;
  ctrl.enableTilt = true;
  ctrl.enableLook = true;

  // Start with a slight 3D tilt over Worthington / Columbus, OH so altitude extrusions stand out
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-83.00, 36.50, 1900000),
    orientation: {
      heading: Cesium.Math.toRadians(0.0),
      pitch: Cesium.Math.toRadians(-68.0),
      roll: 0.0
    }
  });

  const sources = {
    traffic: new Cesium.CustomDataSource("traffic"),
    icing: new Cesium.CustomDataSource("icing"),
    storms: new Cesium.CustomDataSource("storms"),
    forecast: new Cesium.CustomDataSource("forecast")
  };

  viewer.dataSources.add(sources.traffic);
  viewer.dataSources.add(sources.icing);
  viewer.dataSources.add(sources.storms);
  viewer.dataSources.add(sources.forecast);

  return { viewer, sources };
}

// Smooth 3D Globe / Scene Orbital Rotation Toggle
let orbitListener = null;
export function toggleGlobeRotation(viewer, btnEl) {
  if (orbitListener) {
    viewer.clock.onTick.removeEventListener(orbitListener);
    orbitListener = null;
    if (btnEl) {
      btnEl.classList.remove("active");
      btnEl.innerText = "Orbit 3D: OFF";
    }
    vlog("3D orbital rotation stopped");
    return false;
  }

  orbitListener = () => {
    viewer.scene.camera.rotateRight(0.0015);
  };
  viewer.clock.onTick.addEventListener(orbitListener);
  if (btnEl) {
    btnEl.classList.add("active");
    btnEl.innerText = "Orbit 3D: ON";
  }
  vlog("3D orbital rotation started");
  return true;
}

export function switchMapLayer(viewer, layerKey, btnEl) {
  const providerFactory = MAP_LAYERS[layerKey];
  if (!providerFactory) return;

  viewer.imageryLayers.removeAll();
  radarImageryLayer = null;
  viewer.imageryLayers.addImageryProvider(providerFactory());
  applyRadarLayer(viewer);

  document.querySelectorAll(".layer-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  vlog(`Switched base map layer to: ${layerKey}`);
}

export function feetToMeters(ft) {
  return (ft || 0) * 0.3048;
}

function nextItem(iterable) {
  for (const item of iterable) return item;
  return null;
}

export function extractOuterRingDegrees(geometry) {
  if (!geometry || geometry.type !== "Polygon" || !geometry.coordinates) return null;
  const outerRing = nextItem(geometry.coordinates);
  if (!Array.isArray(outerRing)) return null;
  const flatDegrees = [];
  for (const pair of outerRing) {
    if (Array.isArray(pair) && pair.length >= 2) {
      const [lon, lat] = pair;
      if (Number.isFinite(Number(lon)) && Number.isFinite(Number(lat))) {
        flatDegrees.push(Number(lon), Number(lat));
      }
    }
  }
  return flatDegrees.length >= 6 ? flatDegrees : null;
}

export function getCameraCenterAndRadius(viewer, fallbackCenter) {
  const rect = viewer.camera.computeViewRectangle();
  if (!rect) return fallbackCenter;
  const centerLat = Cesium.Math.toDegrees((rect.north + rect.south) / 2);
  const centerLon = Cesium.Math.toDegrees((rect.east + rect.west) / 2);
  const latSpanDeg = Cesium.Math.toDegrees(rect.north - rect.south);
  const radiusNm = Math.max(80, Math.min(450, Math.round((latSpanDeg * 60) / 2)));
  return {
    lat: Number(centerLat.toFixed(3)),
    lon: Number(centerLon.toFixed(3)),
    radius_nm: radiusNm
  };
}

let radarImageryLayer = null;
let lastRadarConfig = null;
let radarEnabled = true;
let currentRadarAlpha = 0.80;

export function setRadarOpacity(viewer, alphaVal) {
  currentRadarAlpha = Math.max(0.0, Math.min(1.0, Number(alphaVal)));
  if (radarImageryLayer) {
    radarImageryLayer.alpha = currentRadarAlpha;
    viewer.scene.requestRender();
  }
}

export function applyRadarLayer(viewer, radarConfig = lastRadarConfig, enabled = radarEnabled) {
  if (radarConfig) lastRadarConfig = radarConfig;
  radarEnabled = enabled;

  if (radarImageryLayer) {
    viewer.imageryLayers.remove(radarImageryLayer, true);
    radarImageryLayer = null;
  }

  const frames = (lastRadarConfig && lastRadarConfig.frames) || [];
  const latestFrame = frames.length > 0 ? frames[frames.length - 1] : null;
  if (!radarEnabled || !latestFrame) {
    stopRadarAnimation();
    return;
  }
  renderRadarFrame(viewer, latestFrame, lastRadarConfig.opacity || 0.62);
}

let radarAnimTimer = null;
let radarFrameIndex = 0;

export function stopRadarAnimation() {
  if (radarAnimTimer) {
    clearInterval(radarAnimTimer);
    radarAnimTimer = null;
  }
}

export function renderRadarFrame(viewer, frameObj, opacity = 0.62) {
  if (!frameObj || !frameObj.tile_url) return;
  if (radarImageryLayer) {
    viewer.imageryLayers.remove(radarImageryLayer, true);
    radarImageryLayer = null;
  }
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: frameObj.tile_url,
    credit: "Weather Radar"
  });
  radarImageryLayer = viewer.imageryLayers.addImageryProvider(provider);
  radarImageryLayer.alpha = currentRadarAlpha;
  viewer.imageryLayers.raiseToTop(radarImageryLayer);

  const badge = document.getElementById("radarFrameBadge");
  if (badge) badge.innerText = frameObj.label || "LIVE";
  viewer.scene.requestRender();
}

export function toggleRadarPlayback(viewer, btnEl) {
  const frames = (lastRadarConfig && lastRadarConfig.frames) || [];
  if (radarAnimTimer) {
    stopRadarAnimation();
    // Snap back to LIVE frame
    if (frames.length > 0) {
      renderRadarFrame(viewer, frames[frames.length - 1], lastRadarConfig.opacity);
    }
    if (btnEl) {
      btnEl.classList.remove("active");
      btnEl.innerText = "▶ Animate";
    }
    return false;
  }

  if (frames.length === 0) return false;
  radarFrameIndex = 0;
  if (btnEl) {
    btnEl.classList.add("active");
    btnEl.innerText = "⏸ Pause";
  }

  radarAnimTimer = setInterval(() => {
    const frame = frames[radarFrameIndex % frames.length];
    renderRadarFrame(viewer, frame, lastRadarConfig.opacity);
    radarFrameIndex++;
  }, 900);
  return true;
}

export function parseWeatherAltFeet(props, which = "base") {
  if (!props) return which === "base" ? 5000 : 22000;
  const raw = which === "base"
    ? (props.base ?? props.bottom ?? props.fzlbase ?? 50)
    : (props.top ?? props.fzltop ?? 240);

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 600 ? raw : raw * 100;
  }
  const str = String(raw).trim().toUpperCase();
  if (str === "FZL") {
    const fzl = Number(props.fzltop ?? props.fzlbase ?? 60);
    return Number.isFinite(fzl) ? (fzl > 600 ? fzl : fzl * 100) : 6000;
  }
  if (str === "SFC" || str === "GND") return 0;
  const digits = Number(str.replace(/[^0-9.]/g, ""));
  if (Number.isFinite(digits) && digits > 0) {
    return digits > 600 ? digits : digits * 100;
  }
  return which === "base" ? 5000 : 22000;
}

export function extractPolygonRings(geometry) {
  if (!geometry || !geometry.coordinates) return [];
  const rings = [];

  if (geometry.type === "Polygon") {
    const outer = nextItem(geometry.coordinates);
    if (Array.isArray(outer)) rings.push(outer);
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) {
      const outer = nextItem(poly);
      if (Array.isArray(outer)) rings.push(outer);
    }
  }

  const parsedDegreesList = [];
  for (const ring of rings) {
    const flatDegrees = [];
    for (const pair of ring) {
      if (Array.isArray(pair) && pair.length >= 2) {
        const [lon, lat] = pair;
        if (Number.isFinite(Number(lon)) && Number.isFinite(Number(lat))) {
          flatDegrees.push(Number(lon), Number(lat));
        }
      }
    }
    if (flatDegrees.length >= 6) {
      parsedDegreesList.push(flatDegrees);
    }
  }
  return parsedDegreesList;
}
