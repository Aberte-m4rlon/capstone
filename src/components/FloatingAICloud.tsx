/**
 * FloatingAICloud — Global icon-only draggable AI assistant for AlpasFarm.
 *
 * BUTTON: Small 48×48 ✨ icon only — no text. Drag anywhere, snaps to nearest corner on release.
 * CHAT: Full panel opens near the button. Mobile = bottom sheet.
 * AI: Routes through /api/ai/chat (Vercel serverless) — keeps API key server-side.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Send, Square, X, Sparkles, RefreshCw, AlertCircle,
  Copy, Check, Plus, Trash2,
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
const CORNER_KEY   = 'alpasfarm_ai_corner';   // 'tl'|'tr'|'bl'|'br'
const DRAG_THRESH  = 8;
const BTN          = 48;    // desktop button size px
const BTN_M        = 44;    // mobile button size px
const MARGIN       = 16;    // edge margin px
const PANEL_W      = 420;
const PANEL_H      = 600;

type Corner = 'tl' | 'tr' | 'bl' | 'br';

// ── Corner helpers ─────────────────────────────────────────────────────────────

function loadCorner(): Corner {
  try {
    const v = localStorage.getItem(CORNER_KEY);
    if (v === 'tl' || v === 'tr' || v === 'bl' || v === 'br') return v;
  } catch { /* ignore */ }
  return 'br';
}
function storeCorner(c: Corner) {
  try { localStorage.setItem(CORNER_KEY, c); } catch { /* ignore */ }
}

/** CSS for the button at a given corner */
function btnCSS(corner: Corner, size: number): React.CSSProperties {
  const m = MARGIN;
  const base: React.CSSProperties = { position: 'fixed', width: size, height: size, zIndex: 200 };
  switch (corner) {
    case 'tl': return { ...base, left: m, top: m };
    case 'tr': return { ...base, right: m, top: m };
    case 'bl': return { ...base, left: m, bottom: m };
    case 'br': return { ...base, right: m, bottom: m };
  }
}

/** Snap drag release point to nearest corner */
function snapCorner(cx: number, cy: number): Corner {
  const mx = window.innerWidth / 2, my = window.innerHeight / 2;
  if (cx < mx && cy < my)  return 'tl';
  if (cx >= mx && cy < my) return 'tr';
  if (cx < mx && cy >= my) return 'bl';
  return 'br';
}

/** CSS for the chat panel near a given corner */
function panelCSS(corner: Corner): React.CSSProperties {
  const vw = window.innerWidth, vh = window.innerHeight;
  // Mobile: full-width bottom sheet
  if (vw <= 500) {
    return { position: 'fixed', bottom: 0, left: 0, right: 0, width: '100%', height: 'min(72vh, calc(100dvh - 60px))', borderRadius: '20px 20px 0 0', zIndex: 200 };
  }
  const pw = Math.min(PANEL_W, vw - 24), ph = Math.min(PANEL_H, vh - 24);
  const offset = MARGIN + BTN + 8;
  switch (corner) {
    case 'tl': return { position: 'fixed', left: MARGIN, top: offset,    width: pw, height: ph, borderRadius: 22, zIndex: 200 };
    case 'tr': return { position: 'fixed', right: MARGIN, top: offset,   width: pw, height: ph, borderRadius: 22, zIndex: 200 };
    case 'bl': return { position: 'fixed', left: MARGIN, bottom: offset, width: pw, height: ph, borderRadius: 22, zIndex: 200 };
    case 'br': return { position: 'fixed', right: MARGIN, bottom: offset,width: pw, height: ph, borderRadius: 22, zIndex: 200 };
  }
}

