# AlpasFarm Camera ML Inference Server

This is the dedicated Machine Learning inference server for the **AlpasFarm Camera Scanner**. It runs heavy computer-vision inference using PyTorch and FastAPI, keeping the Vercel web app lightweight and responsive.

## 🛠️ Tech Stack & Requirements
- **Language**: Python 3.10+
- **Framework**: FastAPI + Uvicorn
- **Core ML libraries**: PyTorch, Torchvision, Pillow, NumPy
- **Hardware Profile**: CPU-only optimized. Requires ~1.5 GB RAM. No GPU required (scales on CPU).

## 🚀 Setup & Local Development

1. **Create and Activate Virtual Environment**:
   ```bash
   cd ml-server
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # Linux/macOS:
   source .venv/bin/activate
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and configure your API keys:
   ```bash
   copy .env.example .env
   ```

4. **Start local dev server**:
   ```bash
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

## 🔌 API Documentation

### 1. Health Status
- **Endpoint**: `GET /health`
- **Output**:
  ```json
  {
    "status": "healthy",
    "model_loaded": true,
    "model_version": "goat-health-v1.0"
  }
  ```

### 2. Predict Image
- **Endpoint**: `POST /api/v1/predict`
- **Headers**:
  - `X-API-Key`: `alpasfarm_ml_secret_key_2026` (Must match config `API_KEY`)
- **Body** (multipart/form-data):
  - `image`: binary image file (JPEG, PNG, WebP)
- **Response**:
  ```json
  {
    "success": true,
    "species": "goat",
    "species_confidence": 0.945,
    "health_status": "potentially_abnormal",
    "health_confidence": 0.892,
    "predictions": [
      {
        "indicator": "ABNORMAL_POSTURE",
        "label": "Abnormal Posture",
        "riskPoints": 20,
        "confidence": 0.74,
        "description": "Asymmetric or unusual body position detected. May indicate discomfort or pain."
      }
    ],
    "recommendation": "Potential abnormality detected. Please perform manual checks and consult a veterinarian.",
    "model_version": "goat-health-v1.0",
    "processing_time_ms": 115,
    "quality_report": {
      "score": 90,
      "passed": true,
      "issues": [],
      "guidance": ["Image quality is good!"]
    },
    "is_reliable": true,
    "disclaimer": "This is a preliminary AI screening result. It is NOT a veterinary diagnosis."
  }
  ```
