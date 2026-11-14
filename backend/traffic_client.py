import time
import httpx
from typing import List, Dict, Any, Optional
from config import settings
from logger import setup_logger

log = setup_logger("traffic_client")


class CommunityADSBClient:
    ADSB_LOL_BASE = "https://api.adsb.lol/v2"
    ADSB_FI_BASE = "https://opendata.adsb.fi/api/v2"
    OPENSKY_BASE = "https://opensky-network.org"

    @staticmethod
    def _normalize_v2_aircraft(ac: Dict[str, Any], source: str) -> Optional[Dict[str, Any]]:
        lat = ac.get("lat")
        lon = ac.get("lon")
        alt = ac.get("alt_baro")
        if lat is None or lon is None or alt == "ground":
            return None
        try:
            alt_ft = int(alt) if alt is not None else 0
        except (ValueError, TypeError):
            alt_ft = 0

        return {
            "id": ac.get("hex", ""),
            "callsign": (ac.get("flight") or "").strip(),
            "lat": float(lat),
            "lon": float(lon),
            "alt": alt_ft,
            "gspeed": float(ac.get("gs") or 0),
            "track": float(ac.get("track") or 0),
            "vspeed": float(ac.get("baro_rate") or 0),
            "type": ac.get("t", "UNKNOWN"),
            "reg": ac.get("r", ""),
            "source": source,
        }

    async def get_live_flights(
        self,
        lat: float = settings.default_center_lat,
        lon: float = settings.default_center_lon,
        radius_nm: int = settings.default_radius_nm,
    ) -> List[Dict[str, Any]]:
        endpoints = [
            ("adsb.lol", f"{self.ADSB_LOL_BASE}/lat/{lat}/lon/{lon}/dist/{radius_nm}"),
            ("adsb.fi", f"{self.ADSB_FI_BASE}/lat/{lat}/lon/{lon}/dist/{radius_nm}"),
        ]

        async with httpx.AsyncClient(timeout=12.0) as client:
            for source_name, url in endpoints:
                t0 = time.perf_counter()
                log.debug(f"Querying {source_name}: GET {url}")
                try:
                    resp = await client.get(url)
                    elapsed_ms = (time.perf_counter() - t0) * 1000
                    log.debug(f"{source_name} responded HTTP {resp.status_code} in {elapsed_ms:.1f}ms")
                    if resp.status_code == 200:
                        raw_list = resp.json().get("ac", [])
                        normalized = [
                            item
                            for ac in raw_list
                            if (item := self._normalize_v2_aircraft(ac, source_name)) is not None
                        ]
                        log.info(f"{source_name}: {len(normalized)} airborne aircraft normalized")
                        if normalized:
                            return normalized
                except Exception as exc:
                    log.warning(f"{source_name} request failed: {exc}")

            return []

    async def get_flight_by_callsign(self, callsign: str) -> Optional[Dict[str, Any]]:
        clean_cs = callsign.strip().upper()
        endpoints = [
            ("adsb.lol-cs", f"{self.ADSB_LOL_BASE}/callsign/{clean_cs}"),
            ("adsb.fi-cs", f"{self.ADSB_FI_BASE}/callsign/{clean_cs}"),
            ("adsb.lol-reg", f"{self.ADSB_LOL_BASE}/reg/{clean_cs}"),
            ("adsb.lol-hex", f"{self.ADSB_LOL_BASE}/hex/{clean_cs.lower()}"),
        ]

        async with httpx.AsyncClient(timeout=12.0) as client:
            for source_name, url in endpoints:
                log.debug(f"Lookup '{clean_cs}' on {source_name}: GET {url}")
                try:
                    resp = await client.get(url)
                    log.debug(f"{source_name} HTTP {resp.status_code} | Content-Type: {resp.headers.get('content-type')}")
                    if resp.status_code == 200:
                        ac_list = resp.json().get("ac", [])
                        log.debug(f"{source_name} returned {len(ac_list)} matches for '{clean_cs}'")
                        for ac in ac_list:
                            normalized = self._normalize_v2_aircraft(ac, source_name)
                            if normalized:
                                log.info(
                                    f"Matched '{clean_cs}' via {source_name}: "
                                    f"lat={normalized['lat']}, lon={normalized['lon']}, alt={normalized['alt']}ft, gs={normalized['gspeed']}kt"
                                )
                                return normalized
                except Exception as exc:
                    log.warning(f"{source_name} lookup error for '{clean_cs}': {exc}")

        log.warning(f"Flight '{clean_cs}' not found on any active feed")
        return None


class UnifiedTrafficClient:
    def __init__(self):
        self.community = CommunityADSBClient()

    async def get_live_flights(
        self, lat: float = settings.default_center_lat, lon: float = settings.default_center_lon
    ) -> List[Dict[str, Any]]:
        return await self.community.get_live_flights(lat=lat, lon=lon)

    async def get_flight_by_callsign(self, callsign: str) -> Optional[Dict[str, Any]]:
        return await self.community.get_flight_by_callsign(callsign)
