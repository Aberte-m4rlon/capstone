/**
 * FloatingAICloud — Global draggable AI assistant for AlpasFarm.
 *
 * FIX SUMMARY:
 *   - "Failed to fetch" was caused by _streamGroqDirect hitting api.groq.com
 *     directly from the browser, which is blocked by Groq's CORS policy.
 *   - Fixed: streamChat() now routes through /api/ai/chat (Vercel serverless)
 *     which keeps the API key server-side.
 *
 * FEATURES:
 *   - Draggable button (pointer events, touch support)
 *   - Click vs drag detection (threshold 8px)
 *   - Position clamped inside viewport
 *   - Position saved to localStorage
 *   - Chat panel opens near the button
 *   - Mobile responsive (calc(100vw - 24px), max 400px)
 *   - Enter to send, Shift+Enter for newline
 *   - Loading state (bouncing dots)
 *   - Retry on error
 *   - Status indicator (checks /api/ai/chat, not Groq directly)
 *   - Conversation history in localStorage
 *   - Quick prompts
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Send, Square, X, Sparkles, RefreshCw, AlertCircle,
  Copy, Check, Plus, Trash2, GripVertical,
} from 'lucide-react';
import { useFarmData } from '../lib/useFarmData';
import { useAllScreenings } from '../lib/useCameraScreenings';
import {
  type MyAIConversation, type MyAIMessage, type AIStatus,
  checkAIStatus, buildFarmContext, streamChat,
  loadConversations, saveConversations, newConversation,
  MYAI_MODEL, AI_MODE,
} from '../lib/myai';

// ── Constants ─────────────────────────────────────────────────────────────────
const POS_STORAGE_KEY  = 'alpasfarm_ai_cloud_position';
const DRAG_THRESHOLD   = 8;   // px movement to distinguish click from drag
const BTN_WIDTH        = 130; // approximate button width
const BTN_HEIGHT       = 46;  // approximate button height
const PANEL_W          = 420; // chat panel width on desktop
const PANEL_H          = 600; // chat panel height
const MARGIN           = 12;  // viewport edge margin

// ── Helpers ───────────────────────────────────────────────────────────────────
function clampPos(x: number, y: number): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(MARGIN, Math.min(vw - BTN_WIDTH - MARGIN, x)),
    y: Math.max(MARGIN, Math.min(vh - BTN_HEIGHT - MARGIN, y)),
  };
}

function loadSavedPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return defaultPos();
    const p = JSON.parse(raw);
    if (typeof p.x === 'number' && typeof p.y === 'number') {
      // Validate it still fits current viewport
      const clamped = clampPos(p.x, p.y);
      return clamped;
    }
  } catch { /* ignore */ }
  return defaultPos();
}

function defaultPos(): { x: number; y: number } {
  return clampPos(
    window.innerWidth  - BTN_WIDTH  - MARGIN,
    window.innerHeight - BTN_HEIGHT - MARGIN,
  );
}

function savePosToStorage(pos: { x: number; y: number }) {
  try { localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(pos)); } catch { /* quota */ }
}

