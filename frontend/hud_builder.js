export function mountHudComponent(containerId = "hud") {
  const hud = document.getElementById(containerId);
  if (!hud) return;

  hud.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <h3 style="margin:0; font-size:15px;">4D Flight & Icing Pathfinder</h3>
      <div style="display:flex; gap:4px;">
        <button class="ctrl-btn" style="flex:0;" onclick="manualRefresh(this)" title="Refresh Live Data">↻ Refresh</button>
        <button class="ctrl-btn" style="flex:0;" onclick="toggleLowPowerGpu(this)" title="Switch to flat 2D weather polygons & lower render scale">Low-GPU: OFF</button>
        <button class="ctrl-btn" style="flex:0;" onclick="toggleRotation(this)">Orbit 3D: OFF</button>
      </div>
    </div>

    <div class="tab-bar">
      <button class="wx-tab active" onclick="setWeatherProvider('weather_com', this)">Weather.com Feed</button>
      <button class="wx-tab" onclick="setWeatherProvider('aviation_weather', this)">AviationWeather.gov</button>
    </div>

    <div class="row" style="margin-top:6px;">
      <input id="callsignInput" placeholder="Live Flight Callsign (or click plane)..." />
      <button class="primary" onclick="forecastFlight()">Forecast</button>
    </div>

    <div class="row">
      <input id="originInput" placeholder="Origin (KCMH)" />
      <input id="destInput" placeholder="Dest (KDEN)" />
      <input id="maxAlternatesInput" class="num-input" type="number" min="0" max="25" value="6" title="Max En-Route Diversion Airports" />
      <button class="primary route-btn" onclick="planPointToPointRoute()">Route</button>
    </div>

    <div class="layer-bar">
      <button class="layer-btn active" onclick="setMapLayer('hybrid', this)">Hybrid</button>
      <button class="layer-btn" onclick="setMapLayer('roadmap', this)">Roadmap</button>
      <button class="layer-btn" onclick="setMapLayer('satellite', this)">Satellite</button>
      <button class="layer-btn" onclick="setMapLayer('terrain', this)">Terrain</button>
      <button class="layer-btn" onclick="setMapLayer('dark', this)">Dark Radar</button>
    </div>

    <div class="radar-bar">
      <button id="radarToggleBtn" class="ctrl-btn active" onclick="toggleRadar(this)">Radar: ON</button>
      <button class="ctrl-btn" onclick="toggleRadarPlay(this)">▶ Animate</button>
      <span id="radarFrameBadge">LIVE</span>
      <button class="ctrl-btn active" onclick="toggleTraffic(this)">Traffic: ON</button>
      <button class="ctrl-btn active" onclick="toggleAirmet(this)">AIRMET: ON</button>
      <button class="ctrl-btn active" onclick="toggleSigmet(this)">SIGMET: ON</button>
    </div>

    <div class="slider-panel">
      <div class="slider-row">
        <span class="lbl">Radar Opacity</span>
        <input type="range" min="0" max="100" value="80" oninput="onOpacityChange('radar', this.value)" />
        <span id="radarAlphaLabel" class="val">80%</span>
      </div>
      <div class="slider-row">
        <span class="lbl">AIRMET Opacity</span>
        <input type="range" min="0" max="100" value="22" oninput="onOpacityChange('airmet', this.value)" />
        <span id="airmetAlphaLabel" class="val">22%</span>
      </div>
      <div class="slider-row">
        <span class="lbl">SIGMET Opacity</span>
        <input type="range" min="0" max="100" value="26" oninput="onOpacityChange('sigmet', this.value)" />
        <span id="sigmetAlphaLabel" class="val">26%</span>
      </div>
    </div>

    <div class="switch-bar">
      <span>Weather.com Radar & Surface Info</span>
      <label class="switch">
        <input type="checkbox" checked onchange="toggleTwcRadarInfo(this)" />
        <span class="slider-round"></span>
      </label>
    </div>
    <div id="twcInfoPanel"></div>

    <div class="radar-bar">
      <button class="ctrl-btn export-btn" onclick="exportRoute('gpx')">Export GPX Flight Plan</button>
      <button class="ctrl-btn export-btn" onclick="exportRoute('geojson')">Export GeoJSON</button>
    </div>

    <div id="statusText" style="font-size:11px; color:#94a3b8; margin-top:6px;">Loading live ADS-B & weather...</div>
    <div id="aircraftCard"></div>

    <div class="legend-box">
      <div class="legend-item"><span style="color:#facc15; font-size:13px;">✈</span>Live Aircraft (Heading)</div>
      <div class="legend-item"><span class="sym-dot" style="background:#ef4444; border:1.5px solid #fff;"></span>Predicted Hazard Hit</div>
      <div class="legend-item"><span class="sym-line" style="background:#f59e0b;"></span>Direct / Current Path</div>
      <div class="legend-item"><span class="sym-line" style="background:#22c55e;"></span>Safe 3D Detour Path</div>
      <div class="legend-item"><span class="sym-dash"></span>Alternate Airport Detour</div>
      <div class="legend-item"><span class="sym-box" style="background:rgba(56,189,248,0.45); border:1px solid #38bdf8;"></span>Icing Zone (G-AIRMET)</div>
      <div class="legend-item"><span class="sym-box" style="background:rgba(239,68,68,0.45); border:1px solid #ef4444;"></span>Storm Cell (SIGMET)</div>
      <div class="legend-item"><span class="sym-box" style="background:#16a34a;"></span>VFR / <span style="color:#60a5fa;">MVFR</span> / <span style="color:#f87171;">IFR</span></div>
    </div>
  `;
}
