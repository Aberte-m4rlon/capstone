/**
 * FloatingAICloud — Global draggable AI assistant for AlpasFarm.
 * Uses AIFloatingButton and AIChat modular components.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useFarmData } from '../lib/useFarmData';
import { useAllScreenings } from '../lib/useCameraScreenings';
import {
  type MyAIConversation, type MyAIMessage, type AIStatus,
  checkAIStatus, buildFarmContext, streamChat,
  loadConversations, saveConversations, newConversation,
} from '../lib/myai';
import { AIFloatingButton } from './ai/AIFloatingButton';
import { AIChat } from './ai/AIChat';

function getStatusDot(s: AIStatus) {
  if (s === 'online' || s === 'production') return '#10B981';
  if (s === 'checking') return '#F59E0B';
  return '#EF4444';
}

export function FloatingAICloud() {
  const farmData = useFarmData();
  const { screenings: cameraScreenings } = useAllScreenings();

  // Panel State
  const [open, setOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>('checking');
  const [retryCount, setRetryCount] = useState(0);

  // Conversations
  const [conversations, setConversations] = useState<MyAIConversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(() => {
    const c = loadConversations();
    return c.length > 0 ? c[0].id : null;
  });
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamText] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Status Polling
  const checkStatus = useCallback(async () => {
    setAiStatus(await checkAIStatus());
  }, []);

  useEffect(() => {
    checkStatus();
    pollRef.current = setInterval(checkStatus, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkStatus, retryCount]);

  // Listen for global open event from sidebar AI Cloud launcher and Vet AI consults
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    const handleConsult = (e: Event) => {
      const customEvent = e as CustomEvent<{ prompt?: string; image?: string }>;
      setOpen(true);
      if (customEvent.detail?.prompt || customEvent.detail?.image) {
        setTimeout(() => {
          handleSend(customEvent.detail.prompt || '', customEvent.detail.image);
        }, 300);
      }
    };

    window.addEventListener('alpas:open-ai-cloud', handleOpen);
    window.addEventListener('alpas:consult-vet-ai', handleConsult);
    return () => {
      window.removeEventListener('alpas:open-ai-cloud', handleOpen);
      window.removeEventListener('alpas:consult-vet-ai', handleConsult);
    };
  }, [conversations, activeId, aiStatus, farmData, cameraScreenings]);

  // Persist Conversations
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  // Conversation Management
  const handleNewConv = () => {
    const c = newConversation();
    setConversations((p) => [c, ...p]);
    setActiveId(c.id);
  };

  const handleDelConv = (id: string) => {
    setConversations((p) => p.filter((c) => c.id !== id));
    if (activeId === id) {
      const r = conversations.filter((c) => c.id !== id);
      setActiveId(r.length > 0 ? r[0].id : null);
    }
  };

  const handleSelectConv = (id: string) => {
    setActiveId(id);
  };

  const handleStopStreaming = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
  };

  const isOffline = aiStatus === 'offline' || aiStatus === 'no_model' || aiStatus === 'unavailable';

  // Send Message
  const handleSend = async (text: string, image?: string) => {
    const msg = text.trim();
    if ((!msg && !image) || streaming || isOffline) return;

    const displayTitle = msg ? (msg.slice(0, 48) + (msg.length > 48 ? '...' : '')) : 'Image Analysis';

    let conv = conversations.find((c) => c.id === activeId) ?? null;
    if (!conv) {
      conv = newConversation(displayTitle);
      setConversations((p) => [conv!, ...p]);
      setActiveId(conv.id);
    } else if (conv.messages.length === 0) {
      setConversations((p) =>
        p.map((c) =>
          c.id === conv!.id ? { ...c, title: displayTitle } : c
        )
      );
    }

    const userMsg: MyAIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: msg || (image ? 'Please analyze this attached livestock image.' : ''),
      image: image || undefined,
      timestamp: Date.now(),
    };

    setConversations((p) =>
      p.map((c) =>
        c.id === conv!.id
          ? { ...c, messages: [...c.messages, userMsg], updatedAt: Date.now() }
          : c
      )
    );

    const ctx = !farmData.loading
      ? buildFarmContext({ ...farmData, cameraScreenings }, msg || 'Image Analysis')
      : '';

    const sys = ctx
      ? `You are MyAI, the AI assistant for AlpasFarm.\nIMPORTANT:\n- Use the REAL farm data below. NEVER invent records.\n- READ-ONLY. Respond in the user's language. Be concise. Consult a vet for medical advice.\n\nFARM DATA:\n${ctx}`
      : `You are MyAI, the AI assistant for AlpasFarm — a Goat & Sheep Farm Management System. Be concise. Respond in the user's language.`;

    const historyMsgs = conv.messages
      .filter((m) => m && (m.content || m.image) && !m.content.trim().startsWith('[Alert]'))
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content.trim(), image: m.image }));

    const msgs = [
      { role: 'system', content: sys },
      ...historyMsgs,
      { role: 'user', content: userMsg.content, image: userMsg.image },
    ];

    setStreaming(true);
    setStreamText('');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let full = '';

    try {
      for await (const _ of streamChat(
        msgs,
        (t) => {
          full += t;
          setStreamText(full);
        },
        ctrl.signal
      )) {
        /* streaming */
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        full = `${err?.message ?? 'AI temporarily unavailable. Please try again.'}`;
        setStreamText(full);
        checkStatus();
      }
    }

    const aMsg: MyAIMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: full || '(no response)',
      timestamp: Date.now(),
    };

    setConversations((p) =>
      p.map((c) =>
        c.id === conv!.id
          ? { ...c, messages: [...c.messages, aMsg], updatedAt: Date.now() }
          : c
      )
    );

    setStreamText('');
    setStreaming(false);
    abortRef.current = null;
  };

  return (
    <>
      <AIFloatingButton
        isOpen={open}
        onToggle={() => setOpen((o) => !o)}
        statusDotColor={getStatusDot(aiStatus)}
      />

      <AIChat
        open={open}
        onClose={() => setOpen(false)}
        aiStatus={aiStatus}
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={handleSelectConv}
        onNewConversation={handleNewConv}
        onDeleteConversation={handleDelConv}
        onSendMessage={handleSend}
        onStopStreaming={handleStopStreaming}
        onRetryStatus={() => {
          setRetryCount((r) => r + 1);
          checkStatus();
        }}
        streaming={streaming}
        streamingText={streamingText}
      />
    </>
  );
}