// ── Markdown renderer ──────────────────────────────────────────────────────────
function renderMessage(text: string): JSX.Element[] {
  const els: JSX.Element[] = [];
  let k = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) { els.push(<div key={k++} style={{ height: 5 }} />); continue; }
    if (t.startsWith('## ')) { els.push(<div key={k++} style={{ fontWeight: 800, fontSize: 13, marginTop: 6, marginBottom: 3, color: 'var(--text)' }}>{t.slice(3)}</div>); continue; }
    if (t.startsWith('# '))  { els.push(<div key={k++} style={{ fontWeight: 800, fontSize: 14, marginTop: 6, marginBottom: 3, color: 'var(--text)' }}>{t.slice(2)}</div>); continue; }
    if (t.startsWith('- ') || t.startsWith('• ') || t.startsWith('* ')) {
      els.push(<div key={k++} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 2 }}><span style={{ color: 'var(--accent-orange)', flexShrink: 0, marginTop: 2, fontSize: 10 }}>●</span><span style={{ lineHeight: 1.55, fontSize: 13 }}>{fmt(t.slice(2))}</span></div>); continue;
    }
    if (/^\d+\./.test(t)) {
      els.push(<div key={k++} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 2 }}><span style={{ color: 'var(--accent-orange)', flexShrink: 0, fontWeight: 700, fontSize: 11, minWidth: 14 }}>{t.match(/^(\d+)\./)?.[1]}.</span><span style={{ lineHeight: 1.55, fontSize: 13 }}>{fmt(t.replace(/^\d+\.\s*/, ''))}</span></div>); continue;
    }
    els.push(<div key={k++} style={{ lineHeight: 1.6, marginBottom: 1, fontSize: 13 }}>{fmt(t)}</div>);
  }
  return els;
}
function fmt(text: string): JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)}</>;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: '2px 4px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, transition: 'color .15s' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#FF7A18')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}>
      {copied ? <Check size={11} color="#FF7A18" /> : <Copy size={11} />}
    </button>
  );
}

function sc(s: AIStatus) {
  if (s === 'online' || s === 'production') return '#FF7A18';
  if (s === 'checking') return '#F59E0B';
  return '#EF4444';
}

const QUICK = ['Farm summary', 'Animals needing attention', 'Overdue vaccinations', 'Pregnant animals', 'Low inventory', 'Recent health alerts', 'Camera screening results'];

