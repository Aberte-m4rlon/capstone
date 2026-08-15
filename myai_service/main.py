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
