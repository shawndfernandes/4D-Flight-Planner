import time
import math
import httpx
from typing import Dict, Any, Tuple
from logger import setup_logger

log = setup_logger("winds_client")

# Standard ICAO pressure levels (hPa) mapped to approximate altitudes (feet)
PRESSURE_ALT_MAP = {
    850: 5000,
    700: 10000,
    500: 18000,
    400: 24000,
    300: 30000,
    250: 34000,
    200: 39000,
}


class WindsAloftClient:
    """Fetches real-time GFS winds aloft across pressure levels via Open-Meteo (free, no key)."""

    BASE_URL = "https://open-meteo.com"

    async def get_wind_profile(self, lat: float, lon: float) -> Dict[int, Tuple[float, float]]:
        """Returns {altitude_ft: (wind_speed_kt, wind_dir_deg)} for a given coordinate."""
        params = {
            "latitude": round(lat, 2),
            "longitude": round(lon, 2),
            "current": ",".join(
                [f"wind_speed_{p}hPa,wind_direction_{p}hPa" for p in PRESSURE_ALT_MAP]
            ),
            "wind_speed_unit": "kn",
        }
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(self.BASE_URL, params=params)
                if resp.status_code != 200:
                    log.warning(f"Open-Meteo winds HTTP {resp.status_code}")
                    return {}
                curr = resp.json().get("current", {})
                profile = {}
                for hpa, alt_ft in PRESSURE_ALT_MAP.items():
                    spd = curr.get(f"wind_speed_{hpa}hPa")
                    direction = curr.get(f"wind_direction_{hpa}hPa")
                    if spd is not None and direction is not None:
                        profile[alt_ft] = (float(spd), float(direction))
                log.info(f"Winds aloft loaded ({len(profile)} levels) in {(time.perf_counter()-t0)*1000:.1f}ms")
                return profile
        except Exception as exc:
            log.warning(f"Winds aloft fetch failed: {exc}")
            return {}

    @staticmethod
    def compute_wind_component(
        track_deg: float, alt_ft: int, wind_profile: Dict[int, Tuple[float, float]]
    ) -> float:
        """Compute tailwind (+) or headwind (-) component in knots at the nearest flight level."""
        if not wind_profile:
            return 0.0
        nearest_alt = min(wind_profile.keys(), key=lambda a: abs(a - alt_ft))
        wind_spd, wind_from_deg = wind_profile[nearest_alt]
        # Wind direction is meteorological (where wind blows FROM); add 180 deg for vector TO
        wind_to_rad = math.radians((wind_from_deg + 180.0) % 360.0)
        track_rad = math.radians(track_deg)
        return round(wind_spd * math.cos(wind_to_rad - track_rad), 1)
