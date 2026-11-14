import httpx
from typing import List, Dict, Any, Optional
from config import settings

class FlightRadarClient:
    def __init__(self):
        self.base_url = settings.fr24_base_url
        self.headers = {
            "Authorization": f"Bearer {settings.fr24_api_token}",
            "Accept": "application/json",
            "Accept-Version": "v1",
        }

    async def get_live_flights_by_bounds(self, bounds: str = settings.default_bounds) -> List[Dict[str, Any]]:
        """Fetch live aircraft telemetry within geographic bounds (N,S,W,E)."""
        url = f"{self.base_url}/live/flight-positions/full"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=self.headers, params={"bounds": bounds})
            resp.raise_for_status()
            return resp.json().get("data", [])

    async def get_flight_by_callsign(self, flight_number: str) -> Optional[Dict[str, Any]]:
        """Fetch live telemetry for a specific flight number or callsign."""
        url = f"{self.base_url}/live/flight-positions/full"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=self.headers, params={"flights": flight_number})
            resp.raise_for_status()
            flights = resp.json().get("data", [])
            return flights[0] if flights else None

    async def get_historical_track(self, flight_id: str) -> List[Dict[str, Any]]:
        """Fetch past waypoints of an ongoing flight to render its flown trail."""
        url = f"{self.base_url}/flight-tracks"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=self.headers, params={"flight_id": flight_id})
            if resp.status_code != 200:
                return []
            data = resp.json().get("data", [])
            return data[0].get("tracks", []) if data else []

