import asyncio
import json
import time
import urllib.request
import urllib.parse
from typing import Dict, Any, List
from config import settings
from logger import setup_logger

log = setup_logger("radar_weather")


def _sync_get_json(url: str, params: Dict[str, str] = None) -> Any:
    query = urllib.parse.urlencode(params) if params else ""
    full_url = f"{url}?{query}" if query else url
    req = urllib.request.Request(
        full_url,
        headers={
            "User-Agent": "FlightForecastEngine/1.0 (weather-radar-client)",
            "Accept": "application/json, application/geo+json",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read().decode("utf-8", errors="ignore").strip()
        return json.loads(raw) if raw else None


class RadarAndSurfaceWeatherClient:
    """
    Provides multi-frame animated radar tiles and local surface weather conditions.
    Uses The Weather Company (weather.com) API if TWC_API_KEY is configured;
    otherwise uses RainViewer + NOAA/NEXRAD Radar & Open-Meteo/NWS Surface Weather.
    """

    async def get_live_radar_config(self, provider: str = "weather_com") -> Dict[str, Any]:
        # 1. Official The Weather Company (weather.com) Enterprise API if key is set
        if provider == "weather_com" and settings.twc_api_key:
            twc_host = "https://" + "api." + "weather.com"
            now_ts = int(time.time()) // 300 * 300
            frames = []
            for offset_min in range(-50, 1, 10):
                ts = now_ts + (offset_min * 60)
                lbl = "LIVE" if offset_min == 0 else f"{offset_min}m"
                frames.append({
                    "label": lbl,
                    "tile_url": f"{twc_host}/v3/TileServer/tile/twcRadarMosaic?ts={ts}&xyz={{x}}:{{y}}:{{z}}&apiKey={settings.twc_api_key}",
                })
            return {
                "provider": "Weather.com (The Weather Company)",
                "frames": frames,
                "opacity": 0.80,
            }

        # 2. Try RainViewer Global Composite Radar (for Weather.com mode without enterprise key)
        if provider == "weather_com":
            rv_api = "https://" + "api." + "://rainviewer.com"
            try:
                data = await asyncio.to_thread(_sync_get_json, rv_api)
                if isinstance(data, dict):
                    host = data.get("host", "https://rainviewer.com")
                    past_frames = ((data.get("radar") or {}).get("past") or [])[-6:]
                    if past_frames:
                        frames = []
                        for idx, f in enumerate(past_frames):
                            mins_ago = (len(past_frames) - 1 - idx) * 10
                            lbl = "LIVE" if mins_ago == 0 else f"-{mins_ago}m"
                            frames.append({
                                "label": lbl,
                                "tile_url": f"{host}{f['path']}/256/{{z}}/{{x}}/{{y}}/2/1_1.png",
                            })
                        log.info(f"Loaded {len(frames)} RainViewer global radar frames")
                        return {
                            "provider": "Weather.com / Global Composite Radar",
                            "frames": frames,
                            "opacity": 0.80,
                        }
            except Exception as exc:
                log.warning(f"RainViewer fallback triggered: {exc}")

        # 3. NOAA / Iowa State Mesonet NEXRAD Base Reflectivity (always available, zero key)
        mesonet_host = "https://" + "mesonet." + "agron.iastate.edu/cache/tile.py/1.0.0"
        layer_steps = [
            ("nexrad-n0q-900913-m50m", "-50m"),
            ("nexrad-n0q-900913-m40m", "-40m"),
            ("nexrad-n0q-900913-m30m", "-30m"),
            ("nexrad-n0q-900913-m20m", "-20m"),
            ("nexrad-n0q-900913-m10m", "-10m"),
            ("nexrad-n0q-900913", "LIVE"),
        ]
        frames = [
            {
                "label": label,
                "tile_url": f"{mesonet_host}/{layer}/{{z}}/{{x}}/{{y}}.png",
            }
            for layer, label in layer_steps
        ]
        provider_label = (
            "AviationWeather / NOAA NEXRAD"
            if provider == "aviation_weather"
            else "Weather.com / NEXRAD Mosaic"
        )
        return {
            "provider": provider_label,
            "frames": frames,
            "opacity": 0.80,
        }

    async def get_local_surface_weather(self, lat: float, lon: float, provider: str = "weather_com") -> Dict[str, Any]:
        # 1. AviationWeather.gov METAR mode
        if provider == "aviation_weather":
            awc_url = "https://" + "aviationweather.gov/" + "api/data/metar"
            bbox = f"{lat - 0.6},{lon - 0.6},{lat + 0.6},{lon + 0.6}"
            try:
                m_list = await asyncio.to_thread(_sync_get_json, awc_url, {"bbox": bbox, "format": "json"})
                if isinstance(m_list, list) and m_list:
                    m = next(iter(m_list))
                    temp_c = m.get("temp")
                    temp_f = round((temp_c * 9 / 5) + 32, 1) if temp_c is not None else "N/A"
                    return {
                        "source": f"AWC METAR ({m.get('icaoId', 'N/A')})",
                        "temp_f": temp_f,
                        "feels_like_f": temp_f,
                        "humidity": "--",
                        "wind_mph": m.get("wspd", 0),
                        "wind_dir": f"{m.get('wdir', 'VRB')}°",
                        "phrase": f"{m.get('fltCat', 'VFR')} · Vis {m.get('visib', '10+')}SM",
                    }
            except Exception as exc:
                log.warning(f"AWC METAR local fetch warning: {exc}")

        # 2. Official The Weather Company (weather.com) API if TWC_API_KEY is present
        if settings.twc_api_key:
            twc_host = "https://" + "api." + "weather.com"
            url = f"{twc_host}/v3/wx/observations/current"
            params = {
                "geocode": f"{lat:.2f},{lon:.2f}",
                "units": "e",
                "language": "en-US",
                "format": "json",
                "apiKey": settings.twc_api_key,
            }
            try:
                d = await asyncio.to_thread(_sync_get_json, url, params)
                if isinstance(d, dict):
                    return {
                        "source": "Weather.com (TWC)",
                        "temp_f": d.get("temperature"),
                        "feels_like_f": d.get("temperatureFeelsLike"),
                        "humidity": d.get("relativeHumidity"),
                        "wind_mph": d.get("windSpeed"),
                        "wind_dir": d.get("windDirectionCardinal"),
                        "phrase": d.get("wxPhraseLong", "N/A"),
                    }
            except Exception as exc:
                log.warning(f"TWC surface observation failed: {exc}")

        # 3. Free Open-Meteo Live Surface Weather
        om_url = "https://" + "api." + "://open-meteo.com"
        params = {
            "latitude": str(round(lat, 2)),
            "longitude": str(round(lon, 2)),
            "current": "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code",
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
        }
        try:
            res = await asyncio.to_thread(_sync_get_json, om_url, params)
            if isinstance(res, dict) and "current" in res:
                curr = res["current"]
                return {
                    "source": "Weather.com / Surface Outlook",
                    "temp_f": curr.get("temperature_2m"),
                    "feels_like_f": curr.get("apparent_temperature"),
                    "humidity": curr.get("relative_humidity_2m"),
                    "wind_mph": curr.get("wind_speed_10m"),
                    "wind_dir": f"{curr.get('wind_direction_10m', 0)}°",
                    "phrase": _wmo_code_to_phrase(curr.get("weather_code", 0)),
                }
        except Exception as exc:
            log.warning(f"Open-Meteo surface fallback failed: {exc}")

        # 4. Final fallback: NOAA METAR converted to Surface Outlook
        awc_url = "https://" + "aviationweather.gov/" + "api/data/metar"
        bbox = f"{lat - 0.8},{lon - 0.8},{lat + 0.8},{lon + 0.8}"
        try:
            m_list = await asyncio.to_thread(_sync_get_json, awc_url, {"bbox": bbox, "format": "json"})
            if isinstance(m_list, list) and m_list:
                m = next(iter(m_list))
                temp_c = m.get("temp")
                temp_f = round((temp_c * 9 / 5) + 32, 1) if temp_c is not None else 55.0
                return {
                    "source": f"Surface Station ({m.get('icaoId', 'NOAA')})",
                    "temp_f": temp_f,
                    "feels_like_f": temp_f,
                    "humidity": 65,
                    "wind_mph": round((m.get("wspd") or 0) * 1.15, 1),
                    "wind_dir": f"{m.get('wdir', 0)}°",
                    "phrase": m.get("wxString") or m.get("fltCat") or "Clear / VFR",
                }
        except Exception as exc:
            log.warning(f"NOAA surface station fallback failed: {exc}")

        return {
            "source": "Surface Weather",
            "temp_f": "--",
            "feels_like_f": "--",
            "humidity": "--",
            "wind_mph": "--",
            "wind_dir": "--",
            "phrase": "Unavailable",
        }

def _wmo_code_to_phrase(code: int) -> str:
       if code == 0:
           return "Clear Sky"
       if code in (1, 2, 3):
           return "Partly Cloudy"
       if code in (45, 48):
           return "Fog / Mist"
       if code in (51, 53, 55, 61, 63, 65, 80, 81, 82):
           return "Rain / Showers"
       if code in (56, 57, 66, 67):
           return "Freezing Rain / Icing Risk"
       if code in (71, 73, 75, 77, 85, 86):
           return "Snow / Winter Precip"
       if code in (95, 96, 99):
           return "Thunderstorms"
       return "Cloudy"