// ── Component ──────────────────────────────────────────────────────────────────
export function FloatingAICloud() {
  const farmData = useFarmData();
  const { screenings: cameraScreenings } = useAllScreenings();

  // Panel
  const [open, setOpen]           = useState(false);
  const [aiStatus, setAiStatus]   = useState<AIStatus>('checking');
  const [retryCount, setRetryCount] = useState(0);

  // Conversations
  const [conversations, setConversations] = useState<MyAIConversation[]>(() => loadConversations());
  const [activeId, setActiveId]   = useState<string | null>(() => { const c = loadConversations(); return c.length > 0 ? c[0].id : null; });
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamText] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const abortRef   = useRef<AbortController | null>(null);
  const endRef     = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // Corner snap
  const [corner, setCorner]     = useState<Corner>('br');
  const [mounted, setMounted]   = useState(false);
  const [dragging, setDragging] = useState(false);
  const [livePos, setLivePos]   = useState<{ x: number; y: number } | null>(null);
  const didMove  = useRef(false);
  const startPt  = useRef({ px: 0, py: 0 });

  // Init
  useEffect(() => { setCorner(loadCorner()); setMounted(true); }, []);
  useEffect(() => { window.addEventListener('resize', () => setCorner((c) => c)); }, []);

  // Drag
  const onPtrDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    didMove.current = false;
    startPt.current = { px: e.clientX, py: e.clientY };
  }, []);

  const onPtrMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const dx = e.clientX - startPt.current.px, dy = e.clientY - startPt.current.py;
    if (!didMove.current && (Math.abs(dx) > DRAG_THRESH || Math.abs(dy) > DRAG_THRESH)) {
      didMove.current = true; setDragging(true);
    }
    if (didMove.current) {
      const sz = window.innerWidth <= 500 ? BTN_M : BTN;
      const vw = window.innerWidth, vh = window.innerHeight;
      setLivePos({
        x: Math.max(MARGIN, Math.min(vw - sz - MARGIN, e.clientX - sz / 2)),
        y: Math.max(MARGIN, Math.min(vh - sz - MARGIN, e.clientY - sz / 2)),
      });
    }
  }, []);

  const onPtrUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    setDragging(false); setLivePos(null);
    if (!didMove.current) {
      setOpen((o) => !o);
    } else {
      const c = snapCorner(e.clientX, e.clientY);
      setCorner(c); storeCorner(c);
    }
    didMove.current = false;
  }, []);

  // AI status poll
  const checkStatus = useCallback(async () => { setAiStatus(await checkAIStatus()); }, []);
  useEffect(() => { checkStatus(); pollRef.current = setInterval(checkStatus, 30000); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, [checkStatus, retryCount]);

  // Persist convs
  useEffect(() => { saveConversations(conversations); }, [conversations]);

  // Auto-scroll
  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeConv?.messages.length, streamingText, open]);

  // Focus input
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 180); }, [open]);

  // Escape key
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) setOpen(false); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open]);

  // Conversations
  const newConv = () => { const c = newConversation(); setConversations((p) => [c, ...p]); setActiveId(c.id); setShowSidebar(false); };
  const delConv = (id: string, e: React.MouseEvent) => { e.stopPropagation(); setConversations((p) => p.filter((c) => c.id !== id)); if (activeId === id) { const r = conversations.filter((c) => c.id !== id); setActiveId(r.length > 0 ? r[0].id : null); } };

  const isOffline = aiStatus === 'offline' || aiStatus === 'no_model' || aiStatus === 'unavailable';

  // Send
  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || streaming || isOffline) return;
    setInput('');
    let conv = activeConv;
    if (!conv) { conv = newConversation(msg); setConversations((p) => [conv!, ...p]); setActiveId(conv.id); }
    else if (conv.messages.length === 0) setConversations((p) => p.map((c) => c.id === conv!.id ? { ...c, title: msg.slice(0, 48) + (msg.length > 48 ? '…' : '') } : c));
    const userMsg: MyAIMessage = { id: crypto.randomUUID(), role: 'user', content: msg, timestamp: Date.now() };
    setConversations((p) => p.map((c) => c.id === conv!.id ? { ...c, messages: [...c.messages, userMsg], updatedAt: Date.now() } : c));
    const ctx = !farmData.loading ? buildFarmContext({ ...farmData, cameraScreenings }, msg) : '';
    const sys = ctx
      ? `You are MyAI, the AI assistant for AlpasFarm.\nIMPORTANT:\n- Use the REAL farm data below. NEVER invent records.\n- READ-ONLY. Respond in the user's language. Be concise. Consult a vet for medical advice.\n\nFARM DATA:\n${ctx}`
      : `You are MyAI, the AI assistant for AlpasFarm — a Goat & Sheep Farm Management System. Be concise. Respond in the user's language.`;
    const msgs = [{ role: 'system', content: sys }, ...conv.messages.slice(-10).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: msg }];
    setStreaming(true); setStreamText('');
    const ctrl = new AbortController(); abortRef.current = ctrl;
    let full = '';
    try {
      for await (const _ of streamChat(msgs, (t) => { full += t; setStreamText(full); }, ctrl.signal)) { /* callback */ }
    } catch (err: any) {
      if (err?.name !== 'AbortError') { full = `⚠️ ${err?.message ?? 'AI temporarily unavailable. Please try again.'}`; setStreamText(full); checkStatus(); }
    }
    const aMsg: MyAIMessage = { id: crypto.randomUUID(), role: 'assistant', content: full || '(no response)', timestamp: Date.now() };
    setConversations((p) => p.map((c) => c.id === conv!.id ? { ...c, messages: [...c.messages, aMsg], updatedAt: Date.now() } : c));
    setStreamText(''); setStreaming(false); abortRef.current = null;
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  const statusCol = sc(aiStatus);
  const btnSize   = typeof window !== 'undefined' && window.innerWidth <= 500 ? BTN_M : BTN;
  const bStyle    = btnCSS(corner, btnSize);
  const pStyle    = panelCSS(corner);

  if (!mounted) return null;

  return (
    <>
      {/* ── Icon-only floating button ── */}
      {!open && (
        <button
          onPointerDown={onPtrDown}
          onPointerMove={onPtrMove}
          onPointerUp={onPtrUp}
          aria-label="Open AI Farm Assistant"
          data-ai-launcher="true"
          style={{
            ...bStyle,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(255,59,48,0.92) 0%, rgba(255,106,42,0.90) 100%)',
            backdropFilter: 'blur(20px) saturate(200%)',
            WebkitBackdropFilter: 'blur(20px) saturate(200%)',
            border: '1px solid rgba(255,255,255,0.30)',
            color: '#fff',
            cursor: dragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            touchAction: 'none',
            boxShadow: '0 6px 24px rgba(255,59,48,0.42), 0 2px 8px rgba(0,0,0,0.22), inset 0 1.5px 1px rgba(255,255,255,0.38)',
            transition: dragging ? 'none' : 'box-shadow 0.2s, transform 0.15s',
            ...(livePos ? { left: livePos.x, top: livePos.y, right: 'auto', bottom: 'auto' } : {}),
          }}
          onMouseEnter={(e) => { if (!dragging) { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 10px 32px rgba(255,59,48,0.55), 0 4px 12px rgba(0,0,0,0.28), inset 0 1.5px 1px rgba(255,255,255,0.42)'; } }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(255,59,48,0.42), 0 2px 8px rgba(0,0,0,0.22), inset 0 1.5px 1px rgba(255,255,255,0.38)'; }}
        >
          <Sparkles size={20} />
          <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: statusCol, border: '1.5px solid rgba(255,255,255,0.8)', boxShadow: `0 0 5px ${statusCol}` }} />
        </button>
      )}

      {/* ── Chat Panel ── */}
      {open && (
        <div style={{
          ...pStyle,
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(160deg, rgba(14,30,48,0.96) 0%, rgba(6,18,32,0.94) 100%)',
          backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 40px rgba(255,59,48,0.12), inset 0 1.5px 1px rgba(255,255,255,0.20)',
          overflow: 'hidden', animation: 'aiPanelIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        }} aria-label="AI Cloud Assistant">
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.30)', zIndex: 1, pointerEvents: 'none' }} />

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 14px 11px', borderBottom: '1px solid rgba(255,255,255,0.10)', flexShrink: 0 }}>
            <button onClick={() => setShowSidebar((s) => !s)} title="Conversations"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.50)', padding: 4, borderRadius: 6, display: 'flex', transition: 'color .15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#FF7A18')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.50)')}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="1.8" rx="0.9"/><rect x="1" y="7.1" width="14" height="1.8" rx="0.9"/><rect x="1" y="11.2" width="14" height="1.8" rx="0.9"/></svg>
            </button>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 3px 10px rgba(255,59,48,0.35)' }}>
                <Sparkles size={13} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>AI Cloud</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', lineHeight: 1 }}>AlpasFarm Assistant · {MYAI_MODEL}</div>
              </div>
            </div>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusCol, flexShrink: 0, boxShadow: `0 0 6px ${statusCol}` }} title={aiStatus === 'production' ? 'Connected' : aiStatus === 'checking' ? 'Checking…' : 'Unavailable'} />
            <button onClick={newConv} title="New conversation"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer', color: 'rgba(255,255,255,0.70)', padding: '4px 6px', borderRadius: 7, display: 'flex', transition: 'all .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,106,42,0.20)'; e.currentTarget.style.color = '#FF7A18'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.70)'; }}>
              <Plus size={13} />
            </button>
            <button onClick={() => setOpen(false)} aria-label="Close AI Cloud"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer', color: 'rgba(255,255,255,0.70)', padding: '4px 6px', borderRadius: 7, display: 'flex', transition: 'all .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.20)'; e.currentTarget.style.color = '#EF4444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.70)'; }}>
              <X size={13} />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {showSidebar && (
              <div style={{ width: 170, borderRight: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', background: 'rgba(255,255,255,0.03)', flexShrink: 0, padding: '8px 6px' }}>
                {conversations.length === 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', textAlign: 'center', padding: 12 }}>No conversations</div>}
                {conversations.map((conv) => (
                  <div key={conv.id} onClick={() => { setActiveId(conv.id); setShowSidebar(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 8px', borderRadius: 8, marginBottom: 2, cursor: 'pointer', background: conv.id === activeId ? 'rgba(255,106,42,0.18)' : 'transparent', border: conv.id === activeId ? '1px solid rgba(255,106,42,0.28)' : '1px solid transparent', transition: 'all .15s' }}
                    onMouseEnter={(e) => { if (conv.id !== activeId) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={(e) => { if (conv.id !== activeId) e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{ flex: 1, fontSize: 11, color: conv.id === activeId ? '#FF7A18' : 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: conv.id === activeId ? 700 : 400 }}>{conv.title}</span>
                    <button onClick={(e) => delConv(conv.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: 2, borderRadius: 4, flexShrink: 0, display: 'flex', transition: 'color .15s' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')} onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}>
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 4px', minWidth: 0 }}>
              {(!activeConv || activeConv.messages.length === 0) && !streaming && (
                <div style={{ paddingTop: 16, textAlign: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, boxShadow: '0 6px 20px rgba(255,59,48,0.35)' }}><Sparkles size={22} color="#fff" /></div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 4 }}>AI Cloud</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginBottom: 16, lineHeight: 1.5 }}>Ask about your farm, animals, health, vaccinations, and more.</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {QUICK.map((q) => (
                      <button key={q} onClick={() => send(q)} disabled={isOffline}
                        style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.65)', cursor: isOffline ? 'not-allowed' : 'pointer', opacity: isOffline ? 0.4 : 1, transition: 'all .15s' }}
                        onMouseEnter={(e) => { if (!isOffline) { e.currentTarget.style.borderColor = 'rgba(255,106,42,0.50)'; e.currentTarget.style.color = '#FF7A18'; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}>
                        {q}
                      </button>
                    ))}
                  </div>
                  {isOffline && (
                    <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 11, color: 'rgba(255,255,255,0.55)', display: 'flex', gap: 7, alignItems: 'flex-start', textAlign: 'left' }}>
                      <AlertCircle size={13} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 3 }}>
                          {aiStatus === 'offline' ? 'Ollama is not running' :
                           aiStatus === 'no_model' ? 'Ollama model not found' :
                           'AI service not configured'}
                        </div>
                        {aiStatus === 'offline' && 'Start Ollama on your computer, then click Retry.'}
                        {aiStatus === 'no_model' && `Pull the model first: ollama pull ${import.meta.env.VITE_OLLAMA_MODEL ?? 'qwen2.5:1.5b'}`}
                        {aiStatus === 'unavailable' && (
                          <span>
                            Add <code style={{ background: 'rgba(255,255,255,0.12)', padding: '1px 5px', borderRadius: 3 }}>GROQ_API_KEY</code> in{' '}
                            <strong>Vercel Dashboard → Settings → Environment Variables</strong>,
                            then redeploy.
                          </span>
                        )}
                        <button onClick={() => { setRetryCount((n) => n + 1); checkStatus(); }} style={{ display: 'block', marginTop: 7, padding: '4px 12px', borderRadius: 6, background: 'rgba(255,106,42,0.18)', border: '1px solid rgba(255,106,42,0.30)', color: '#FF7A18', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          <RefreshCw size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />Retry
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeConv?.messages.map((m) => (
                <div key={m.id} style={{ display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 7, marginBottom: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: m.role === 'user' ? 'linear-gradient(135deg,#FF3B30,#FF7A18)' : 'rgba(255,255,255,0.10)', border: m.role === 'assistant' ? '1px solid rgba(255,255,255,0.18)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: m.role === 'user' ? '#fff' : 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                    {m.role === 'user' ? 'U' : <Bot size={12} />}
                  </div>
                  <div style={{ maxWidth: '80%', background: m.role === 'user' ? 'linear-gradient(135deg,rgba(255,59,48,0.85),rgba(255,106,42,0.85))' : 'rgba(255,255,255,0.07)', border: m.role === 'assistant' ? '1px solid rgba(255,255,255,0.12)' : 'none', borderRadius: m.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px', padding: '8px 11px', backdropFilter: 'blur(8px)' }}>
                    <div style={{ color: m.role === 'user' ? '#fff' : 'rgba(255,255,255,0.90)', lineHeight: 1.55 }}>{m.role === 'assistant' ? renderMessage(m.content) : m.content}</div>
                    {m.role === 'assistant' && <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}><CopyBtn text={m.content} /></div>}
                  </div>
                </div>
              ))}

              {streaming && (
                <div style={{ display: 'flex', gap: 7, marginBottom: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><Bot size={12} color="rgba(255,255,255,0.55)" /></div>
                  <div style={{ maxWidth: '80%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px 16px 16px 16px', padding: '8px 11px', backdropFilter: 'blur(8px)' }}>
                    {streamingText ? (
                      <div style={{ color: 'rgba(255,255,255,0.90)', lineHeight: 1.55 }}>
                        {renderMessage(streamingText)}
                        <span style={{ display: 'inline-block', width: 6, height: 12, background: '#FF7A18', marginLeft: 2, borderRadius: 2, animation: 'aiBlink 1s step-end infinite', verticalAlign: 'middle' }} />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)' }}>AI Cloud is thinking</span>
                        {[0,1,2].map((i) => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#FF7A18', animation: `aiBounce 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          {/* Input */}
          <div style={{ padding: '8px 10px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14, padding: '7px 7px 7px 11px', transition: 'border-color .2s' }}
              onFocusCapture={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,106,42,0.50)'; }}
              onBlurCapture={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)'; }}>
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
                placeholder={isOffline ? 'AI unavailable…' : 'Ask about your farm…'}
                disabled={isOffline || streaming} rows={1}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none', fontSize: 13, color: 'rgba(255,255,255,0.90)', lineHeight: 1.5, maxHeight: 80, overflowY: 'auto', fontFamily: 'inherit', opacity: (isOffline || streaming) ? 0.45 : 1 }}
                onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 80) + 'px'; }} />
              {streaming
                ? <button onClick={() => abortRef.current?.abort()} style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Square size={12} /></button>
                : <button onClick={() => send()} disabled={!input.trim() || isOffline} style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: !input.trim() || isOffline ? 'rgba(255,255,255,0.07)' : 'linear-gradient(135deg,#FF3B30,#FF7A18)', border: !input.trim() || isOffline ? '1px solid rgba(255,255,255,0.12)' : 'none', color: !input.trim() || isOffline ? 'rgba(255,255,255,0.25)' : '#fff', cursor: !input.trim() || isOffline ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}><Send size={13} /></button>
              }
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.20)', textAlign: 'center', marginTop: 5 }}>Enter to send · Shift+Enter newline · Drag icon to reposition</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes aiPanelIn { from{opacity:0;transform:scale(0.92) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes aiBlink  { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes aiBounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
      `}</style>
    </>
  );
}
