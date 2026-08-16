/**
 * FloatingAICloud — Global floating AI assistant for AlpasFarm.
 *
 * Mounts ONCE in AppShell. Visible on every authenticated page.
 * Reuses myai.ts (streamChat, buildFarmContext, etc.) — no duplicate logic.
 * Replaces the old lightbulb ai-fab button.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Send, Square, X, Sparkles, RefreshCw, Wifi, WifiOff, AlertCircle,
  Copy, Check, Plus, Trash2,
} from 'lucide-react';
import { useFarmData } from '../lib/useFarmData';
import {
  type MyAIConversation, type MyAIMessage, type AIStatus,
  checkAIStatus, buildFarmContext, streamChat,
  loadConversations, saveConversations, newConversation,
  MYAI_MODEL, AI_MODE,
} from '../lib/myai';

// ── Markdown-lite renderer (shared) ───────────────────────────────────────────
function renderMessage(text: string) {
  const lines = text.split('\n');
  const els: JSX.Element[] = [];
  let k = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) { els.push(<div key={k++} style={{ height: 5 }} />); continue; }
    if (t.startsWith('## ')) { els.push(<div key={k++} style={{ fontWeight: 800, fontSize: 13, marginTop: 6, marginBottom: 3, color: 'var(--text)' }}>{t.slice(3)}</div>); continue; }
    if (t.startsWith('# ')) { els.push(<div key={k++} style={{ fontWeight: 800, fontSize: 14, marginTop: 6, marginBottom: 3, color: 'var(--text)' }}>{t.slice(2)}</div>); continue; }
    if (t.startsWith('- ') || t.startsWith('• ') || t.startsWith('* ')) {
      els.push(<div key={k++} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 2, paddingLeft: 2 }}><span style={{ color: 'var(--accent-orange)', flexShrink: 0, marginTop: 2, fontSize: 10 }}>●</span><span style={{ lineHeight: 1.55, fontSize: 13 }}>{fmt(t.slice(2))}</span></div>);
      continue;
    }
    if (/^\d+\./.test(t)) {
      els.push(<div key={k++} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 2, paddingLeft: 2 }}><span style={{ color: 'var(--accent-orange)', flexShrink: 0, fontWeight: 700, fontSize: 11, minWidth: 14 }}>{t.match(/^(\d+)\./)?.[1]}.</span><span style={{ lineHeight: 1.55, fontSize: 13 }}>{fmt(t.replace(/^\d+\.\s*/, ''))}</span></div>);
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
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px 4px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, opacity: 0.65, transition: 'opacity .15s' }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.65')}
    >
      {copied ? <Check size={11} color="#FF7A18" /> : <Copy size={11} />}
    </button>
  );
}

// ── Status dot ─────────────────────────────────────────────────────────────────
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
];

