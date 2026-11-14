import asyncio
import json
import time
import urllib.request
import urllib.parse
from typing import Dict, Any, List, Optional
from config import settings
from logger import setup_logger

log = setup_logger("weather_client")


def _sync_http_get_json(url: str, params: Dict[str, str]) -> Any:
    query = urllib.parse.urlencode(params) if params else ""
    full_url = f"{url}?{query}" if query else url
    req = urllib.request.Request(
        full_url,
        headers={
            "User-Agent": "FlightForecastEngine/1.0",
            "Accept": "application/json, application/geo+json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        if resp.status == 204:
            return None
        raw = resp.read().decode("utf-8", errors="ignore").strip()
        return json.loads(raw) if raw else None


class AviationWeatherClient:
    def __init__(self):
        # Ensure base_url always has the full /api/data path
        self.base_url = "https://" + "aviationweather.gov/" + "api/data"

    async def _fetch_geojson_features(self, endpoint: str, params: Dict[str, str], label: str) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/{endpoint}"
        t0 = time.perf_counter()
        try:
            data = await asyncio.to_thread(_sync_http_get_json, url, {**params, "format": "geojson"})
            if isinstance(data, dict):
                feats = [f for f in data.get("features", []) if f.get("geometry")]
                log.info(f"{label}: {len(feats)} polygons loaded in {(time.perf_counter()-t0)*1000:.1f}ms")
                return feats
        except Exception as exc:
            log.warning(f"{label} fetch error: {exc}")
        return []

    async def get_icing_gairmets(self) -> Dict[str, Any]:
        """Fetch all active G-AIRMET polygons & contours (ICE, FZLVL, TURB, IFR)."""
        feats = await self._fetch_geojson_features("gairmet", {}, "NOAA G-AIRMETs")
        return {"type": "FeatureCollection", "features": feats}

    async def get_turbulence_gairmets(self) -> Dict[str, Any]:
        feats = await self._fetch_geojson_features("gairmet", {"hazard": "turb"}, "NOAA Turbulence G-AIRMETs")
        return {"type": "FeatureCollection", "features": feats}

    async def get_convective_sigmets(self) -> Dict[str, Any]:
        """Fetch both domestic US SIGMETs (airsigmet) and international SIGMETs (isigmet)."""
        dom_feats, intl_feats = await asyncio.gather(
            self._fetch_geojson_features("airsigmet", {}, "NOAA Domestic SIGMETs"),
            self._fetch_geojson_features("isigmet", {}, "NOAA International SIGMETs"),
        )
        combined = dom_feats + intl_feats
        log.info(f"Combined {len(combined)} active domestic + international SIGMETs")
        return {"type": "FeatureCollection", "features": combined}

    async def get_pireps(self, bbox: str = "-125,25,-65,50") -> List[Dict[str, Any]]:
        url = f"{self.base_url}/pirep"
        try:
            data = await asyncio.to_thread(_sync_http_get_json, url, {"bbox": bbox, "format": "json"})
            return data if isinstance(data, list) else []
        except Exception as exc:
            log.warning(f"NOAA PIREPs fetch warning: {exc}")
            return []

    async def get_nearest_metar_taf(self, lat: float, lon: float, icao_hint: str = "") -> Dict[str, Any]:
        clean_icao = icao_hint.strip().upper()
        if len(clean_icao) == 3 and clean_icao.isalpha():
            clean_icao = "K" + clean_icao

        bbox = f"{lat - 0.6},{lon - 0.6},{lat + 0.6},{lon + 0.6}"
        metar_params = {"ids": clean_icao, "format": "json"} if len(clean_icao) == 4 else {"bbox": bbox, "format": "json"}
        taf_params = {"ids": clean_icao, "format": "json"} if len(clean_icao) == 4 else {"bbox": bbox, "format": "json"}

        metar_obj: Optional[Dict[str, Any]] = None
        taf_obj: Optional[Dict[str, Any]] = None

        try:
            m_list = await asyncio.to_thread(_sync_http_get_json, f"{self.base_url}/metar", metar_params)
            if isinstance(m_list, list) and m_list:
                metar_obj = next(iter(m_list))
        except Exception as exc:
            log.warning(f"METAR fetch failed: {exc}")

        station_id = (metar_obj or {}).get("icaoId") or clean_icao
        if station_id and len(station_id) == 4:
            taf_params = {"ids": station_id, "format": "json"}

        try:
            t_list = await asyncio.to_thread(_sync_http_get_json, f"{self.base_url}/taf", taf_params)
            if isinstance(t_list, list) and t_list:
                taf_obj = next(iter(t_list))
        except Exception as exc:
            log.warning(f"TAF fetch failed: {exc}")

        if not metar_obj:
            return {
                "icao": clean_icao or "N/A",
                "flight_cat": "UNK",
                "temp_c": None,
                "dewp_c": None,
                "wdir": None,
                "wspd": None,
                "visib": "N/A",
                "raw_metar": "No METAR station nearby",
                "raw_taf": "No TAF available",
            }

        return {
            "icao": metar_obj.get("icaoId", clean_icao),
            "flight_cat": metar_obj.get("fltCat") or "VFR",
            "temp_c": metar_obj.get("temp"),
            "dewp_c": metar_obj.get("dewp"),
            "wdir": metar_obj.get("wdir"),
            "wspd": metar_obj.get("wspd"),
            "visib": metar_obj.get("visib", "10+"),
            "raw_metar": metar_obj.get("rawOb", ""),
            "raw_taf": (taf_obj or {}).get("rawTAF", "No TAF issued for station"),
        }
