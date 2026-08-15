import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Send, Plus, Trash2, MessageSquare, Wifi, WifiOff,
  AlertCircle, Copy, Check, Square, ChevronLeft, Sparkles,
  RefreshCw, Info,
} from 'lucide-react';
import { useFarmData } from '../lib/useFarmData';
import {
  type MyAIConversation, type MyAIMessage, type OllamaStatus,
  checkOllamaStatus, buildFarmContext, streamChat,
  loadConversations, saveConversations, newConversation,
  MYAI_MODEL, OLLAMA_URL,
} from '../lib/myai';

// ── Quick prompts ─────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  'Give me a summary of my farm',
  'Which animals are overdue for vaccination?',
  'Which animals need health attention?',
  'How many animals do I have?',
  'Show me animals that may be sick',
  'What is the status of my inventory?',
  'Which animals are pregnant?',
  'Ano ang kalagayan ng aking farm?',
];

// ── Markdown-lite renderer ────────────────────────────────────────────────────
function renderMessage(text: string) {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let key = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={key++} style={{ height: 6 }} />);
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <div key={key++} style={{ fontWeight: 800, fontSize: 14, marginTop: 8, marginBottom: 4, color: 'var(--text)' }}>
          {trimmed.slice(3)}
        </div>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <div key={key++} style={{ fontWeight: 800, fontSize: 15, marginTop: 8, marginBottom: 4, color: 'var(--text)' }}>
          {trimmed.slice(2)}
        </div>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={key++} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 3, paddingLeft: 4 }}>
          <span style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1, fontSize: 12 }}>●</span>
          <span style={{ lineHeight: 1.55 }}>{formatInline(trimmed.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\./.test(trimmed)) {
      elements.push(
        <div key={key++} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 3, paddingLeft: 4 }}>
          <span style={{ color: 'var(--primary)', flexShrink: 0, fontWeight: 700, fontSize: 12, minWidth: 16 }}>
            {trimmed.match(/^(\d+)\./)?.[1]}.
          </span>
          <span style={{ lineHeight: 1.55 }}>{formatInline(trimmed.replace(/^\d+\.\s*/, ''))}</span>
        </div>
      );
    } else if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4) {
      elements.push(
        <div key={key++} style={{ fontWeight: 700, marginBottom: 2 }}>{trimmed.slice(2, -2)}</div>
      );
    } else {
      elements.push(
        <div key={key++} style={{ lineHeight: 1.6, marginBottom: 2 }}>{formatInline(trimmed)}</div>
      );
    }
  }
  return elements;
}

