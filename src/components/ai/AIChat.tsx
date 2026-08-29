import { useState, useRef, useEffect, type ReactNode } from 'react';
import {
  Send, Square, X, RefreshCw, AlertCircle,
  Copy, Check, Plus, Trash2, Bot, Sparkles, MessageSquare, ChevronLeft,
} from 'lucide-react';
import { Button } from '../ui/Button';
import {
  type MyAIConversation, type MyAIMessage, type AIStatus,
  MYAI_MODEL, AI_MODE,
} from '../../lib/myai';
import { loadCorner, type Corner } from './AIFloatingButton';

const PANEL_W = 420;
const PANEL_H = 600;
const BTN_SIZE = 48;
const MARGIN = 16;

export interface AIChatProps {
  open: boolean;
  onClose: () => void;
  aiStatus: AIStatus;
  conversations: MyAIConversation[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onSendMessage: (text: string) => void;
  onStopStreaming: () => void;
  onRetryStatus: () => void;
  streaming: boolean;
  streamingText: string;
  quickPrompts?: string[];
}

// ── Markdown Formatter ─────────────────────────────────────────────────────────
function fmt(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} style={{ color: 'var(--color-text-primary, #0F172A)' }}>
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function renderMessageContent(text: string): ReactNode[] {
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    const t = line.trim();
    if (!t) return <div key={idx} style={{ height: 6 }} />;
    if (t.startsWith('## ') || t.startsWith('# ')) {
      return (
        <div
          key={idx}
          style={{
            fontWeight: 800,
            fontSize: '13.5px',
            marginTop: 8,
            marginBottom: 4,
            color: 'var(--color-text-primary, #1F2933)',
          }}
        >
          {t.replace(/^#+\s*/, '')}
        </div>
      );
    }
    if (t.startsWith('- ') || t.startsWith('• ') || t.startsWith('* ')) {
      return (
        <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 3 }}>
          <span style={{ color: 'var(--color-primary, #43A047)', flexShrink: 0, marginTop: 3, fontSize: 10 }}>●</span>
          <span style={{ lineHeight: 1.55, fontSize: '13px' }}>{fmt(t.slice(2))}</span>
        </div>
      );
    }
    if (/^\d+\./.test(t)) {
      return (
        <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 3 }}>
          <span style={{ color: 'var(--color-primary, #43A047)', flexShrink: 0, fontWeight: 700, fontSize: 11, minWidth: 16 }}>
            {t.match(/^(\d+)\./)?.[1]}.
          </span>
          <span style={{ lineHeight: 1.55, fontSize: '13px' }}>{fmt(t.replace(/^\d+\.\s*/, ''))}</span>
        </div>
      );
    }
    return (
      <div key={idx} style={{ lineHeight: 1.55, marginBottom: 2, fontSize: '13px' }}>
        {fmt(t)}
      </div>
    );
  });
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      aria-label="Copy message"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--color-text-muted, #94A3B8)',
        padding: '2px 4px',
        borderRadius: 4,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
      }}
    >
      {copied ? <Check size={12} color="var(--color-primary, #43A047)" /> : <Copy size={12} />}
    </button>
  );
}