/** Determine where the chat panel should open based on button position */
function panelStyle(btnX: number, btnY: number): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Mobile: always full-width at bottom
  if (vw <= 500) {
    return {
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      width: '100%',
      height: `min(72vh, calc(100dvh - 60px))`,
      borderRadius: '20px 20px 0 0',
    };
  }

  const panelW = Math.min(PANEL_W, vw - 24);
  const panelH = Math.min(PANEL_H, vh - 24);

  // Horizontal: right of midpoint → open to left
  const openLeft = btnX + BTN_WIDTH / 2 > vw / 2;
  const x = openLeft
    ? Math.max(MARGIN, btnX + BTN_WIDTH - panelW)
    : Math.min(vw - panelW - MARGIN, btnX);

  // Vertical: bottom half → open above
  const openAbove = btnY + BTN_HEIGHT / 2 > vh / 2;
  const y = openAbove
    ? Math.max(MARGIN, btnY - panelH - 10)
    : Math.min(vh - panelH - MARGIN, btnY + BTN_HEIGHT + 10);

  return {
    position: 'fixed',
    left: x,
    top: y,
    width: panelW,
    height: panelH,
    borderRadius: 22,
  };
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderMessage(text: string): JSX.Element[] {
  const els: JSX.Element[] = [];
  let k = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) { els.push(<div key={k++} style={{ height: 5 }} />); continue; }
    if (t.startsWith('## ')) {
      els.push(<div key={k++} style={{ fontWeight: 800, fontSize: 13, marginTop: 6, marginBottom: 3, color: 'var(--text)' }}>{t.slice(3)}</div>);
      continue;
    }
    if (t.startsWith('# ')) {
      els.push(<div key={k++} style={{ fontWeight: 800, fontSize: 14, marginTop: 6, marginBottom: 3, color: 'var(--text)' }}>{t.slice(2)}</div>);
      continue;
    }
    if (t.startsWith('- ') || t.startsWith('• ') || t.startsWith('* ')) {
      els.push(
        <div key={k++} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 2 }}>
          <span style={{ color: 'var(--accent-orange)', flexShrink: 0, marginTop: 2, fontSize: 10 }}>●</span>
          <span style={{ lineHeight: 1.55, fontSize: 13 }}>{fmt(t.slice(2))}</span>
        </div>,
      );
      continue;
    }
    if (/^\d+\./.test(t)) {
      els.push(
        <div key={k++} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 2 }}>
          <span style={{ color: 'var(--accent-orange)', flexShrink: 0, fontWeight: 700, fontSize: 11, minWidth: 14 }}>{t.match(/^(\d+)\./)?.[1]}.</span>
          <span style={{ lineHeight: 1.55, fontSize: 13 }}>{fmt(t.replace(/^\d+\.\s*/, ''))}</span>
        </div>,
      );
      continue;
    }
    els.push(<div key={k++} style={{ lineHeight: 1.6, marginBottom: 1, fontSize: 13 }}>{fmt(t)}</div>);
  }
  return els;
}

function fmt(text: string): JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)}</>;
}

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: '2px 4px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, transition: 'opacity .15s' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#FF7A18')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
    >
      {copied ? <Check size={11} color="#FF7A18" /> : <Copy size={11} />}
    </button>
  );
}

function statusColor(s: AIStatus) {
  if (s === 'online' || s === 'production') return '#FF7A18';
  if (s === 'checking') return '#F59E0B';
  return '#EF4444';
}

const QUICK = [
  'Farm summary',
  'Animals needing attention',
  'Overdue vaccinations',
  'Pregnant animals',
  'Low inventory',
  'Recent health alerts',
  'Camera screening results',
];

