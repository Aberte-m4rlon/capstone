import os
from dotenv import load_dotenv

load_dotenv()

# Server Security
API_KEY = os.getenv("API_KEY", "alpasfarm_ml_secret_key_2026")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

# Model Config
MODEL_VERSION = os.getenv("MODEL_VERSION", "goat-health-v1.0")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.52"))
MAX_IMAGE_SIZE_MB = int(os.getenv("MAX_IMAGE_SIZE_MB", "10"))
