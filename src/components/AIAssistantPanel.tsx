import { useMemo, useState } from 'react';
import { Sparkles, Send, X, Lightbulb } from 'lucide-react';
import { useFarmData } from '../lib/useFarmData';

type MessageRole = 'assistant' | 'user';

interface AssistantMessage {
  id: string;
  role: MessageRole;
  content: string;
}

interface AIAssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

function buildReply(input: string, farmData: ReturnType<typeof useFarmData>) {
  if (farmData.loading) {
    return 'I am still loading the latest farm records. Please try again in a moment.';
  }

  const activeAnimals = farmData.animals.filter((a) => !a.archived);
  const atRisk = activeAnimals.filter((a) => a.health_status === 'At Risk' || a.health_status === 'Critical');
  const overdueVacc = activeAnimals.filter((a) => a.vaccination_status === 'Overdue');
  const dueSoon = activeAnimals.filter((a) => a.vaccination_status === 'Due Soon');
  const lowStockItems = farmData.inventory.filter((item) => Number(item.quantity) <= Number(item.minimum_stock));
  const breedingAnimals = activeAnimals.filter((a) => a.breeding_status === 'Pregnant' || a.breeding_status === 'Ready');
  const feedSpend = farmData.feedRecords.reduce((sum, record) => sum + Number(record.cost || 0), 0);
  const safetyNote = '\n\nThis is a record-based summary only. For animal health decisions, confirm with a veterinarian or farm technician.';

  const q = input.toLowerCase();

  if (q.includes('health') || q.includes('risk') || q.includes('alert')) {
    if (activeAnimals.length === 0) {
      return `I do not currently see any active animal records to review.${safetyNote}`;
    }

    if (atRisk.length === 0) {
      return `Based on the current records, no active animals are marked At Risk or Critical.${safetyNote}`;
    }

    const names = atRisk.slice(0, 3).map((animal) => animal.name).join(', ');
    return `Based on the current status values in your records, ${atRisk.length} active animal${atRisk.length > 1 ? 's' : ''} are marked At Risk or Critical: ${names}${atRisk.length > 3 ? ' and more.' : '.'}${safetyNote}`;
  }

  if (q.includes('vaccin') || q.includes('vaccine') || q.includes('shot')) {
    if (activeAnimals.length === 0) {
      return `I do not currently have animal records to evaluate vaccination status.${safetyNote}`;
    }

    if (overdueVacc.length === 0 && dueSoon.length === 0) {
      return `Based on the records I can see, there are no active animals currently marked overdue or due soon for vaccination.${safetyNote}`;
    }

    const overdueNames = overdueVacc.slice(0, 3).map((animal) => animal.name).join(', ');
    const dueNames = dueSoon.slice(0, 3).map((animal) => animal.name).join(', ');
    return `I can see ${overdueVacc.length} overdue vaccination${overdueVacc.length === 1 ? '' : 's'} and ${dueSoon.length} due-soon vaccination${dueSoon.length === 1 ? '' : 's'} for active animals. Overdue: ${overdueNames || 'none'}. Due soon: ${dueNames || 'none'}.${safetyNote}`;
  }

  if (q.includes('stock') || q.includes('inventory') || q.includes('supply')) {
    if (farmData.inventory.length === 0) {
      return `I do not currently have inventory records to review.${safetyNote}`;
    }

    if (lowStockItems.length === 0) {
      return `Based on the current inventory values, no items are below their minimum stock threshold.${safetyNote}`;
    }

    const names = lowStockItems.slice(0, 3).map((item) => item.name).join(', ');
    return `I found ${lowStockItems.length} item${lowStockItems.length === 1 ? '' : 's'} below minimum stock: ${names}${lowStockItems.length > 3 ? ' and more.' : '.'}${safetyNote}`;
  }

  if (q.includes('feed') || q.includes('cost') || q.includes('efficiency')) {
    if (farmData.feedRecords.length === 0) {
      return `I do not currently have feed records to summarize.${safetyNote}`;
    }

    return `The current feed records show a total recorded cost of ₱${feedSpend.toFixed(2)}. I can help review feed usage trends, but I cannot confirm production outcomes without weight and health records.${safetyNote}`;
  }

  if (q.includes('breed') || q.includes('pregnant') || q.includes('kidding')) {
    if (activeAnimals.length === 0) {
      return `I do not currently have active animal records to review for breeding.${safetyNote}`;
    }

    if (breedingAnimals.length === 0) {
      return `I do not currently see animals marked Pregnant or Ready for breeding follow-up in the records.${safetyNote}`;
    }

    const names = breedingAnimals.slice(0, 3).map((animal) => animal.name).join(', ');
    return `The current records show ${breedingAnimals.length} animal${breedingAnimals.length === 1 ? '' : 's'} marked Pregnant or Ready: ${names}${breedingAnimals.length > 3 ? ' and more.' : '.'}${safetyNote}`;
  }

  return `Based on the records currently saved in this system, I can see ${activeAnimals.length} active animal${activeAnimals.length === 1 ? '' : 's'}, ${overdueVacc.length} overdue vaccination${overdueVacc.length === 1 ? '' : 's'}, and ${lowStockItems.length} low-stock item${lowStockItems.length === 1 ? '' : 's'}. Ask me about health, vaccinations, inventory, breeding, or feed.${safetyNote}`;
}

export function AIAssistantPanel({ open, onClose }: AIAssistantPanelProps) {
  const farmData = useFarmData();
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I can summarize your current farm records for health, vaccinations, stock, breeding, and feed. I provide record-based guidance only and do not replace veterinary advice.',
    },
  ]);
  const [draft, setDraft] = useState('');

  const quickPrompts = useMemo(() => [
    'What needs attention today?',
    'Show me vaccination priorities',
    'Which supplies are low stock?',
    'Summarize breeding follow-up',
  ], []);

  if (!open) return null;

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;

    if (farmData.loading) {
      setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', content: trimmed }, { id: `assistant-${Date.now() + 1}`, role: 'assistant', content: 'I am still loading the latest farm records. Please try again in a moment.' }]);
      setDraft('');
      return;
    }

    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const assistantMessage: AssistantMessage = {
      id: `assistant-${Date.now() + 1}`,
      role: 'assistant',
      content: buildReply(trimmed, farmData),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setDraft('');
  };

  return (
    <div className="ai-assistant-backdrop" onClick={onClose}>
      <div className="ai-assistant-panel" onClick={(event) => event.stopPropagation()}>
        <div className="ai-assistant-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="ai-assistant-icon">
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800 }}>AI Farm Assistant</div>
              <div className="ai-assistant-subtitle">Smart help from your current farm data</div>
            </div>
          </div>
          <button className="ai-close-btn" onClick={onClose} aria-label="Close assistant">
            <X size={16} />
          </button>
        </div>

        <div className="ai-assistant-body">
          <div className="ai-suggestions">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                className="ai-suggestion-chip"
                onClick={() => {
                  setDraft(prompt);
                }}
              >
                <Lightbulb size={14} /> {prompt}
              </button>
            ))}
          </div>

          <div className="ai-message-list">
            {messages.map((message) => (
              <div key={message.id} className={`ai-message ${message.role}`}>
                {message.content}
              </div>
            ))}
          </div>
        </div>

        <form className="ai-composer" onSubmit={handleSend}>
          <input
            className="ai-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about health, stock, vaccines, breeding..."
          />
          <button className="ai-send-btn" type="submit" aria-label="Send message">
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