function formatInline(text: string): JSX.Element {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: OllamaStatus }) {
  const configs = {
    checking: { icon: <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />, label: 'Connecting…', color: 'var(--text-secondary)', bg: 'var(--bg)' },
    online:   { icon: <Wifi size={11} />, label: `MyAI Online · ${MYAI_MODEL}`, color: '#16A34A', bg: 'rgba(22,163,74,0.10)' },
    offline:  { icon: <WifiOff size={11} />, label: 'Ollama offline', color: '#EF4444', bg: 'rgba(239,68,68,0.10)' },
    no_model: { icon: <AlertCircle size={11} />, label: 'Model not found', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
  };
  const c = configs[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
      borderRadius: 20, fontSize: 11, fontWeight: 600, color: c.color,
      background: c.bg, border: `1px solid ${c.color}33`,
    }}>
      {c.icon} {c.label}
    </span>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px 5px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, opacity: 0.7, transition: 'opacity 0.15s' }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
      title="Copy message"
    >
      {copied ? <Check size={12} color="#16A34A" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function MyAIPage() {
  const farmData = useFarmData();

  // Conversations state
  const [conversations, setConversations] = useState<MyAIConversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(() => {
    const convs = loadConversations();
    return convs.length > 0 ? convs[0].id : null;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Chat state
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Status
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>('checking');
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Active conversation
  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  // Persist conversations
  useEffect(() => { saveConversations(conversations); }, [conversations]);

  // Auto-scroll
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeConv?.messages.length, streamingText]);

  // Check Ollama status
  const checkStatus = useCallback(async () => {
    const s = await checkOllamaStatus();
    setOllamaStatus(s);
  }, []);

  useEffect(() => {
    checkStatus();
    statusIntervalRef.current = setInterval(checkStatus, 8000);
    return () => { if (statusIntervalRef.current) clearInterval(statusIntervalRef.current); };
  }, [checkStatus]);

  // Create new conversation
  const handleNewConv = () => {
    const conv = newConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  // Delete conversation
  const handleDeleteConv = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      setActiveId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // Send message
  const handleSend = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || streaming) return;
    if (ollamaStatus === 'offline' || ollamaStatus === 'no_model') return;

    setInput('');

    // Ensure we have an active conversation
    let conv = activeConv;
    if (!conv) {
      conv = newConversation(message);
      setConversations((prev) => [conv!, ...prev]);
      setActiveId(conv.id);
    } else if (conv.messages.length === 0) {
      // Update title from first message
      setConversations((prev) =>
        prev.map((c) => c.id === conv!.id ? { ...c, title: message.slice(0, 50) + (message.length > 50 ? '…' : '') } : c)
      );
    }

    const userMsg: MyAIMessage = { id: crypto.randomUUID(), role: 'user', content: message, timestamp: Date.now() };

    // Add user message
    setConversations((prev) =>
      prev.map((c) => c.id === conv!.id
        ? { ...c, messages: [...c.messages, userMsg], updatedAt: Date.now() }
        : c
      )
    );

    // Build messages for Ollama
    const farmContext = !farmData.loading ? buildFarmContext(farmData, message) : '';
    const systemContent = farmContext
      ? `You are MyAI, the local AI assistant for AlpasFarm — a Goat & Sheep Farm Management System.\n\nYour purpose is to help farm managers understand and manage information within their AlpasFarm system.\n\nIMPORTANT RULES:\n- Use the REAL farm data below to answer farm-specific questions accurately.\n- NEVER invent animal records, health records, or any farm data.\n- If requested information is not in the provided data, say: "I couldn't find that information in the current AlpasFarm records."\n- You are READ-ONLY. Do not claim to add, edit, or delete records.\n- Respond in the language the user uses (English or Filipino/Tagalog).\n- Be concise and practical. Use bullet points for lists.\n- For health/veterinary advice, remind users to consult a licensed veterinarian.\n\nCURRENT FARM DATA:\n${farmContext}`
      : `You are MyAI, the local AI assistant for AlpasFarm — a Goat & Sheep Farm Management System for Filipino farmers. Help with farm management questions about goats and sheep. Be concise and practical. Respond in the language the user uses.`;

    const ollamaMessages = [
      { role: 'system', content: systemContent },
      // History (last 8 turns)
      ...conv.messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    // Stream response
    setStreaming(true);
    setStreamingText('');
    const controller = new AbortController();
    abortRef.current = controller;

    let fullText = '';
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of streamChat(ollamaMessages, (token) => {
        fullText += token;
        setStreamingText(fullText);
      }, controller.signal)) {
        // tokens are handled in the callback
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // stopped by user
      } else {
        fullText = `⚠️ Error: ${err?.message ?? 'Could not reach Ollama. Make sure Ollama is running.'}`;
        setStreamingText(fullText);
      }
    }

    // Save assistant message
    const assistantMsg: MyAIMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: fullText || '(no response)',
      timestamp: Date.now(),
    };
    setConversations((prev) =>
      prev.map((c) => c.id === conv!.id
        ? { ...c, messages: [...c.messages, assistantMsg], updatedAt: Date.now() }
        : c
      )
    );
    setStreamingText('');
    setStreaming(false);
    abortRef.current = null;
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isOffline = ollamaStatus === 'offline' || ollamaStatus === 'no_model';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', gap: 0 }}>

      {/* ── Sidebar overlay (mobile) ── */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside style={{
        width: 260,
        background: 'var(--card)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'relative' as const,
        zIndex: sidebarOpen ? 101 : 1,
        transform: sidebarOpen ? 'translateX(0)' : undefined,
        transition: 'transform 0.2s',
      }} className="myai-sidebar">
        {/* Sidebar header */}
        <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
              <Bot size={16} color="#FF7A18" /> Conversations
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleNewConv}
              style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Plus size={13} /> New
            </button>
          </div>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
          {conversations.length === 0 && (
            <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
              No conversations yet.<br />Start chatting with MyAI!
            </div>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => { setActiveId(conv.id); setSidebarOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px',
                borderRadius: 9, marginBottom: 2, cursor: 'pointer',
                background: conv.id === activeId ? 'rgba(255,106,42,0.12)' : 'transparent',
                border: conv.id === activeId ? '1px solid rgba(255,106,42,0.25)' : '1px solid transparent',
                transition: 'all 0.15s',
                position: 'relative' as const,
              }}
              onMouseEnter={(e) => { if (conv.id !== activeId) e.currentTarget.style.background = 'var(--bg)'; }}
              onMouseLeave={(e) => { if (conv.id !== activeId) e.currentTarget.style.background = 'transparent'; }}
            >
              <MessageSquare size={13} color={conv.id === activeId ? '#FF7A18' : 'var(--text-secondary)'} style={{ flexShrink: 0 }} />
              <span style={{
                flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: conv.id === activeId ? 'var(--text)' : 'var(--text-secondary)',
                fontWeight: conv.id === activeId ? 700 : 400,
              }}>
                {conv.title}
              </span>
              <button
                onClick={(e) => handleDeleteConv(conv.id, e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 2, borderRadius: 4, opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
                className="conv-del-btn"
                title="Delete conversation"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main chat area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Chat header */}
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--card)', flexShrink: 0, flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Mobile sidebar toggle */}
            <button
              className="btn btn-ghost btn-sm myai-sidebar-toggle"
              onClick={() => setSidebarOpen(true)}
              style={{ display: 'none', padding: 6 }}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #FF3B30, #FF7A18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(255,59,48,0.3)',
            }}>
              <Bot size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', lineHeight: 1.2 }}>MyAI</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>AlpasFarm Local AI Assistant</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatusBadge status={ollamaStatus} />
            <button className="btn btn-ghost btn-sm" onClick={checkStatus} title="Refresh status" style={{ padding: 6 }}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Offline warning */}
        {isOffline && (
          <div style={{
            margin: '12px 16px 0', padding: '12px 16px', borderRadius: 12,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <AlertCircle size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#EF4444' }}>
                {ollamaStatus === 'offline' ? 'Ollama is not running' : 'Model not found'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                {ollamaStatus === 'offline'
                  ? <>Run <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>ollama serve</code> in a terminal to start Ollama, then refresh.</>
                  : <>Run <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>ollama pull qwen2.5:1.5b</code> in a terminal to download the model.</>
                }
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>

          {/* Empty state */}
          {(!activeConv || activeConv.messages.length === 0) && !streaming && (
            <div style={{ textAlign: 'center', paddingTop: 32 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 18,
                background: 'linear-gradient(135deg, #FF3B30, #FF7A18)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(255,59,48,0.3)', marginBottom: 16,
              }}>
                <Sparkles size={28} color="#fff" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
                Welcome to MyAI
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
                Your local AI assistant for AlpasFarm. Ask anything about your animals, health records, vaccinations, inventory, and more.
              </p>

              {/* Quick prompts */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 600, margin: '0 auto' }}>
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleSend(p)}
                    disabled={isOffline || streaming}
                    style={{
                      padding: '8px 14px', borderRadius: 20,
                      background: 'var(--card)', border: '1px solid var(--border)',
                      color: 'var(--text)', fontSize: 12, cursor: isOffline ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s', fontWeight: 500,
                      opacity: isOffline ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => { if (!isOffline) { e.currentTarget.style.borderColor = '#FF7A18'; e.currentTarget.style.color = '#FF7A18'; }}}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)'; }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Info note */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 28,
                padding: '10px 14px', borderRadius: 10, background: 'rgba(255,106,42,0.07)',
                border: '1px solid rgba(255,106,42,0.18)', maxWidth: 480, margin: '28px auto 0', textAlign: 'left',
              }}>
                <Info size={14} color="#FF7A18" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  MyAI runs <strong>100% locally</strong> using Ollama + {MYAI_MODEL}. Your farm data and conversations never leave your computer. First response may take 10–20 seconds while the model loads.
                </div>
              </div>
            </div>
          )}

          {/* Message list */}
          {activeConv?.messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                gap: 10, marginBottom: 16, alignItems: 'flex-start',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, #FF3B30, #FF7A18)'
                  : 'var(--card)',
                border: msg.role === 'assistant' ? '1.5px solid var(--border)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color: msg.role === 'user' ? '#fff' : 'var(--text-secondary)',
                marginTop: 2,
              }}>
                {msg.role === 'user' ? 'U' : <Bot size={15} />}
              </div>

              {/* Bubble */}
              <div style={{
                maxWidth: '75%',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, #FF3B30, #FF7A18)'
                  : 'var(--card)',
                border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                borderRadius: msg.role === 'user' ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
                padding: '10px 14px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}>
                <div style={{
                  fontSize: 13,
                  color: msg.role === 'user' ? '#fff' : 'var(--text)',
                  lineHeight: 1.6,
                }}>
                  {msg.role === 'assistant'
                    ? renderMessage(msg.content)
                    : msg.content
                  }
                </div>
                {msg.role === 'assistant' && (
                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                    <CopyButton text={msg.content} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {streaming && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-start' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'var(--card)', border: '1.5px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-secondary)', marginTop: 2,
              }}>
                <Bot size={15} />
              </div>
              <div style={{
                maxWidth: '75%', background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '4px 18px 18px 18px',
                padding: '10px 14px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}>
                {streamingText ? (
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                    {renderMessage(streamingText)}
                    <span style={{ display: 'inline-block', width: 8, height: 14, background: '#FF7A18', marginLeft: 2, borderRadius: 2, animation: 'blink 1s step-end infinite', verticalAlign: 'middle' }} />
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[0, 1, 2].map((i) => (
                        <div key={i} style={{
                          width: 6, height: 6, borderRadius: '50%', background: '#FF7A18',
                          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }} />
                      ))}
                    </div>
                    MyAI is thinking…
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input area */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--border)',
          background: 'var(--card)', flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-end',
            background: 'var(--bg)', border: '1.5px solid var(--border)',
            borderRadius: 16, padding: '8px 8px 8px 14px',
            transition: 'border-color 0.2s',
          }}
            onFocusCapture={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,106,42,0.5)'; }}
            onBlurCapture={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isOffline ? 'Start Ollama to use MyAI…' : 'Ask MyAI about your farm… (Enter to send, Shift+Enter for new line)'}
              disabled={isOffline || streaming}
              rows={1}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                resize: 'none', fontSize: 13, color: 'var(--text)',
                lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
                fontFamily: 'inherit',
                opacity: (isOffline || streaming) ? 0.5 : 1,
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
              }}
            />
            {streaming ? (
              <button
                onClick={handleStop}
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#EF4444', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                title="Stop generating"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isOffline}
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: !input.trim() || isOffline
                    ? 'var(--bg)'
                    : 'linear-gradient(135deg, #FF3B30, #FF7A18)',
                  border: !input.trim() || isOffline ? '1px solid var(--border)' : 'none',
                  color: !input.trim() || isOffline ? 'var(--text-secondary)' : '#fff',
                  cursor: !input.trim() || isOffline ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                  boxShadow: !input.trim() || isOffline ? 'none' : '0 4px 12px rgba(255,59,48,0.3)',
                }}
                title="Send (Enter)"
              >
                <Send size={15} />
              </button>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 5, textAlign: 'center' }}>
            MyAI runs locally · Powered by Ollama + {MYAI_MODEL} · Farm data stays on your computer
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .myai-sidebar { display: flex !important; }
        .conv-del-btn:hover { opacity: 1 !important; }
        @media (max-width: 640px) {
          .myai-sidebar { position: fixed !important; top: 0; left: 0; height: 100vh !important; transform: translateX(-100%) !important; }
          .myai-sidebar-toggle { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