// ── Main component ─────────────────────────────────────────────────────────────
export function FloatingAICloud() {
  const farmData       = useFarmData();
  const { screenings: cameraScreenings } = useAllScreenings();

  // ── Panel open/close ────────────────────────────────────────────────────────
  const [open, setOpen]           = useState(false);
  const [aiStatus, setAiStatus]   = useState<AIStatus>('checking');
  const [retryCount, setRetryCount] = useState(0);

  // ── Conversations ───────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<MyAIConversation[]>(() => loadConversations());
  const [activeId, setActiveId]     = useState<string | null>(() => { const c = loadConversations(); return c.length > 0 ? c[0].id : null; });
  const [input, setInput]           = useState('');
  const [streaming, setStreaming]   = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const abortRef   = useRef<AbortController | null>(null);
  const endRef     = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const statusPoll = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Draggable button state ──────────────────────────────────────────────────
  const [btnPos, setBtnPos]   = useState<{ x: number; y: number }>(() => ({ x: -1, y: -1 })); // -1 = not yet measured
  const dragging  = useRef(false);
  const dragStart = useRef({ px: 0, py: 0, bx: 0, by: 0 }); // pointer start + btn start
  const moved     = useRef(false); // whether we moved enough to count as drag

  // Init position after mount (needs window dimensions)
  useEffect(() => {
    setBtnPos(loadSavedPos());
  }, []);

  // Recalculate when window resizes
  useEffect(() => {
    const onResize = () => {
      setBtnPos((p) => {
        const clamped = clampPos(p.x, p.y);
        savePosToStorage(clamped);
        return clamped;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    // Only drag on primary button / first touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    moved.current    = false;
    dragStart.current = {
      px: e.clientX,
      py: e.clientY,
      bx: btnPos.x,
      by: btnPos.y,
    };
  }, [btnPos]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    if (!moved.current && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      moved.current = true;
    }
    if (moved.current) {
      const newPos = clampPos(dragStart.current.bx + dx, dragStart.current.by + dy);
      setBtnPos(newPos);
    }
  }, []);

  const onPointerUp = useCallback((_e: React.PointerEvent<HTMLButtonElement>) => {
    dragging.current = false;
    if (!moved.current) {
      // It was a click
      setOpen((o) => !o);
    } else {
      // Drag ended — save position
      setBtnPos((p) => { savePosToStorage(p); return p; });
    }
    moved.current = false;
  }, []);

  // ── AI status polling ───────────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    const s = await checkAIStatus();
    setAiStatus(s);
  }, []);

  useEffect(() => {
    checkStatus();
    statusPoll.current = setInterval(checkStatus, 30000);
    return () => { if (statusPoll.current) clearInterval(statusPoll.current); };
  }, [checkStatus, retryCount]);

  // ── Persist conversations ───────────────────────────────────────────────────
  useEffect(() => { saveConversations(conversations); }, [conversations]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages.length, streamingText, open]);

  // ── Focus input on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 180);
  }, [open]);

  // ── Keyboard: Escape closes ─────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) setOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  // ── Conversation management ─────────────────────────────────────────────────
  const handleNewConv = () => {
    const conv = newConversation();
    setConversations((p) => [conv, ...p]);
    setActiveId(conv.id);
    setShowSidebar(false);
  };

  const handleDeleteConv = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((p) => p.filter((c) => c.id !== id));
    if (activeId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      setActiveId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const isOffline = aiStatus === 'offline' || aiStatus === 'no_model' || aiStatus === 'unavailable';

  // ── Send message ─────────────────────────────────────────────────────────────
  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || streaming || isOffline) return;
    setInput('');

    let conv = activeConv;
    if (!conv) {
      conv = newConversation(message);
      setConversations((p) => [conv!, ...p]);
      setActiveId(conv.id);
    } else if (conv.messages.length === 0) {
      setConversations((p) => p.map((c) => c.id === conv!.id ? { ...c, title: message.slice(0, 48) + (message.length > 48 ? '…' : '') } : c));
    }

    const userMsg: MyAIMessage = { id: crypto.randomUUID(), role: 'user', content: message, timestamp: Date.now() };
    setConversations((p) => p.map((c) => c.id === conv!.id ? { ...c, messages: [...c.messages, userMsg], updatedAt: Date.now() } : c));

    // Build farm context from real loaded data
    const farmContext = !farmData.loading
      ? buildFarmContext({ ...farmData, cameraScreenings }, message)
      : '';

    const systemContent = farmContext
      ? `You are MyAI, the AI assistant for AlpasFarm — a Goat & Sheep Farm Management System.\nIMPORTANT RULES:\n- Use the REAL farm data below. NEVER invent records.\n- If data is unavailable say so clearly.\n- READ-ONLY — never claim to modify records.\n- Respond in the user's language (English or Filipino).\n- Be concise. Use bullet points.\n- For veterinary advice, always remind the user to consult a licensed veterinarian.\n- Health risk scores and ML predictions come from AlpasFarm's own systems — do not recalculate.\n\nCURRENT FARM DATA:\n${farmContext}`
      : `You are MyAI, the AI assistant for AlpasFarm — a Goat & Sheep Farm Management System for Filipino farmers. Help with farm management questions. Be concise. Respond in the user's language.`;

    const msgs = [
      { role: 'system', content: systemContent },
      ...conv.messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    setStreaming(true);
    setStreamingText('');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let full = '';

    try {
      for await (const _ of streamChat(msgs, (token) => { full += token; setStreamingText(full); }, ctrl.signal)) { /* tokens in callback */ }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        full = `⚠️ ${err?.message ?? 'AI service temporarily unavailable. Please try again.'}`;
        setStreamingText(full);
        // Re-check status after error
        checkStatus();
      }
    }

    const assistantMsg: MyAIMessage = { id: crypto.randomUUID(), role: 'assistant', content: full || '(no response)', timestamp: Date.now() };
    setConversations((p) => p.map((c) => c.id === conv!.id ? { ...c, messages: [...c.messages, assistantMsg], updatedAt: Date.now() } : c));
    setStreamingText('');
    setStreaming(false);
    abortRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const sc = statusColor(aiStatus);

  // Don't render until position is calculated (avoids flicker at 0,0)
  if (btnPos.x === -1) return null;

  // Compute panel position based on current button position
  const panel = panelStyle(btnPos.x, btnPos.y);

  return (
    <>
      {/* ── Floating Launcher Button ── */}
      {!open && (
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-label="Open AI Cloud Assistant"
          style={{
            position: 'fixed',
            left: btnPos.x,
            top: btnPos.y,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 16px',
            background: 'linear-gradient(135deg, rgba(255,59,48,0.94) 0%, rgba(255,106,42,0.94) 100%)',
            backdropFilter: 'blur(20px) saturate(200%)',
            WebkitBackdropFilter: 'blur(20px) saturate(200%)',
            border: '1px solid rgba(255,255,255,0.28)',
            borderRadius: 999,
            color: '#fff',
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.2px',
            cursor: moved.current ? 'grabbing' : 'grab',
            userSelect: 'none',
            touchAction: 'none', // prevent scroll interference
            boxShadow: '0 8px 32px rgba(255,59,48,0.40), 0 2px 8px rgba(0,0,0,0.25), inset 0 1.5px 1px rgba(255,255,255,0.35)',
            transition: 'box-shadow 0.2s',
          }}
        >
          {/* Drag handle visual */}
          <GripVertical size={13} style={{ opacity: 0.55, flexShrink: 0 }} />
          <Sparkles size={15} style={{ flexShrink: 0 }} />
          <span>AI Cloud</span>
          {/* Status dot */}
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc, flexShrink: 0, boxShadow: `0 0 6px ${sc}` }} />
        </button>
      )}

      {/* ── Chat Panel ── */}
      {open && (
        <div
          style={{
            ...panel,
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(160deg, rgba(14,30,48,0.96) 0%, rgba(6,18,32,0.94) 100%)',
            backdropFilter: 'blur(40px) saturate(200%)',
            WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            border: '1px solid rgba(255,255,255,0.16)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 40px rgba(255,59,48,0.12), inset 0 1.5px 1px rgba(255,255,255,0.20)',
            overflow: 'hidden',
            animation: 'aiPanelIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
          }}
          aria-label="AI Cloud Assistant"
        >
          {/* Specular top line */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.30)', zIndex: 1, pointerEvents: 'none' }} />

          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 14px 11px', borderBottom: '1px solid rgba(255,255,255,0.10)', flexShrink: 0 }}>
            {/* Sidebar toggle */}
            <button onClick={() => setShowSidebar((s) => !s)} title="Conversations"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.50)', padding: 4, borderRadius: 6, display: 'flex', transition: 'color .15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#FF7A18')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.50)')}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="1.8" rx="0.9"/><rect x="1" y="7.1" width="14" height="1.8" rx="0.9"/><rect x="1" y="11.2" width="14" height="1.8" rx="0.9"/></svg>
            </button>

            {/* Brand */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 3px 10px rgba(255,59,48,0.35)' }}>
                <Sparkles size={13} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>AI Cloud</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', lineHeight: 1 }}>AlpasFarm Assistant · {MYAI_MODEL}</div>
              </div>
            </div>

            {/* Status dot */}
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc, flexShrink: 0, boxShadow: `0 0 6px ${sc}` }}
              title={aiStatus === 'production' ? 'Connected' : aiStatus === 'checking' ? 'Checking…' : 'Unavailable'} />

            {/* New conversation */}
            <button onClick={handleNewConv} title="New conversation"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer', color: 'rgba(255,255,255,0.70)', padding: '4px 6px', borderRadius: 7, display: 'flex', transition: 'all .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,106,42,0.20)'; e.currentTarget.style.color = '#FF7A18'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.70)'; }}>
              <Plus size={13} />
            </button>

            {/* Close */}
            <button onClick={() => setOpen(false)} aria-label="Close AI Cloud"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer', color: 'rgba(255,255,255,0.70)', padding: '4px 6px', borderRadius: 7, display: 'flex', transition: 'all .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.20)'; e.currentTarget.style.color = '#EF4444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.70)'; }}>
              <X size={13} />
            </button>
          </div>

          {/* ── Body ── */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

            {/* Sidebar */}
            {showSidebar && (
              <div style={{ width: 170, borderRight: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', background: 'rgba(255,255,255,0.03)', flexShrink: 0, padding: '8px 6px' }}>
                {conversations.length === 0 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', textAlign: 'center', padding: 12 }}>No conversations yet</div>
                )}
                {conversations.map((conv) => (
                  <div key={conv.id}
                    onClick={() => { setActiveId(conv.id); setShowSidebar(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 8px', borderRadius: 8, marginBottom: 2, cursor: 'pointer', background: conv.id === activeId ? 'rgba(255,106,42,0.18)' : 'transparent', border: conv.id === activeId ? '1px solid rgba(255,106,42,0.28)' : '1px solid transparent', transition: 'all .15s' }}
                    onMouseEnter={(e) => { if (conv.id !== activeId) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={(e) => { if (conv.id !== activeId) e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{ flex: 1, fontSize: 11, color: conv.id === activeId ? '#FF7A18' : 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: conv.id === activeId ? 700 : 400 }}>
                      {conv.title}
                    </span>
                    <button onClick={(e) => handleDeleteConv(conv.id, e)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: 2, borderRadius: 4, flexShrink: 0, display: 'flex', transition: 'color .15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}>
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 4px', minWidth: 0 }}>

              {/* Empty state */}
              {(!activeConv || activeConv.messages.length === 0) && !streaming && (
                <div style={{ paddingTop: 16, textAlign: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, boxShadow: '0 6px 20px rgba(255,59,48,0.35)' }}>
                    <Sparkles size={22} color="#fff" />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 4 }}>AI Cloud</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginBottom: 16, lineHeight: 1.5 }}>
                    Ask about your farm, animals, health, vaccinations, and more.
                  </div>

                  {/* Quick prompts */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {QUICK.map((q) => (
                      <button key={q} onClick={() => send(q)} disabled={isOffline}
                        style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.65)', cursor: isOffline ? 'not-allowed' : 'pointer', transition: 'all .15s', opacity: isOffline ? 0.4 : 1 }}
                        onMouseEnter={(e) => { if (!isOffline) { e.currentTarget.style.borderColor = 'rgba(255,106,42,0.50)'; e.currentTarget.style.color = '#FF7A18'; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}>
                        {q}
                      </button>
                    ))}
                  </div>

                  {/* Offline warning */}
                  {isOffline && (
                    <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 11, color: 'rgba(255,255,255,0.55)', display: 'flex', gap: 7, alignItems: 'flex-start', textAlign: 'left' }}>
                      <AlertCircle size={13} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 3 }}>AI service temporarily unavailable</div>
                        {AI_MODE === 'local'
                          ? 'Start Ollama locally to use AI Cloud.'
                          : 'The AI backend is unreachable. Ensure GROQ_API_KEY is set in Vercel environment variables.'}
                        <button onClick={() => { setRetryCount((n) => n + 1); checkStatus(); }}
                          style={{ display: 'block', marginTop: 7, padding: '4px 12px', borderRadius: 6, background: 'rgba(255,106,42,0.18)', border: '1px solid rgba(255,106,42,0.30)', color: '#FF7A18', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          <RefreshCw size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />Retry
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Message list */}
              {activeConv?.messages.map((msg) => (
                <div key={msg.id} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 7, marginBottom: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: msg.role === 'user' ? 'linear-gradient(135deg,#FF3B30,#FF7A18)' : 'rgba(255,255,255,0.10)', border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.18)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: msg.role === 'user' ? '#fff' : 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                    {msg.role === 'user' ? 'U' : <Bot size={12} />}
                  </div>
                  <div style={{ maxWidth: '80%', background: msg.role === 'user' ? 'linear-gradient(135deg,rgba(255,59,48,0.85),rgba(255,106,42,0.85))' : 'rgba(255,255,255,0.07)', border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.12)' : 'none', borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px', padding: '8px 11px', backdropFilter: 'blur(8px)' }}>
                    <div style={{ color: msg.role === 'user' ? '#fff' : 'rgba(255,255,255,0.90)', lineHeight: 1.55 }}>
                      {msg.role === 'assistant' ? renderMessage(msg.content) : msg.content}
                    </div>
                    {msg.role === 'assistant' && (
                      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
                        <CopyBtn text={msg.content} />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming */}
              {streaming && (
                <div style={{ display: 'flex', gap: 7, marginBottom: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                    <Bot size={12} color="rgba(255,255,255,0.55)" />
                  </div>
                  <div style={{ maxWidth: '80%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px 16px 16px 16px', padding: '8px 11px', backdropFilter: 'blur(8px)' }}>
                    {streamingText ? (
                      <div style={{ color: 'rgba(255,255,255,0.90)', lineHeight: 1.55 }}>
                        {renderMessage(streamingText)}
                        <span style={{ display: 'inline-block', width: 6, height: 12, background: '#FF7A18', marginLeft: 2, borderRadius: 2, animation: 'aiBlink 1s step-end infinite', verticalAlign: 'middle' }} />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>AI Cloud is thinking</span>
                        {[0, 1, 2].map((i) => (
                          <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#FF7A18', animation: `aiBounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          {/* ── Input ── */}
          <div style={{ padding: '8px 10px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}>
            <div
              style={{ display: 'flex', gap: 7, alignItems: 'flex-end', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14, padding: '7px 7px 7px 11px', transition: 'border-color .2s' }}
              onFocusCapture={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,106,42,0.50)'; }}
              onBlurCapture={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)'; }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isOffline ? 'AI unavailable…' : 'Ask about your farm… (Enter to send)'}
                disabled={isOffline || streaming}
                rows={1}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none', fontSize: 13, color: 'rgba(255,255,255,0.90)', lineHeight: 1.5, maxHeight: 80, overflowY: 'auto', fontFamily: 'inherit', opacity: (isOffline || streaming) ? 0.45 : 1 }}
                onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 80) + 'px'; }}
              />
              {streaming ? (
                <button onClick={() => abortRef.current?.abort()} title="Stop"
                  style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Square size={12} />
                </button>
              ) : (
                <button onClick={() => send()} disabled={!input.trim() || isOffline} title="Send (Enter)"
                  style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: !input.trim() || isOffline ? 'rgba(255,255,255,0.07)' : 'linear-gradient(135deg,#FF3B30,#FF7A18)', border: !input.trim() || isOffline ? '1px solid rgba(255,255,255,0.12)' : 'none', color: !input.trim() || isOffline ? 'rgba(255,255,255,0.25)' : '#fff', cursor: !input.trim() || isOffline ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: !input.trim() || isOffline ? 'none' : '0 3px 10px rgba(255,59,48,0.35)', transition: 'all .15s' }}>
                  <Send size={13} />
                </button>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.20)', textAlign: 'center', marginTop: 5 }}>
              Enter to send · Shift+Enter for new line · Drag button to reposition
            </div>
          </div>
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes aiPanelIn {
          from { opacity:0; transform:scale(0.92) translateY(10px); }
          to   { opacity:1; transform:scale(1)    translateY(0);    }
        }
        @keyframes aiBlink  { 0%,100%{opacity:1}  50%{opacity:0} }
        @keyframes aiBounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
      `}</style>
    </>
  );
}
