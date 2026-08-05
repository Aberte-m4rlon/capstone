import { useMemo, useState, useEffect, useRef } from 'react';
import { Sparkles, Send, X, Lightbulb, Brain, TrendingUp, AlertCircle, Zap, RefreshCw } from 'lucide-react';
import { useFarmData } from '../lib/useFarmData';
import {
  useMLInsights,
  useAnomalyDetection,
  useAnimalClusters,
  useFeedPrediction,
} from '../lib/mlHooks';
import { generateRecommendations } from '../lib/recommendations';
import { monthsSince, daysUntil } from '../lib/analytics';

type MessageRole = 'assistant' | 'user';
type MessageType = 'text' | 'insight' | 'alert' | 'briefing';

interface AssistantMessage {
  id: string;
  role: MessageRole;
  content: string;
  type?: MessageType;
  bullets?: string[];
}

interface AIAssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

// ─── Intent detection ────────────────────────────────────────────────────────

type Intent =
  | 'health_risk'
  | 'anomaly'
  | 'vaccination'
  | 'breeding'
  | 'growth'
  | 'milk'
  | 'feed'
  | 'inventory'
  | 'cluster'
  | 'summary'
  | 'animal_lookup'
  | 'briefing'
  | 'unknown';

function detectIntent(input: string): { intent: Intent; animalName: string | null } {
  const q = input.toLowerCase();
  let animalName: string | null = null;

  // Animal name lookup pattern: "how is [name]" / "tell me about [name]" / "[name]'s"
  const nameMatch = q.match(/(?:how is|about|check|status of|show me)\s+([a-z]+)/i)
    || q.match(/([a-z]+)'s\s+(?:health|weight|status|breeding|milk)/i);
  if (nameMatch) animalName = nameMatch[1];

  if (q.match(/anomal|unusual|weird|spike|outlier|abnormal/)) return { intent: 'anomaly', animalName };
  if (q.match(/health risk|at risk|critical|sick|illness|disease|risk score/)) return { intent: 'health_risk', animalName };
  if (q.match(/vaccin|shot|immuniz|booster|jab/)) return { intent: 'vaccination', animalName };
  if (q.match(/breed|pregnant|kidding|mating|gestat|offspring/)) return { intent: 'breeding', animalName };
  if (q.match(/weight|grow|gain|market|size|heav/)) return { intent: 'growth', animalName };
  if (q.match(/milk|yield|litre|liter|dairy|produc/)) return { intent: 'milk', animalName };
  if (q.match(/feed|fodder|hay|grain|cost|efficiency|fcr/)) return { intent: 'feed', animalName };
  if (q.match(/stock|inventory|supply|expir|medicine|low/)) return { intent: 'inventory', animalName };
  if (q.match(/cluster|group|segment|categor|similar/)) return { intent: 'cluster', animalName };
  if (q.match(/summary|overview|total|how many|all animal|entire|whole farm|herd/)) return { intent: 'summary', animalName };
  if (q.match(/today|attention|urgent|priority|what.*need|briefing|morning|update/)) return { intent: 'briefing', animalName };
  if (animalName) return { intent: 'animal_lookup', animalName };

  return { intent: 'unknown', animalName };
}

// ─── Reply builder ────────────────────────────────────────────────────────────

function buildReply(
  input: string,
  farmData: ReturnType<typeof useFarmData>,
  mlInsights: ReturnType<typeof useMLInsights>,
): { content: string; bullets?: string[]; type?: MessageType } {
  if (farmData.loading) {
    return { content: 'Still loading your farm data. Give me a moment and ask again.' };
  }

  const { intent, animalName } = detectIntent(input);
  const activeAnimals = farmData.animals.filter((a) => !a.archived);
  const safetyNote = '\n\nAlways confirm health decisions with a licensed veterinarian.';

  // ── Animal-specific lookup ──────────────────────────────────────────────────
  if (animalName) {
    const animal = activeAnimals.find((a) => a.name.toLowerCase().includes(animalName.toLowerCase()));
    if (animal) {
      const growthData = mlInsights.growthPredictions.find((g) => g.animalId === animal.id);
      const milkData = mlInsights.milkForecasts.find((m) => m.animalId === animal.id);
      const breedingData = mlInsights.breedingPredictions.find((b) => b.animal.id === animal.id);
      const anomalyData = mlInsights.anomalies.find((a) => a.animal.id === animal.id);

      const bullets: string[] = [
        `Species: ${animal.species} · Sex: ${animal.sex} · Breed: ${animal.breed ?? 'Unknown'}`,
        `Weight: ${animal.weight_kg ? animal.weight_kg + ' kg' : 'Not recorded'}`,
        `Health: ${animal.health_status} (risk score: ${animal.health_risk_score})`,
        `Vaccination: ${animal.vaccination_status}`,
        `Breeding status: ${animal.breeding_status}`,
      ];
      if (animal.expected_kidding_date) {
        const days = daysUntil(animal.expected_kidding_date);
        bullets.push(`Kidding in ${days} day${days === 1 ? '' : 's'} (${animal.expected_kidding_date})`);
      }
      if (growthData?.model) {
        bullets.push(`Growth forecast: ${growthData.model.projectedDailyGain > 0 ? '+' : ''}${growthData.model.projectedDailyGain} kg/day · confidence ${growthData.model.confidence}%`);
        if (growthData.model.marketReadyDate) bullets.push(`Market-ready by: ${growthData.model.marketReadyDate}`);
      }
      if (milkData?.forecast) {
        const avgYield = (milkData.forecast.forecast.reduce((s, v) => s + v, 0) / milkData.forecast.forecast.length).toFixed(2);
        bullets.push(`Milk forecast: ~${avgYield} L/day over next 7 days (${milkData.forecast.confidence}% confidence)`);
      }
      if (breedingData?.prediction) {
        bullets.push(`Breeding success probability: ${Math.round(breedingData.prediction.probability * 100)}% — ${breedingData.prediction.recommendation}`);
      }
      if (anomalyData) {
        const msg = anomalyData.tempAnomaly?.isAnomaly ? anomalyData.tempAnomaly.message : anomalyData.hrAnomaly?.message;
        if (msg) bullets.push(`⚠️ Anomaly detected: ${msg}`);
      }

      return {
        content: `Here's a full AI profile for **${animal.name}** (${animal.tag_id}):`,
        bullets,
        type: 'insight',
      };
    }
  }

  // ── Intent-based responses ──────────────────────────────────────────────────

  if (intent === 'briefing' || intent === 'summary') {
    return buildBriefing(farmData, mlInsights);
  }

  if (intent === 'anomaly') {
    if (mlInsights.anomalies.length === 0) {
      return { content: 'No anomalies detected right now. All temperature and heart rate readings are within expected statistical ranges for each animal.' };
    }
    const bullets = mlInsights.anomalies.map((a) => {
      const msgs: string[] = [];
      if (a.tempAnomaly?.isAnomaly) msgs.push(`Temp: ${a.tempAnomaly.message}`);
      if (a.hrAnomaly?.isAnomaly) msgs.push(`HR: ${a.hrAnomaly.message}`);
      return `${a.animal.name}: ${msgs.join(' | ')}`;
    });
    return {
      content: `My anomaly detection model (Z-score + IQR) flagged **${mlInsights.anomalies.length}** animal${mlInsights.anomalies.length > 1 ? 's' : ''} with statistically unusual vitals:`,
      bullets,
      type: 'alert',
    };
  }

  if (intent === 'health_risk') {
    const atRisk = activeAnimals.filter((a) => a.health_status === 'At Risk' || a.health_status === 'Critical');
    const model = mlInsights.healthModel;
    let content = '';
    const bullets: string[] = [];

    if (model?.canPredict) {
      content = `My logistic regression model is trained on ${model.trainingSamples} health records with **${Math.round(model.accuracy * 100)}% accuracy**. `;
    }
    if (atRisk.length === 0) {
      content += 'No animals are currently At Risk or Critical based on recorded health status.';
    } else {
      content += `${atRisk.length} animal${atRisk.length > 1 ? 's are' : ' is'} flagged:`;
      atRisk.forEach((a) => bullets.push(`${a.name} — ${a.health_status} (score: ${a.health_risk_score})`));
    }
    if (mlInsights.anomalies.length > 0) {
      content += `\n\nAdditionally, ${mlInsights.anomalies.length} animal${mlInsights.anomalies.length > 1 ? 's have' : ' has'} anomalous vitals (temperature or heart rate) detected by statistical outlier analysis.`;
    }
    return { content: content + safetyNote, bullets: bullets.length > 0 ? bullets : undefined, type: 'insight' };
  }

  if (intent === 'vaccination') {
    const overdue = activeAnimals.filter((a) => a.vaccination_status === 'Overdue');
    const dueSoon = activeAnimals.filter((a) => a.vaccination_status === 'Due Soon');
    const bullets: string[] = [];
    overdue.slice(0, 5).forEach((a) => bullets.push(`🔴 Overdue: ${a.name}`));
    dueSoon.slice(0, 5).forEach((a) => bullets.push(`🟡 Due soon: ${a.name}`));
    const content = overdue.length + dueSoon.length === 0
      ? 'All vaccinations are up to date. No animals overdue or due soon.'
      : `Found **${overdue.length} overdue** and **${dueSoon.length} due soon** across active animals:`;
    return { content, bullets: bullets.length > 0 ? bullets : undefined, type: 'insight' };
  }

  if (intent === 'breeding') {
    const pregnant = activeAnimals.filter((a) => a.breeding_status === 'Pregnant');
    const ready = activeAnimals.filter((a) => a.breeding_status === 'Ready');
    const highProb = mlInsights.breedingPredictions.filter((b) => b.prediction && b.prediction.probability >= 0.7);
    const bullets: string[] = [];
    pregnant.slice(0, 4).forEach((a) => {
      const days = a.expected_kidding_date ? daysUntil(a.expected_kidding_date) : null;
      bullets.push(`🤰 ${a.name} — pregnant${days !== null ? `, kidding in ${days} days` : ''}`);
    });
    ready.slice(0, 3).forEach((a) => bullets.push(`✅ ${a.name} — ready for breeding`));
    highProb.slice(0, 3).forEach((b) => {
      if (!pregnant.find((p) => p.id === b.animal.id) && !ready.find((r) => r.id === b.animal.id)) {
        bullets.push(`🧠 AI predicts ${Math.round(b.prediction!.probability * 100)}% success for ${b.animal.name}`);
      }
    });
    const content = `Breeding overview: **${pregnant.length} pregnant**, **${ready.length} ready**, **${highProb.length} AI-flagged** as high probability.`;
    return { content, bullets: bullets.length > 0 ? bullets : undefined, type: 'insight' };
  }

  if (intent === 'growth') {
    const hasForecasts = mlInsights.growthPredictions.filter((g) => g.model);
    if (hasForecasts.length === 0) {
      return { content: 'I need at least 2 weight records per animal to run growth projections. Log more weigh-ins to enable polynomial regression forecasting.' };
    }
    const bullets = hasForecasts.slice(0, 6).map((g) => {
      const gain = g.model!.projectedDailyGain;
      const ready = g.model!.marketReadyDate;
      return `${g.animalName}: ${gain > 0 ? '+' : ''}${gain} kg/day · R²=${g.model!.rSquared.toFixed(2)}${ready ? ` · market-ready ${ready}` : ''}`;
    });
    return {
      content: `Growth forecasts from polynomial regression (${hasForecasts.length} animals modelled):`,
      bullets,
      type: 'insight',
    };
  }

  if (intent === 'milk') {
    const forecasts = mlInsights.milkForecasts.filter((m) => m.forecast);
    if (forecasts.length === 0) {
      return { content: "No milk forecasts available yet. I need at least 3 milk records per female animal to run Holt's exponential smoothing." };
    }
    const bullets = forecasts.slice(0, 5).map((m) => {
      const avg = (m.forecast!.forecast.reduce((s, v) => s + v, 0) / m.forecast!.forecast.length).toFixed(2);
      const trend = m.forecast!.trend > 0.01 ? '↑ increasing' : m.forecast!.trend < -0.01 ? '↓ decreasing' : '→ stable';
      return `${m.animalName}: ~${avg} L/day · trend ${trend} · ${m.forecast!.confidence}% confidence`;
    });
    return {
      content: `Milk yield forecasts (Holt's exponential smoothing, next 7 days) for **${forecasts.length} female${forecasts.length > 1 ? 's' : ''}**:`,
      bullets,
      type: 'insight',
    };
  }

  if (intent === 'feed') {
    const feedPred = mlInsights.feedPrediction;
    if (!feedPred) {
      return { content: 'I need paired feed and weight records for at least 2 animals to build a feed-to-weight-gain model. Add more feed and weight records.' };
    }
    const totalSpend = farmData.feedRecords.reduce((s, r) => s + Number(r.cost || 0), 0);
    const content = `Feed-to-weight OLS regression: slope = **${feedPred.slope} kg gain per kg feed** · R² = ${feedPred.rSquared.toFixed(3)} · total recorded feed cost ₱${totalSpend.toFixed(2)}.`;
    const bullets: string[] = [
      `R²=${feedPred.rSquared.toFixed(3)} — ${feedPred.rSquared > 0.7 ? 'strong' : feedPred.rSquared > 0.4 ? 'moderate' : 'weak'} feed-weight correlation`,
      feedPred.slope > 0 ? `Every 1 kg of feed → ~${feedPred.slope} kg weight gain` : 'No positive feed-to-gain correlation found — review feed quality',
    ];
    return { content, bullets, type: 'insight' };
  }

  if (intent === 'inventory') {
    const lowStock = farmData.inventory.filter((i) => Number(i.quantity) <= Number(i.minimum_stock));
    const expired = farmData.inventory.filter((i) => i.expiry_date && new Date(i.expiry_date) < new Date());
    const bullets: string[] = [];
    lowStock.slice(0, 4).forEach((i) => bullets.push(`⚠️ Low: ${i.name} (${i.quantity} ${i.unit} remaining)`));
    expired.slice(0, 3).forEach((i) => bullets.push(`🔴 Expired: ${i.name} (expired ${i.expiry_date})`));
    const content = lowStock.length + expired.length === 0
      ? 'All inventory items are stocked above minimum levels. No expired items.'
      : `Inventory alert: **${lowStock.length} low-stock** and **${expired.length} expired** items:`;
    return { content, bullets: bullets.length > 0 ? bullets : undefined, type: 'alert' };
  }

  if (intent === 'cluster') {
    const clusters = mlInsights.clusters;
    if (!clusters) {
      return { content: 'I need at least 3 active animals to run K-means clustering. Add more animals to enable herd segmentation.' };
    }
    const clusterMap: Record<number, string[]> = {};
    clusters.assignments.forEach((a) => {
      (clusterMap[a.cluster] ??= []).push(a.name);
    });
    const bullets = clusters.clusterLabels.map((label, i) => {
      const members = clusterMap[i] ?? [];
      return `${label}: ${members.slice(0, 4).join(', ')}${members.length > 4 ? ` +${members.length - 4} more` : ''}`;
    });
    return {
      content: `K-means clustering grouped your **${activeAnimals.length} active animals** into **${clusters.k} segments** by weight, age, health score, and species:`,
      bullets,
      type: 'insight',
    };
  }

  // Fallback: return the briefing
  return buildBriefing(farmData, mlInsights);
}

// ─── Smart briefing ───────────────────────────────────────────────────────────

function buildBriefing(
  farmData: ReturnType<typeof useFarmData>,
  mlInsights: ReturnType<typeof useMLInsights>,
): { content: string; bullets: string[]; type: MessageType } {
  const activeAnimals = farmData.animals.filter((a) => !a.archived);
  const atRisk = activeAnimals.filter((a) => a.health_status === 'At Risk' || a.health_status === 'Critical');
  const overdue = activeAnimals.filter((a) => a.vaccination_status === 'Overdue');
  const lowStock = farmData.inventory.filter((i) => Number(i.quantity) <= Number(i.minimum_stock));
  const pregnant = activeAnimals.filter((a) => a.breeding_status === 'Pregnant');
  const kiddingSoon = pregnant.filter((a) => a.expected_kidding_date && daysUntil(a.expected_kidding_date) <= 14);

  const bullets: string[] = [];

  // Critical alerts first
  if (atRisk.length > 0) bullets.push(`🔴 ${atRisk.length} animal${atRisk.length > 1 ? 's' : ''} at risk: ${atRisk.slice(0, 2).map((a) => a.name).join(', ')}${atRisk.length > 2 ? '…' : ''}`);
  if (mlInsights.anomalies.length > 0) bullets.push(`⚡ ${mlInsights.anomalies.length} anomalous vital${mlInsights.anomalies.length > 1 ? 's' : ''} detected (${mlInsights.anomalies.slice(0, 2).map((a) => a.animal.name).join(', ')})`);
  if (overdue.length > 0) bullets.push(`💉 ${overdue.length} overdue vaccination${overdue.length > 1 ? 's' : ''}`);
  if (kiddingSoon.length > 0) bullets.push(`🐣 ${kiddingSoon.length} animal${kiddingSoon.length > 1 ? 's' : ''} kidding within 14 days`);
  if (lowStock.length > 0) bullets.push(`📦 ${lowStock.length} inventory item${lowStock.length > 1 ? 's' : ''} below minimum stock`);

  // Positive ML insights
  const growthCount = mlInsights.growthPredictions.filter((g) => g.model).length;
  if (growthCount > 0) bullets.push(`📈 ${growthCount} growth forecast${growthCount > 1 ? 's' : ''} active (polynomial regression)`);
  if (mlInsights.healthModel?.canPredict) bullets.push(`🧠 Health risk model: ${Math.round(mlInsights.healthModel.accuracy * 100)}% accuracy · ${mlInsights.healthModel.trainingSamples} training records`);
  if (mlInsights.clusters) bullets.push(`🔵 Herd clustered into ${mlInsights.clusters.k} groups by weight, age, and health`);

  const urgencyLevel = atRisk.length > 0 || mlInsights.anomalies.length > 0 ? 'needs attention' : overdue.length > 0 || lowStock.length > 0 ? 'a few things to watch' : 'looking good';
  const content = `Farm briefing — **${activeAnimals.length} active animals**, ${urgencyLevel}:`;

  return { content, bullets, type: 'briefing' };
}

// ─── Dynamic quick prompts ────────────────────────────────────────────────────

function buildQuickPrompts(
  farmData: ReturnType<typeof useFarmData>,
  mlInsights: ReturnType<typeof useMLInsights>,
): string[] {
  const prompts: string[] = [];
  const activeAnimals = farmData.animals.filter((a) => !a.archived);

  if (mlInsights.anomalies.length > 0) prompts.push(`Show anomalies (${mlInsights.anomalies.length} detected)`);
  if (activeAnimals.some((a) => a.health_status === 'At Risk' || a.health_status === 'Critical')) prompts.push('Which animals are at risk?');
  if (activeAnimals.some((a) => a.vaccination_status === 'Overdue')) prompts.push('Vaccination priorities');
  if (mlInsights.growthPredictions.some((g) => g.model?.marketReadyDate)) prompts.push('Growth & market-ready dates');
  if (mlInsights.breedingPredictions.some((b) => b.prediction)) prompts.push('Breeding success predictions');
  if (mlInsights.milkForecasts.some((m) => m.forecast)) prompts.push('Milk yield forecast');
  if (mlInsights.clusters) prompts.push('How is my herd clustered?');
  prompts.push("What needs attention today?");
  prompts.push('Feed efficiency analysis');

  return prompts.slice(0, 5);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AIAssistantPanel({ open, onClose }: AIAssistantPanelProps) {
  const farmData = useFarmData();
  const mlInsights = useMLInsights();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const openingBriefing = useMemo(() => {
    if (farmData.loading) return null;
    return buildBriefing(farmData, mlInsights);
  }, [farmData.loading]);

  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      type: 'text',
      content: "Hi! I'm your AI Farm Assistant. I'm connected to your live ML models — ask me about health risks, anomalies, growth forecasts, breeding predictions, milk yield, feed efficiency, or any specific animal.",
    },
  ]);
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  // Inject smart briefing once data is ready
  useEffect(() => {
    if (!farmData.loading && openingBriefing && messages.length === 1) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'briefing',
          role: 'assistant',
          type: openingBriefing.type,
          content: openingBriefing.content,
          bullets: openingBriefing.bullets,
        },
      ]);
    }
  }, [farmData.loading]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const quickPrompts = useMemo(
    () => buildQuickPrompts(farmData, mlInsights),
    [farmData.animals, mlInsights.anomalies.length, mlInsights.totalInsights],
  );

  if (!open) return null;

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: AssistantMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setDraft('');
    setIsThinking(true);

    // Small delay to feel natural
    setTimeout(() => {
      const reply = buildReply(trimmed, farmData, mlInsights);
      const assistantMsg: AssistantMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        type: reply.type ?? 'text',
        content: reply.content,
        bullets: reply.bullets,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsThinking(false);
    }, 420);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(draft);
  };

  const refreshBriefing = () => {
    const briefing = buildBriefing(farmData, mlInsights);
    const msg: AssistantMessage = {
      id: `briefing-${Date.now()}`,
      role: 'assistant',
      type: 'briefing',
      content: briefing.content,
      bullets: briefing.bullets,
    };
    setMessages((prev) => [...prev, msg]);
  };

  const typeIcon = (type?: MessageType) => {
    if (type === 'alert') return <AlertCircle size={12} color="#EF4444" />;
    if (type === 'insight') return <Brain size={12} color="#7C3AED" />;
    if (type === 'briefing') return <Zap size={12} color="#F59E0B" />;
    return null;
  };

  return (
    <div className="ai-assistant-backdrop" onClick={onClose}>
      <div className="ai-assistant-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ai-assistant-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="ai-assistant-icon">
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800 }}>AI Farm Assistant</div>
              <div className="ai-assistant-subtitle">
                {mlInsights.totalInsights > 0
                  ? `${mlInsights.totalInsights} ML insights active · ${farmData.animals.filter((a) => !a.archived).length} animals`
                  : 'Connected to your farm data'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="ai-close-btn" onClick={refreshBriefing} aria-label="Refresh briefing" title="Refresh briefing">
              <RefreshCw size={14} />
            </button>
            <button className="ai-close-btn" onClick={onClose} aria-label="Close assistant">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ML status bar */}
        {!farmData.loading && (
          <div style={{ display: 'flex', gap: 8, padding: '8px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {mlInsights.healthModel?.canPredict && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                <Brain size={11} color="#7C3AED" /> Health AI {Math.round(mlInsights.healthModel.accuracy * 100)}%
              </span>
            )}
            {mlInsights.anomalies.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444' }}>
                <AlertCircle size={11} /> {mlInsights.anomalies.length} anomal{mlInsights.anomalies.length > 1 ? 'ies' : 'y'}
              </span>
            )}
            {mlInsights.growthPredictions.filter((g) => g.model).length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                <TrendingUp size={11} color="#3B82F6" /> {mlInsights.growthPredictions.filter((g) => g.model).length} growth models
              </span>
            )}
            {mlInsights.clusters && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                <Zap size={11} color="#10B981" /> {mlInsights.clusters.k} clusters
              </span>
            )}
          </div>
        )}

        {/* Body */}
        <div className="ai-assistant-body">
          {/* Quick prompts */}
          <div className="ai-suggestions">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                className="ai-suggestion-chip"
                onClick={() => sendMessage(prompt)}
              >
                <Lightbulb size={12} /> {prompt}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="ai-message-list">
            {messages.map((msg) => (
              <div key={msg.id} className={`ai-message ${msg.role}`}>
                {msg.role === 'assistant' && msg.type && msg.type !== 'text' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, opacity: 0.7 }}>
                    {typeIcon(msg.type)}
                    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>{msg.type}</span>
                  </div>
                )}
                <span style={{ whiteSpace: 'pre-line' }}>{msg.content.replace(/\*\*/g, '')}</span>
                {msg.bullets && msg.bullets.length > 0 && (
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: 16, listStyleType: 'none' }}>
                    {msg.bullets.map((b, i) => (
                      <li key={i} style={{ fontSize: 12, marginBottom: 4, lineHeight: 1.5 }}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {isThinking && (
              <div className="ai-message assistant">
                <span style={{ opacity: 0.6, fontSize: 13 }}>Analysing your farm data…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Composer */}
        <form className="ai-composer" onSubmit={handleSubmit}>
          <input
            className="ai-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about any animal, ML prediction, or farm metric…"
            disabled={isThinking}
          />
          <button className="ai-send-btn" type="submit" aria-label="Send" disabled={isThinking || !draft.trim()}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
