import { mountHudComponent } from "./hud_builder.js";
import {
  initGlobe,
  toggleGlobeRotation,
  switchMapLayer,
  applyRadarLayer,
  setRadarOpacity,
  toggleRadarPlayback,
  getCameraCenterAndRadius
} from "./map_layers.js";
import { renderLiveTraffic } from "./route_renderer.js";
import { renderWeatherVolumes, updateWeatherLayerOpacity } from "./weather_renderer.js";
import { renderWeatherVolumeCard } from "./hud_card_renderer.js";
import { fetchAirspaceSnapshot } from "./api_client.js";
import { runFlightForecast, runPointToPointRoute } from "./route_controller.js";
import { exportFlightPlanGeoJSON, exportFlightPlanGPX } from "./export_service.js";

mountHudComponent("hud");

const { viewer, sources } = initGlobe("cesiumContainer");

let currentCenter = { lat: 40.09, lon: -83.02, radius_nm: 250 };
let currentWxProvider = "weather_com";
let lastComputedRouteData = null;
let lastSnapshotData = null;
let cachedIcingGeoJson = { type: "FeatureCollection", features: [] };
let cachedStormsGeoJson = { type: "FeatureCollection", features: [] };
let panDebounceTimer = null;

const layerState = {
  orbiting: false,
  radar: true,
  traffic: true,
  airmet: true,
  sigmet: true,
  twcInfoOpen: true,
  lowPowerGpu: false,
  radarAlpha: 0.80,
  airmetAlpha: 0.22,
  sigmetAlpha: 0.26
};