// ── Main component ─────────────────────────────────────────────────────────────
export function FloatingAICloud() {
  const farmData = useFarmData();

  const [open, setOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>('checking');
  const [conversations, setConversations] = useState<MyAIConversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(() => {
    const c = loadConversations();
    return c.length > 0 ? c[0].id : null;
  });
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const statusRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  // Persist conversations
  useEffect(() => { saveConversations(conversations); }, [conversations]);

  // Auto-scroll
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages.length, streamingText, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 180);
  }, [open]);

  // Check AI status
  const checkStatus = useCallback(async () => {
    const s = await checkAIStatus();
    setAiStatus(s);
  }, []);

  useEffect(() => {
    checkStatus();
    statusRef.current = setInterval(checkStatus, 30000); // check every 30s
    return () => { if (statusRef.current) clearInterval(statusRef.current); };
  }, [checkStatus]);

  // Keyboard: Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

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

    const farmContext = !farmData.loading ? buildFarmContext(farmData, message) : '';
    const systemContent = farmContext
      ? `You are MyAI, the AI assistant for AlpasFarm — a Goat & Sheep Farm Management System.\nIMPORTANT RULES:\n- Use the REAL farm data below. NEVER invent records.\n- If data is unavailable say so clearly.\n- READ-ONLY — never claim to modify records.\n- Respond in the user's language (English or Filipino).\n- Be concise. Use bullet points.\n- For veterinary advice, remind the user to consult a licensed veterinarian.\n\nCURRENT FARM DATA:\n${farmContext}`
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of streamChat(msgs, (token) => { full += token; setStreamingText(full); }, ctrl.signal)) { /* tokens handled in callback */ }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        full = `⚠️ ${err?.message ?? 'Could not reach AI service. Please try again.'}`;
        setStreamingText(full);
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

  return (
    <>
      {/* ── Floating Launcher ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI Cloud Assistant"
          data-ai-launcher="true"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 200,
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '12px 18px',
            background: 'linear-gradient(135deg, rgba(255,59,48,0.92) 0%, rgba(255,106,42,0.92) 100%)',
            backdropFilter: 'blur(20px) saturate(200%)',
            WebkitBackdropFilter: 'blur(20px) saturate(200%)',
            border: '1px solid rgba(255,255,255,0.28)',
            borderRadius: 999,
            color: '#fff',
            fontSize: 14, fontWeight: 800, letterSpacing: '0.2px',
            cursor: 'pointer',
            boxShadow: '0 8px 32px rgba(255,59,48,0.40), 0 2px 8px rgba(0,0,0,0.25), inset 0 1.5px 1px rgba(255,255,255,0.35)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)'; e.currentTarget.style.boxShadow = '0 14px 40px rgba(255,59,48,0.50), 0 4px 12px rgba(0,0,0,0.30), inset 0 1.5px 1px rgba(255,255,255,0.40)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(255,59,48,0.40), 0 2px 8px rgba(0,0,0,0.25), inset 0 1.5px 1px rgba(255,255,255,0.35)'; }}
        >
          <Sparkles size={17} />
          <span>AI Cloud</span>
          {/* Status dot */}
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc, flexShrink: 0, boxShadow: `0 0 6px ${sc}` }} />
        </button>
      )}

      {/* ── Chat Panel ── */}
      {open && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 200,
            width: 'min(420px, calc(100vw - 20px))',
            height: 'min(600px, calc(100dvh - 48px))',
            display: 'flex', flexDirection: 'column',
            background: 'linear-gradient(160deg, rgba(14,30,48,0.92) 0%, rgba(6,18,32,0.88) 100%)',
            backdropFilter: 'blur(40px) saturate(200%)',
            WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: 22,
            boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 40px rgba(255,59,48,0.12), inset 0 1.5px 1px rgba(255,255,255,0.20)',
            overflow: 'hidden',
            animation: 'aiPanelIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
          }}
          aria-label="AI Cloud Assistant"
        >
          {/* Specular top line */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.30)', zIndex: 1, pointerEvents: 'none' }} />

          {/* ── Header ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 16px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.10)',
            flexShrink: 0,
          }}>
            {/* Sidebar toggle */}
            <button
              onClick={() => setShowSidebar((s) => !s)}
              title="Conversations"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', padding: 4, borderRadius: 6, display: 'flex', transition: 'color .15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#FF7A18')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="1.8" rx="0.9"/><rect x="1" y="7.1" width="14" height="1.8" rx="0.9"/><rect x="1" y="11.2" width="14" height="1.8" rx="0.9"/></svg>
            </button>

            {/* Brand */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 3px 10px rgba(255,59,48,0.35)' }}>
                <Sparkles size={14} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>AI Cloud</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', lineHeight: 1 }}>AlpasFarm Assistant</div>
              </div>
            </div>

            {/* Status */}
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc, flexShrink: 0, boxShadow: `0 0 6px ${sc}` }} title={aiStatus} />

            {/* New conv */}
            <button
              onClick={handleNewConv}
              title="New conversation"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer', color: 'rgba(255,255,255,0.70)', padding: '5px 7px', borderRadius: 7, display: 'flex', transition: 'all .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,106,42,0.20)'; e.currentTarget.style.color = '#FF7A18'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.70)'; }}
            >
              <Plus size={14} />
            </button>

            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close AI Cloud Assistant"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer', color: 'rgba(255,255,255,0.70)', padding: '5px 7px', borderRadius: 7, display: 'flex', transition: 'all .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.20)'; e.currentTarget.style.color = '#EF4444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.70)'; }}
            >
              <X size={14} />
            </button>
          </div>

          {/* ── Body ── */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

            {/* Conversation sidebar */}
            {showSidebar && (
              <div style={{
                width: 180, borderRight: '1px solid rgba(255,255,255,0.08)',
                overflowY: 'auto', background: 'rgba(255,255,255,0.03)',
                flexShrink: 0, padding: '8px 6px',
              }}>
                {conversations.length === 0 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: 12 }}>No conversations yet</div>
                )}
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => { setActiveId(conv.id); setShowSidebar(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 8px',
                      borderRadius: 8, marginBottom: 2, cursor: 'pointer',
                      background: conv.id === activeId ? 'rgba(255,106,42,0.18)' : 'transparent',
                      border: conv.id === activeId ? '1px solid rgba(255,106,42,0.30)' : '1px solid transparent',
                      transition: 'all .15s',
                    }}
                    onMouseEnter={(e) => { if (conv.id !== activeId) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={(e) => { if (conv.id !== activeId) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ flex: 1, fontSize: 11, color: conv.id === activeId ? '#FF7A18' : 'rgba(255,255,255,0.60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: conv.id === activeId ? 700 : 400 }}>
                      {conv.title}
                    </span>
                    <button
                      onClick={(e) => handleDeleteConv(conv.id, e)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.30)', padding: 2, borderRadius: 4, flexShrink: 0, display: 'flex', transition: 'color .15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.30)')}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Messages area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 4px', minWidth: 0 }}>

              {/* Empty state */}
              {(!activeConv || activeConv.messages.length === 0) && !streaming && (
                <div style={{ paddingTop: 16, textAlign: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#FF3B30,#FF7A18)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, boxShadow: '0 6px 20px rgba(255,59,48,0.35)' }}>
                    <Sparkles size={22} color="#fff" />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 4 }}>AI Cloud</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16, lineHeight: 1.5 }}>
                    Ask about your farm, animals, health records, vaccinations, and more.
                  </div>
                  {/* Quick prompts */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {QUICK.map((q) => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        disabled={isOffline}
                        style={{
                          padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
                          color: 'rgba(255,255,255,0.70)', cursor: isOffline ? 'not-allowed' : 'pointer',
                          transition: 'all .15s', opacity: isOffline ? 0.4 : 1,
                        }}
                        onMouseEnter={(e) => { if (!isOffline) { e.currentTarget.style.borderColor = 'rgba(255,106,42,0.5)'; e.currentTarget.style.color = '#FF7A18'; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.70)'; }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  {/* Status warning */}
                  {isOffline && (
                    <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 11, color: 'rgba(255,255,255,0.55)', display: 'flex', gap: 7, alignItems: 'flex-start', textAlign: 'left' }}>
                      <AlertCircle size={13} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>
                        {AI_MODE === 'local'
                          ? 'Ollama is not running. Start Ollama to use AI Cloud locally.'
                          : 'AI service is temporarily unavailable. Please try again later.'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Message list */}
              {activeConv?.messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 8, marginBottom: 12, alignItems: 'flex-start' }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    background: msg.role === 'user' ? 'linear-gradient(135deg,#FF3B30,#FF7A18)' : 'rgba(255,255,255,0.10)',
                    border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.18)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: msg.role === 'user' ? '#fff' : 'rgba(255,255,255,0.55)',
                    marginTop: 2,
                  }}>
                    {msg.role === 'user' ? 'U' : <Bot size={13} />}
                  </div>

                  {/* Bubble */}
                  <div style={{
                    maxWidth: '80%',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, rgba(255,59,48,0.85), rgba(255,106,42,0.85))'
                      : 'rgba(255,255,255,0.07)',
                    border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.12)' : 'none',
                    borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    padding: '9px 12px',
                    backdropFilter: 'blur(8px)',
                  }}>
                    <div style={{ color: msg.role === 'user' ? '#fff' : 'rgba(255,255,255,0.90)', lineHeight: 1.55 }}>
                      {msg.role === 'assistant' ? renderMessage(msg.content) : msg.content}
                    </div>
                    {msg.role === 'assistant' && (
                      <div style={{ marginTop: 5, display: 'flex', justifyContent: 'flex-end' }}>
                        <CopyBtn text={msg.content} />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming indicator */}
              {streaming && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                    <Bot size={13} color="rgba(255,255,255,0.55)" />
                  </div>
                  <div style={{ maxWidth: '80%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px 16px 16px 16px', padding: '9px 12px', backdropFilter: 'blur(8px)' }}>
                    {streamingText ? (
                      <div style={{ color: 'rgba(255,255,255,0.90)', lineHeight: 1.55 }}>
                        {renderMessage(streamingText)}
                        <span style={{ display: 'inline-block', width: 7, height: 13, background: '#FF7A18', marginLeft: 2, borderRadius: 2, animation: 'aiBlink 1s step-end infinite', verticalAlign: 'middle' }} />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
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

          {/* ── Input area ── */}
          <div style={{ padding: '10px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-end',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 14, padding: '8px 8px 8px 12px',
              transition: 'border-color .2s',
            }}
              onFocusCapture={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,106,42,0.50)'; }}
              onBlurCapture={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)'; }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isOffline ? 'AI unavailable…' : 'Ask about your farm…'}
                disabled={isOffline || streaming}
                rows={1}
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  resize: 'none', fontSize: 13, color: 'rgba(255,255,255,0.90)',
                  lineHeight: 1.5, maxHeight: 80, overflowY: 'auto',
                  fontFamily: 'inherit', opacity: (isOffline || streaming) ? 0.45 : 1,
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 80) + 'px';
                }}
              />
              {streaming ? (
                <button
                  onClick={() => abortRef.current?.abort()}
                  style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}
                >
                  <Square size={13} />
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || isOffline}
                  style={{
                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    background: !input.trim() || isOffline ? 'rgba(255,255,255,0.07)' : 'linear-gradient(135deg,#FF3B30,#FF7A18)',
                    border: !input.trim() || isOffline ? '1px solid rgba(255,255,255,0.12)' : 'none',
                    color: !input.trim() || isOffline ? 'rgba(255,255,255,0.30)' : '#fff',
                    cursor: !input.trim() || isOffline ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: !input.trim() || isOffline ? 'none' : '0 4px 12px rgba(255,59,48,0.35)',
                    transition: 'all .15s',
                  }}
                >
                  <Send size={14} />
                </button>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 6 }}>
              AI Cloud · {MYAI_MODEL} · Enter to send
            </div>
          </div>
        </div>
      )}

      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes aiPanelIn {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }
        @keyframes aiBlink {
          0%, 100% { opacity: 1; } 50% { opacity: 0; }
        }
        @keyframes aiBounce {
          0%, 80%, 100% { transform: translateY(0);   }
          40%            { transform: translateY(-5px); }
        }
        /* Light mode overrides */
        [data-theme="light"] .ai-cloud-panel {
          background: linear-gradient(160deg, rgba(255,255,255,0.88) 0%, rgba(248,250,252,0.85) 100%) !important;
        }
        /* Mobile: full-width near-full-height */
        @media (max-width: 480px) {
          .ai-cloud-launcher { bottom: 16px !important; right: 14px !important; }
        }
      `}</style>
    </>
  );
}
