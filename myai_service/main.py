"""
MyAI Service — local AI assistant for AlpasFarm
Runs on http://localhost:8000
Requires: Ollama running on localhost:11434 with qwen2.5:1.5b pulled
"""
import os
import json
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator, Optional, List

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from system_prompt import SYSTEM_PROMPT
from farm_tools import build_context
from health_predictor import (
    get_model_status,
    predict as ml_predict,
    validate_input,
    ValidationError,
    VALID_APPETITE,
    VALID_ACTIVITY,
)

# ── Config ────────────────────────────────────────────────────────────────────
OLLAMA_URL   = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL_NAME   = os.getenv("MYAI_MODEL", "qwen2.5:1.5b")
CONTEXT_LEN  = int(os.getenv("MYAI_CONTEXT_LEN", "4096"))
TEMPERATURE  = float(os.getenv("MYAI_TEMPERATURE", "0.7"))

app = FastAPI(title="MyAI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "https://capstone-delta-jet.vercel.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory conversation store ──────────────────────────────────────────────
conversations: dict = {}  # id → {id, title, messages:[{role,content}], created_at}


# ── Pydantic models ───────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    user_id: Optional[str] = None
    stream: bool = True


class ConversationCreate(BaseModel):
    title: str = "New Conversation"


# ── Helpers ───────────────────────────────────────────────────────────────────
async def _check_ollama() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"{OLLAMA_URL}/api/tags")
            return r.status_code == 200
    except Exception:
        return False


async def _ollama_stream(messages: List[dict]) -> AsyncIterator[str]:
    """Stream tokens from Ollama /api/chat endpoint."""
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": True,
        "options": {
            "temperature": TEMPERATURE,
            "num_ctx": CONTEXT_LEN,
            "num_predict": 1024,
        },
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as resp:
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Ollama returned an error.")
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                    token = data.get("message", {}).get("content", "")
                    if token:
                        yield token
                    if data.get("done"):
                        break
                except json.JSONDecodeError:
                    continue


def _build_messages(
    conversation_id: Optional[str],
    user_message: str,
    user_id: Optional[str],
    farm_context: str,
) -> List[dict]:
    """Build the message list to send to Ollama."""
    system_content = SYSTEM_PROMPT
    if farm_context:
        system_content += f"\n\nCURRENT FARM DATA:\n{farm_context}"

    msgs: List[dict] = [{"role": "system", "content": system_content}]

    # Append conversation history (last 20 turns)
    if conversation_id and conversation_id in conversations:
        history = conversations[conversation_id]["messages"][-20:]
        msgs.extend(history)

    msgs.append({"role": "user", "content": user_message})
    return msgs


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/myai/health")
async def health():
    ollama_ok = await _check_ollama()
    models: List[str] = []
    if ollama_ok:
        try:
            async with httpx.AsyncClient(timeout=5.0) as c:
                r = await c.get(f"{OLLAMA_URL}/api/tags")
                models = [m["name"] for m in r.json().get("models", [])]
        except Exception:
            pass
    return {
        "status": "ok",
        "ollama": ollama_ok,
        "model": MODEL_NAME,
        "model_available": MODEL_NAME in models or any(MODEL_NAME in m for m in models),
        "models": models,
    }


@app.post("/api/myai/chat")
async def chat(req: ChatRequest):
    # Verify Ollama is up
    if not await _check_ollama():
        raise HTTPException(
            status_code=503,
            detail="Ollama is not running. Please start Ollama on your computer and try again."
        )

    # Retrieve farm context
    farm_context = ""
    if req.user_id:
        try:
            farm_context = build_context(req.message, req.user_id)
        except Exception as e:
            farm_context = f"[Could not load farm data: {e}]"

    # Get or create conversation
    conv_id = req.conversation_id
    if not conv_id or conv_id not in conversations:
        conv_id = str(uuid.uuid4())
        conversations[conv_id] = {
            "id": conv_id,
            "title": req.message[:60] + ("…" if len(req.message) > 60 else ""),
            "messages": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    messages = _build_messages(conv_id, req.message, req.user_id, farm_context)

    # Streaming response
    if req.stream:
        full_response: List[str] = []

        async def event_stream():
            # First chunk: send conversation ID
            yield f"data: {json.dumps({'conv_id': conv_id, 'token': ''})}\n\n"
            async for token in _ollama_stream(messages):
                full_response.append(token)
                yield f"data: {json.dumps({'token': token})}\n\n"
            # Save to conversation history
            conversations[conv_id]["messages"].append(
                {"role": "user", "content": req.message}
            )
            conversations[conv_id]["messages"].append(
                {"role": "assistant", "content": "".join(full_response)}
            )
            yield f"data: {json.dumps({'done': True, 'conv_id': conv_id})}\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"X-Conversation-Id": conv_id, "Cache-Control": "no-cache"},
        )

    # Non-streaming fallback
    tokens: List[str] = []
    async for token in _ollama_stream(messages):
        tokens.append(token)
    reply = "".join(tokens)
    conversations[conv_id]["messages"].extend([
        {"role": "user", "content": req.message},
        {"role": "assistant", "content": reply},
    ])
    return {"reply": reply, "conversation_id": conv_id}


