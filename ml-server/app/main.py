# Python 3.14 typing._eval_type Compatibility Monkey-patch (for Pydantic)
import typing
_orig_eval_type = getattr(typing, "_eval_type", None)
if _orig_eval_type:
    def _patched_eval_type(t, globalns=None, localns=None, type_params=None, *args, **kwargs):
        kwargs.pop("prefer_fwd_module", None)
        try:
            return _orig_eval_type(t, globalns, localns, type_params, *args, **kwargs)
        except TypeError:
            # Fallback if arguments differ
            return _orig_eval_type(t, globalns, localns, type_params)
    typing._eval_type = _patched_eval_type

import time
import logging
import threading
from io import BytesIO
from PIL import Image

from fastapi import FastAPI, UploadFile, File, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from app.model_loader import ModelLoader
from app.inference import run_predictions
from app import config, schemas

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ml-server")

app = FastAPI(
    title="AlpasFarm ML Inference Server",
    description="Dedicated production server for livestock camera scanner computer vision.",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Background model loading — non-blocking so Cloud Run health check passes immediately
def _load_model_background():
    try:
        loader = ModelLoader()
        loader.load_model()
        logger.info("ML model loaded successfully in background thread.")
    except Exception as e:
        logger.error(f"Background model loading failed: {e}")

@app.on_event("startup")
async def startup_event():
    logger.info("FastAPI server starting — launching background model loader...")
    thread = threading.Thread(target=_load_model_background, daemon=True)
    thread.start()
    logger.info("ML server startup completed (model loading in background).")

# API Key Validation Helper
def verify_api_key(x_api_key: str = Header(None)):
    if not x_api_key or x_api_key != config.API_KEY:
        logger.warning("Unauthorized access attempt rejected.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key authentication header."
        )

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health", response_model=schemas.HealthResponse)
async def health():
    loader = ModelLoader()
    return schemas.HealthResponse(
        status="healthy",
        model_loaded=loader.model is not None,
        model_version=config.MODEL_VERSION
    )

@app.post("/api/v1/predict", response_model=schemas.PredictResponse)
async def predict(
    image: UploadFile = File(...),
    x_api_key: str = Header(None)
):
    # Verify API key
    verify_api_key(x_api_key)

    # Validate image mime type
    if not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File uploaded is not a valid image."
        )

    # Read image data
    try:
        contents = await image.read()
        # Verify file size limit
        file_size_mb = len(contents) / (1024 * 1024)
        if file_size_mb > config.MAX_IMAGE_SIZE_MB:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Image size {file_size_mb:.2f}MB exceeds limit of {config.MAX_IMAGE_SIZE_MB}MB."
            )
            
        img = Image.open(BytesIO(contents))
    except Exception as e:
        logger.error(f"Image load failure: {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Malformed or corrupt image file."
        )

    # Run heavy model inference
    try:
        result = run_predictions(img)
        return schemas.PredictResponse(**result)
    except Exception as e:
        logger.error(f"Inference error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model inference failed: {str(e)}"
        )