// HUD button bindings
window.setMapLayer = (layerKey, btnEl) => {
  switchMapLayer(viewer, layerKey, btnEl);
  viewer.scene.requestRender();
};
window.toggleRotation = (btnEl) => {
  layerState.orbiting = toggleGlobeRotation(viewer, btnEl);
};
window.toggleLowPowerGpu = (btnEl) => {
  layerState.lowPowerGpu = !layerState.lowPowerGpu;
  viewer.resolutionScale = layerState.lowPowerGpu ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.0);
  viewer.targetFrameRate = layerState.lowPowerGpu ? 20 : 30;
  if (btnEl) {
    btnEl.classList.toggle("active", layerState.lowPowerGpu);
    btnEl.innerText = layerState.lowPowerGpu ? "Low-GPU: ON" : "Low-GPU: OFF";
  }
  if (lastSnapshotData) {
    renderWeatherVolumes(
      sources,
      lastSnapshotData,
      { airmet: layerState.airmetAlpha, sigmet: layerState.sigmetAlpha },
      layerState.lowPowerGpu
    );
    sources.icing.show = layerState.airmet;
    sources.storms.show = layerState.sigmet;
  }
  viewer.scene.requestRender();
};
window.toggleTraffic = (btnEl) => {
  layerState.traffic = !layerState.traffic;
  sources.traffic.show = layerState.traffic;
  if (btnEl) {
    btnEl.classList.toggle("active", layerState.traffic);
    btnEl.innerText = layerState.traffic ? "Traffic: ON" : "Traffic: OFF";
  }
  viewer.scene.requestRender();
};
window.toggleAirmet = (btnEl) => {
  layerState.airmet = !layerState.airmet;
  sources.icing.show = layerState.airmet;
  if (btnEl) {
    btnEl.classList.toggle("active", layerState.airmet);
    btnEl.innerText = layerState.airmet ? "AIRMET: ON" : "AIRMET: OFF";
  }
  viewer.scene.requestRender();
};
window.toggleSigmet = (btnEl) => {
  layerState.sigmet = !layerState.sigmet;
  sources.storms.show = layerState.sigmet;
  if (btnEl) {
    btnEl.classList.toggle("active", layerState.sigmet);
    btnEl.innerText = layerState.sigmet ? "SIGMET: ON" : "SIGMET: OFF";
  }
  viewer.scene.requestRender();
};
window.onOpacityChange = (layerName, pctStr) => {
  const pct = Math.max(0, Math.min(100, Number(pctStr)));
  const alpha = pct / 100.0;
  const labelEl = document.getElementById(`${layerName}AlphaLabel`);
  if (labelEl) labelEl.innerText = `${pct}%`;

  if (layerName === "radar") {
    layerState.radarAlpha = alpha;
    setRadarOpacity(viewer, alpha);
  } else if (layerName === "airmet") {
    layerState.airmetAlpha = alpha;
    updateWeatherLayerOpacity(sources.icing, alpha);
    viewer.scene.requestRender();
  } else if (layerName === "sigmet") {
    layerState.sigmetAlpha = alpha;
    updateWeatherLayerOpacity(sources.storms, alpha);
    viewer.scene.requestRender();
  }
};
window.toggleTwcRadarInfo = (checkboxEl) => {
  layerState.twcInfoOpen = checkboxEl ? checkboxEl.checked : !layerState.twcInfoOpen;
  const panel = document.getElementById("twcInfoPanel");
  if (panel) panel.style.display = layerState.twcInfoOpen ? "block" : "none";

  // When toggled ON, ensure radar layer is active and using Weather.com feed
  if (layerState.twcInfoOpen) {
    if (!layerState.radar) {
      layerState.radar = true;
      const rBtn = document.getElementById("radarToggleBtn");
      if (rBtn) {
        rBtn.classList.add("active");
        rBtn.innerText = "Radar: ON";
      }
      applyRadarLayer(viewer, null, true);
    }
    if (currentWxProvider !== "weather_com") {
      currentWxProvider = "weather_com";
      document.querySelectorAll(".wx-tab").forEach((b, idx) => b.classList.toggle("active", idx === 0));
      refreshAirspace();
    }
  }
  updateTwcInfoPanel(lastSnapshotData);
};
window.manualRefresh = async (btnEl) => {
  if (btnEl) btnEl.innerText = "↻ ...";
  await refreshAirspace();
  if (btnEl) btnEl.innerText = "↻ Refresh";
};
window.setWeatherProvider = (provider, btnEl) => {
  currentWxProvider = provider;
  document.querySelectorAll(".wx-tab").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  refreshAirspace();
};
window.toggleRadar = (btnEl) => {
  layerState.radar = !layerState.radar;
  applyRadarLayer(viewer, null, layerState.radar);
  if (btnEl) {
    btnEl.classList.toggle("active", layerState.radar);
    btnEl.innerText = layerState.radar ? "Radar: ON" : "Radar: OFF";
  }
  viewer.scene.requestRender();
};
window.toggleRadarPlay = (btnEl) => toggleRadarPlayback(viewer, btnEl);
window.exportRoute = (fmt) => {
  if (fmt === "gpx") exportFlightPlanGPX(lastComputedRouteData);
  else exportFlightPlanGeoJSON(lastComputedRouteData);
};
window.forecastFlight = () =>
  runFlightForecast(viewer, sources, (data) => { lastComputedRouteData = data; });
window.planPointToPointRoute = () =>
  runPointToPointRoute(viewer, sources, (data) => { lastComputedRouteData = data; });