@app.get("/api/myai/conversations")
async def list_conversations():
    return sorted(conversations.values(), key=lambda c: c["created_at"], reverse=True)


@app.post("/api/myai/conversations")
async def create_conversation(body: ConversationCreate):
    cid = str(uuid.uuid4())
    conv = {
        "id": cid,
        "title": body.title,
        "messages": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    conversations[cid] = conv
    return conv


@app.get("/api/myai/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    if conv_id not in conversations:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversations[conv_id]


@app.delete("/api/myai/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    if conv_id not in conversations:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    del conversations[conv_id]
    return {"deleted": True}


@app.get("/api/myai/models")
async def list_models():
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"{OLLAMA_URL}/api/tags")
            return r.json()
    except Exception:
        raise HTTPException(status_code=503, detail="Cannot reach Ollama.")


# ──────────────────────────────────────────────────────────────────────────────
# ML HEALTH SCREENING ROUTES
# ──────────────────────────────────────────────────────────────────────────────
# These routes use the trained Random Forest model (health_model.joblib).
#
# IMPORTANT:
#   ml_probability  = model output (synthetic-data trained, NOT veterinary)
#   veterinary_score = AlpasFarm rule engine (authoritative, separate system)
#   These must NEVER be combined or presented as equivalent.
# ──────────────────────────────────────────────────────────────────────────────


class HealthScreeningRequest(BaseModel):
    """
    Input for the ML health screening endpoint.
    All fields are required except weight_loss_kg_30d (defaults to 0.0).
    """
    animal_id:             str
    age_months:            float
    weight_kg:             float
    temperature_c:         float
    heart_rate_bpm:        float
    respiratory_rate_bpm:  float
    appetite:              str   # normal | reduced | poor
    activity_level:        str   # normal | reduced | lethargic
    cough:                 int   # 0 | 1
    nasal_discharge:       int   # 0 | 1
    diarrhea:              int   # 0 | 1
    lameness:              int   # 0 | 1
    weight_loss_kg_30d:    float = 0.0
    # Optional farm context (not used in ML, returned in response for traceability)
    veterinary_risk_score: Optional[int]  = None
    veterinary_risk_level: Optional[str]  = None


@app.get("/api/ml/health-model/status")
async def ml_model_status():
    """Check if the ML model is loaded and return metadata."""
    status = get_model_status()
    return {
        "status":       "ready" if status["model_loaded"] else "unavailable",
        "model_loaded": status["model_loaded"],
        "error":        status.get("error"),
        "version":      status["metadata"].get("version") if status.get("metadata") else None,
        "trained_at":   status["metadata"].get("trained_at") if status.get("metadata") else None,
        "dataset_type": status["metadata"].get("dataset_type") if status.get("metadata") else None,
        "disclaimer":   (
            "Trained on SYNTHETIC data. Not clinically validated. "
            "Veterinary confirmation required."
        ),
    }


@app.post("/api/ml/health-screening")
async def health_screening(req: HealthScreeningRequest):
    """
    Run ML health screening for an animal.

    Returns:
        prediction         : "healthy" | "suspected_ill"
        ml_probability_pct : 0–100  (model probability, NOT veterinary score)
        screening_status   : "needs_attention" | "no_concern"
        risk_label         : human-readable label
        top_features       : top contributing model features
        disclaimer         : mandatory veterinary disclaimer

    NOTE: ml_probability is separate from the AlpasFarm veterinary rule score.
    The veterinary rule engine remains authoritative.
    """
    status = get_model_status()
    if not status["model_loaded"]:
        raise HTTPException(
            status_code=503,
            detail=f"ML model is not available. {status.get('error', '')} Run train_health_model.py."
        )

    input_dict = req.model_dump(exclude={"animal_id", "veterinary_risk_score", "veterinary_risk_level"})

    try:
        result = ml_predict(input_dict, animal_id=req.animal_id)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # Include veterinary context in response for traceability
    result["veterinary_risk_score"] = req.veterinary_risk_score
    result["veterinary_risk_level"] = req.veterinary_risk_level
    result["note"] = (
        "ml_probability is the model output from training on a SYNTHETIC dataset. "
        "veterinary_risk_score is the AlpasFarm rule-based score and remains authoritative."
    )

    return result


@app.get("/api/ml/health-screening/model-info")
async def ml_model_info():
    """Return full model metadata including evaluation metrics."""
    status = get_model_status()
    if not status["model_loaded"] or not status.get("metadata"):
        raise HTTPException(status_code=503, detail="Model metadata not available.")
    return status["metadata"]