export function AIChat({
  open,
  onClose,
  aiStatus,
  conversations,
  activeId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onSendMessage,
  onStopStreaming,
  onRetryStatus,
  streaming,
  streamingText,
  quickPrompts = [
    'Farm summary',
    'Animals needing attention',
    'Overdue vaccinations',
    'Pregnant animals',
    'Low inventory',
    'Recent health alerts',
  ],
}: AIChatProps) {
  const [input, setInput] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeConv = conversations.find((c) => c.id === activeId);
  const messages: MyAIMessage[] = activeConv?.messages ?? [];

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, messages.length, streamingText]);

  if (!open) return null;

  const handleSend = () => {
    if (!input.trim() || streaming) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const corner = loadCorner();
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 500;

  // Responsive position styles
  const getPanelStyles = (): React.CSSProperties => {
    if (isMobile) {
      return {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: 'min(76vh, calc(100dvh - 50px))',
        borderRadius: '24px 24px 0 0',
        zIndex: 9999,
      };
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = Math.min(PANEL_W, vw - 32);
    const ph = Math.min(PANEL_H, vh - 32);
    const offset = MARGIN + BTN_SIZE + 10;

    const base: React.CSSProperties = {
      position: 'fixed',
      width: pw,
      height: ph,
      borderRadius: 'var(--radius-xl, 24px)',
      zIndex: 9999,
    };

    switch (corner) {
      case 'tl': return { ...base, left: MARGIN, top: offset };
      case 'tr': return { ...base, right: MARGIN, top: offset };
      case 'bl': return { ...base, left: MARGIN, bottom: offset };
      case 'br': return { ...base, right: MARGIN, bottom: offset };
    }
  };

  return (
    <>
      {/* Backdrop for mobile */}
      {isMobile && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(6, 18, 32, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9998,
          }}
        />
      )}

      <div
        className="alpas-ai-chat-panel"
        style={{
          ...getPanelStyles(),
          background: 'var(--color-surface, #FFFFFF)',
          border: '1px solid var(--color-border, rgba(226, 232, 240, 0.95))',
          boxShadow: 'var(--shadow-modal, 0 24px 64px rgba(15, 23, 42, 0.18))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Panel Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border-light, rgba(226, 232, 240, 0.8))',
            background: 'var(--color-surface, #FFFFFF)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              title="Conversations"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-secondary, #475569)',
                padding: 4,
                borderRadius: '6px',
                display: 'flex',
              }}
            >
              <MessageSquare size={17} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'var(--ai-gradient, linear-gradient(135deg, #43A047 0%, #42A5F5 100%))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                }}
              >
                <Bot size={16} />
              </div>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text-primary, #1F2933)' }}>
                  AlpasFarm AI
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--color-text-muted, #667085)' }}>
                  {AI_MODE} · {MYAI_MODEL}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={onRetryStatus}
              title="Refresh status"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted, #94A3B8)',
                padding: 4,
              }}
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={onClose}
              aria-label="Close chat"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-secondary, #475569)',
                padding: 4,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Conversations Drawer */}
        {showSidebar && (
          <div
            style={{
              padding: '12px',
              background: 'var(--color-surface-hover, rgba(148, 163, 184, 0.08))',
              borderBottom: '1px solid var(--color-border-light, rgba(226, 232, 240, 0.8))',
              maxHeight: 180,
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted, #667085)' }}>
                Conversations
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onNewConversation();
                  setShowSidebar(false);
                }}
                leftIcon={<Plus size={12} />}
                style={{ padding: '2px 8px', fontSize: '11px', minHeight: 24 }}
              >
                New Chat
              </Button>
            </div>
            {conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  onSelectConversation(c.id);
                  setShowSidebar(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm, 8px)',
                  background: c.id === activeId ? 'rgba(67, 160, 71, 0.12)' : 'transparent',
                  color: c.id === activeId ? 'var(--color-primary, #2E7D32)' : 'var(--color-text-primary, #1F2933)',
                  fontSize: '12px',
                  fontWeight: c.id === activeId ? 700 : 500,
                  cursor: 'pointer',
                  marginBottom: 2,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title || 'Conversation'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(c.id);
                  }}
                  aria-label="Delete chat"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted, #94A3B8)',
                    padding: 2,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Message Feed */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 8px' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'rgba(67, 160, 71, 0.12)',
                  color: 'var(--color-primary, #2E7D32)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                }}
              >
                <Sparkles size={20} />
              </div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '14.5px', fontWeight: 700, color: 'var(--color-text-primary, #1F2933)' }}>
                How can I assist your farm today?
              </h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: 'var(--color-text-muted, #667085)' }}>
                Ask about herd health, feeding plans, overdue vaccines, or stock.
              </p>

              {/* Quick Prompts Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {quickPrompts.map((q) => (
                  <button
                    key={q}
                    onClick={() => onSendMessage(q)}
                    style={{
                      background: 'var(--color-surface, #F0F4F1)',
                      border: '1px solid var(--color-border, #E5EDE6)',
                      borderRadius: 'var(--radius-pill, 999px)',
                      padding: '5px 10px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: 'var(--color-text-secondary, #475569)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius:
                    m.role === 'user'
                      ? '18px 18px 4px 18px'
                      : '18px 18px 18px 4px',
                  background:
                    m.role === 'user'
                      ? 'var(--color-primary-gradient, linear-gradient(135deg, #43A047 0%, #2E7D32 100%))'
                      : 'var(--color-surface-hover, #F0F4F1)',
                  color: m.role === 'user' ? '#FFFFFF' : 'var(--color-text-primary, #1F2933)',
                  boxShadow: m.role === 'user' ? '0 4px 12px rgba(46, 125, 50, 0.25)' : 'none',
                  fontSize: '13px',
                }}
              >
                {m.role === 'user' ? m.content : renderMessageContent(m.content)}
              </div>
              {m.role === 'assistant' && (
                <div style={{ marginTop: 2, paddingLeft: 4 }}>
                  <CopyBtn text={m.content} />
                </div>
              )}
            </div>
          ))}

          {/* Streaming response */}
          {streaming && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <div
                style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: '18px 18px 18px 4px',
                  background: 'var(--color-surface-hover, #F0F4F1)',
                  color: 'var(--color-text-primary, #1F2933)',
                  fontSize: '13px',
                }}
              >
                {streamingText ? renderMessageContent(streamingText) : <span style={{ opacity: 0.6 }}>Thinking...</span>}
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input Bar */}
        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--color-border-light, #E5EDE6)',
            background: 'var(--color-surface, #FFFFFF)',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask AI anything about your farm..."
            style={{
              flex: 1,
              maxHeight: 90,
              padding: '8px 12px',
              fontSize: '13px',
              fontFamily: 'inherit',
              borderRadius: 'var(--radius-md, 12px)',
              background: 'var(--color-surface-hover, #F8FAF8)',
              border: '1px solid var(--color-border, #DDE7DF)',
              color: 'var(--color-text-primary, #1F2933)',
              outline: 'none',
              resize: 'none',
            }}
          />

          {streaming ? (
            <Button
              variant="danger"
              size="sm"
              onClick={onStopStreaming}
              aria-label="Stop generation"
              style={{ padding: '8px 12px', minHeight: 36 }}
            >
              <Square size={14} />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSend}
              disabled={!input.trim()}
              aria-label="Send prompt"
              style={{ padding: '8px 12px', minHeight: 36 }}
            >
              <Send size={14} />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