function updateTwcInfoPanel(data) {
  const panel = document.getElementById("twcInfoPanel");
  if (!panel || !layerState.twcInfoOpen) return;

  if (!data) {
    panel.innerHTML = `<div style="color:#94a3b8;">Loading Weather.com Radar Mosaic & Surface Telemetry...</div>`;
    return;
  }

  const sw = data.surface_weather || {};
  const rc = data.radar_config || {};
  const frameCount = (rc.frames || []).length;

  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
      <strong style="color:#38bdf8;">Weather.com Radar & Outlook</strong>
      <span style="font-size:10px; padding:1px 5px; background:#0369a1; border-radius:3px; color:#fff;">${frameCount} Radar Frames</span>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:11px;">
      <div><strong>Temp:</strong> ${sw.temp_f ?? "--"}°F (Feels ${sw.feels_like_f ?? sw.temp_f ?? "--"}°F)</div>
      <div><strong>Condition:</strong> ${sw.phrase || "N/A"}</div>
      <div><strong>Surface Wind:</strong> ${sw.wind_dir || "--"} ${sw.wind_mph ?? "--"} mph</div>
      <div><strong>Humidity:</strong> ${sw.humidity ?? "--"}%</div>
    </div>
    <div style="margin-top:4px; font-size:10.5px; color:#94a3b8;">
      <strong>Mosaic Feed:</strong> ${rc.provider || "Weather.com / Global Radar"} · Center (${currentCenter.lat}°, ${currentCenter.lon}°)
    </div>
  `;
}

async function refreshAirspace() {
  const status = document.getElementById("statusText");
  status.innerText = `Refreshing ${currentWxProvider === "weather_com" ? "Weather.com" : "AviationWeather"} & ADS-B...`;
  try {
    const data = await fetchAirspaceSnapshot(
      currentCenter.lat,
      currentCenter.lon,
      currentCenter.radius_nm,
      currentWxProvider
    );
    lastSnapshotData = data;

    if (data.icing_geojson?.features?.length > 0) {
      cachedIcingGeoJson = data.icing_geojson;
    } else if (cachedIcingGeoJson.features.length > 0) {
      data.icing_geojson = cachedIcingGeoJson;
    }

    if (data.storms_geojson?.features?.length > 0) {
      cachedStormsGeoJson = data.storms_geojson;
    } else if (cachedStormsGeoJson.features.length > 0) {
      data.storms_geojson = cachedStormsGeoJson;
    }

    renderLiveTraffic(sources, data.flights);
    renderWeatherVolumes(
      sources,
      data,
      { airmet: layerState.airmetAlpha, sigmet: layerState.sigmetAlpha },
      layerState.lowPowerGpu
    );

    sources.traffic.show = layerState.traffic;
    sources.icing.show = layerState.airmet;
    sources.storms.show = layerState.sigmet;

    if (data.radar_config) {
      applyRadarLayer(viewer, data.radar_config, layerState.radar);
      setRadarOpacity(viewer, layerState.radarAlpha);
    }

    updateTwcInfoPanel(data);

    const icingCount = data.icing_geojson?.features?.length || 0;
    const stormCount = data.storms_geojson?.features?.length || 0;
    status.innerText = `ADS-B: ${data.data_source} | ${data.flights.length} aircraft | ${icingCount} AIRMETs | ${stormCount} SIGMETs`;
    viewer.scene.requestRender();
  } catch (err) {
    status.innerText = "Waiting for backend connection...";
    console.error("Airspace load error:", err);
  }
}

const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
clickHandler.setInputAction((movement) => {
  const picked = viewer.scene.pick(movement.position);
  if (!Cesium.defined(picked) || !picked.id) return;

  const entity = picked.id;
  const props = entity.properties ? entity.properties.getValue(Cesium.JulianDate.now()) : null;

  if (props && props.entityType === "WEATHER_VOLUME") {
    renderWeatherVolumeCard(props);
    return;
  }

  if (entity.billboard && entity.name) {
    document.getElementById("callsignInput").value = entity.name;
    window.forecastFlight();
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

viewer.camera.moveEnd.addEventListener(() => {
  if (layerState.orbiting) return;
  clearTimeout(panDebounceTimer);
  panDebounceTimer = setTimeout(() => {
    const nextView = getCameraCenterAndRadius(viewer, currentCenter);
    const movedDeg = Math.hypot(nextView.lat - currentCenter.lat, nextView.lon - currentCenter.lon);
    if (movedDeg > 1.2 || Math.abs(nextView.radius_nm - currentCenter.radius_nm) > 50) {
      currentCenter = nextView;
      refreshAirspace();
    }
  }, 800);
});

refreshAirspace();
setInterval(refreshAirspace, 30000);
