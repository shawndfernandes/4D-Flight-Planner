from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    traffic_provider: str = "community"
    fr24_api_token: str = ""
    fr24_base_url: str = "https://flightradar24.com"
    awc_base_url: str = "https://aviationweather.gov"

    # Optional: The Weather Company (weather.com) Enterprise API Key
    # Leave blank to use free live RainViewer/NEXRAD radar tiles & Open-Meteo surface weather
    twc_api_key: str = ""

    default_center_lat: float = 40.09
    default_center_lon: float = -83.02
    default_radius_nm: int = 250

    class Config:
        env_file = ".env"

settings = Settings()
