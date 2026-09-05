import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  SkipForward,
  SkipBack,
  FileCheck,
  Check,
  Package,
  ScanLine,
  LayoutDashboard,
  PawPrint,
  HeartPulse,
  Syringe,
  Baby,
  Scale,
  Brain,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Flame,
  ArrowRight,
  TrendingUp,
  Layers,
  Activity,
  Plus,
} from 'lucide-react';

export interface DemoChapter {
  id: string;
  title: string;
  subtitle: string;
  duration: number; // in seconds
  icon: React.ElementType;
  color: string;
  tag: string;
  badge: string;
  narration: string;
  screenType:
    | 'intro'
    | 'dashboard'
    | 'add_animal'
    | 'animal_profile'
    | 'health'
    | 'illness_risk'
    | 'breeding'
    | 'weight'
    | 'inventory'
    | 'ai_assistant'
    | 'ending';
}

export const DEMO_CHAPTERS: DemoChapter[] = [
  {
    id: 'intro',
    title: '1. Introduction to AlpasFarm',
    subtitle: 'A smarter way to manage your goats and sheep',
    duration: 15,
    icon: Flame,
    color: '#238B45',
    tag: 'Welcome',
    badge: '0:00 - Intro',
    narration:
      'Welcome to AlpasFarm, a smart farm management system designed to help goat and sheep farmers manage their animals, health records, breeding activities, weight tracking, and farm inventory in one convenient platform.',
    screenType: 'intro',
  },
  {
    id: 'dashboard',
    title: '2. Live Farm Dashboard',
    subtitle: 'Overview of herd metrics, health scores & real-time priorities',
    duration: 20,
    icon: LayoutDashboard,
    color: '#176B35',
    tag: 'Dashboard',
    badge: '0:15 - Overview',
    narration:
      'After signing in, farmers are welcomed by a clear dashboard that provides an overview of the farm at a glance. Important information such as total animals, healthy animals, health alerts, breeding activities, and inventory can be accessed quickly.',
    screenType: 'dashboard',
  },
  {
    id: 'add_animal',
    title: '3. Adding a New Animal',
    subtitle: 'Tag ID registration, pedigree details, breed & weight entry',
    duration: 20,
    icon: Plus,
    color: '#238B45',
    tag: 'Registration',
    badge: '0:35 - Add Animal',
    narration:
      "Adding a new animal is simple. Farmers can record important information such as the animal's identification number, breed, gender, birth date, weight, and other relevant details.",
    screenType: 'add_animal',
  },
  {
    id: 'animal_profile',
    title: '4. Digital Animal Profile',
    subtitle: 'Comprehensive lifetime records, pedigree genealogy & QR tag',
    duration: 20,
    icon: PawPrint,
    color: '#176B35',
    tag: 'Profile & QR',
    badge: '0:55 - Profile',
    narration:
      'Each animal has its own digital profile, making it easy to review its information and monitor its history. Farmers can quickly access health, weight, vaccination, and breeding records from one place.',
    screenType: 'animal_profile',
  },
  {
    id: 'health',
    title: '5. Health Monitoring & Vitals',
    subtitle: 'Record temperature, heart rate, FAMACHA score & rumen motility',
    duration: 20,
    icon: HeartPulse,
    color: '#238B45',
    tag: 'Health Check',
    badge: '1:15 - Health',
    narration:
      'AlpasFarm also helps farmers monitor animal health. Health information can be recorded and reviewed over time, helping identify animals that may require closer attention.',
    screenType: 'health',
  },
  {
    id: 'illness_risk',
    title: '6. Illness Risk Indicator',
    subtitle: 'Automated statistical anomaly alerts & early symptom warning',
    duration: 15,
    icon: AlertTriangle,
    color: '#EF4444',
    tag: 'Risk Indicator',
    badge: '1:35 - Risk Alert',
    narration:
      'The system can analyze recorded health information and provide risk indicators when an animal shows unusual values. This helps farmers respond earlier and make more informed decisions.',
    screenType: 'illness_risk',
  },
  {
    id: 'breeding',
    title: '7. Breeding & Gestation Management',
    subtitle: 'Inbreeding coefficient safety check & kidding countdown',
    duration: 20,
    icon: Baby,
    color: '#176B35',
    tag: 'Genetics',
    badge: '1:50 - Breeding',
    narration:
      'Breeding records can also be organized in AlpasFarm. Farmers can record mating information and monitor expected kidding dates, making important breeding schedules easier to track.',
    screenType: 'breeding',
  },
  {
    id: 'weight',
    title: '8. Weight Tracking & Growth Trends',
    subtitle: 'Monitor average daily gain and polynomial weight forecasting',
    duration: 15,
    icon: Scale,
    color: '#238B45',
    tag: 'Growth Curves',
    badge: '2:10 - Weight',
    narration:
      'Weight tracking allows farmers to monitor growth over time and better understand how their animals are developing.',
    screenType: 'weight',
  },
  {
    id: 'inventory',
    title: '9. Feed, Medicine & Supplies Inventory',
    subtitle: 'Track feed conversion, milk yields & automated expiry alerts',
    duration: 15,
    icon: Package,
    color: '#176B35',
    tag: 'Supplies & Yield',
    badge: '2:25 - Inventory',
    narration:
      'Farm inventory can also be managed from the same platform. Feed, medicine, vaccines, and other supplies can be monitored, including important expiry reminders.',
    screenType: 'inventory',
  },
  {
    id: 'ai_assistant',
    title: '10. AI Farm Assistant & Insights',
    subtitle: 'Proactive veterinary suggestions & bilingual farm queries',
    duration: 15,
    icon: Brain,
    color: '#238B45',
    tag: 'AI Assistant',
    badge: '2:40 - AI Assist',
    narration:
      'With AI-powered recommendations, AlpasFarm can help highlight important tasks and potential concerns, such as overdue vaccinations, unusual weight changes, or inventory items that need attention.',
    screenType: 'ai_assistant',
  },
  {
    id: 'ending',
    title: '11. Get Started with AlpasFarm',
    subtitle: 'Modern intelligent agriculture for Philippine livestock raisers',
    duration: 15,
    icon: Sparkles,
    color: '#176B35',
    tag: 'Get Started',
    badge: '2:55 - Summary',
    narration:
      'AlpasFarm brings essential farm management tools together in one intelligent platform, helping farmers organize information, monitor their animals, and make better data-driven decisions. Welcome to smarter farm management with AlpasFarm.',
    screenType: 'ending',
  },
];

export const TOTAL_DEMO_DURATION = DEMO_CHAPTERS.reduce((acc, c) => acc + c.duration, 0); // 190s (~3:10)

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function SystemVideoDemo() {
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.9);
  const [showCaptions, setShowCaptions] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastNarratedChapterIdx = useRef<number>(-1);

  // Helper to determine current chapter based on elapsed seconds
  const getCurrentChapterInfo = useCallback(() => {
    let accumulated = 0;
    for (let i = 0; i < DEMO_CHAPTERS.length; i++) {
      const ch = DEMO_CHAPTERS[i];
      if (currentTime >= accumulated && currentTime < accumulated + ch.duration) {
        const chapterElapsed = currentTime - accumulated;
        const chapterProgress = chapterElapsed / ch.duration;
        return {
          chapter: ch,
          index: i,
          chapterElapsed,
          chapterProgress: Math.min(Math.max(chapterProgress, 0), 1),
        };
      }
      accumulated += ch.duration;
    }
    const lastChapter = DEMO_CHAPTERS[DEMO_CHAPTERS.length - 1];
    return {
      chapter: lastChapter,
      index: DEMO_CHAPTERS.length - 1,
      chapterElapsed: lastChapter.duration,
      chapterProgress: 1,
    };
  }, [currentTime]);

  const currentInfo = getCurrentChapterInfo();
  const currentChapter = currentInfo.chapter;
  const currentChapterIdx = currentInfo.index;

  // -------------------------------------------------------------
  // Natural Voice Narration Engine (Web Speech API)
  // -------------------------------------------------------------
  const speakNarration = useCallback(
    (text: string) => {
      if (isMuted || volume === 0) return;
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

      try {
        window.speechSynthesis.cancel(); // Stop any pending utterance

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.98 * playbackSpeed;
        utterance.pitch = 1.0;
        utterance.volume = volume;
        utterance.lang = 'en-US';

        const voices = window.speechSynthesis.getVoices();
        // Pick high-quality natural English voice if present
        const preferredVoice =
          voices.find(
            (v) =>
              (v.name.includes('Natural') ||
                v.name.includes('Google') ||
                v.name.includes('Samantha') ||
                v.name.includes('Karen') ||
                v.name.includes('Daniel') ||
                v.name.includes('Ava') ||
                v.name.includes('Zira') ||
                v.name.includes('Premium')) &&
              v.lang.startsWith('en'),
          ) || voices.find((v) => v.lang.startsWith('en'));

        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }

        window.speechSynthesis.speak(utterance);
      } catch {
        // Speech synthesis gracefully suppressed if unsupported
      }
    },
    [isMuted, volume, playbackSpeed],
  );

  const stopNarration = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  };

  // Trigger narration when entering a new chapter
  useEffect(() => {
    if (!isPlaying || !hasStarted) {
      stopNarration();
      return;
    }

    if (lastNarratedChapterIdx.current !== currentChapterIdx) {
      lastNarratedChapterIdx.current = currentChapterIdx;
      speakNarration(currentChapter.narration);
    }
  }, [currentChapterIdx, isPlaying, hasStarted, currentChapter.narration, speakNarration]);

  // Stop narration if user mutes
  useEffect(() => {
    if (isMuted) {
      stopNarration();
    } else if (isPlaying && hasStarted) {
      speakNarration(currentChapter.narration);
    }
  }, [isMuted, isPlaying, hasStarted, currentChapter.narration, speakNarration]);

  // Main video playback ticker
  useEffect(() => {
    if (!isPlaying || !hasStarted) return;

    const intervalMs = 100;
    const stepSeconds = (intervalMs / 1000) * playbackSpeed;

    const timer = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev + stepSeconds >= TOTAL_DEMO_DURATION) {
          setIsPlaying(false);
          stopNarration();
          return TOTAL_DEMO_DURATION;
        }
        return prev + stepSeconds;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, hasStarted, playbackSpeed]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // -------------------------------------------------------------
  // Control Handlers
  // -------------------------------------------------------------
  const handleStartDemo = () => {
    setHasStarted(true);
    setIsPlaying(true);
    setCurrentTime(0);
    lastNarratedChapterIdx.current = -1;
  };

  const handleTogglePlay = () => {
    if (!hasStarted) {
      handleStartDemo();
      return;
    }
    if (isPlaying) {
      setIsPlaying(false);
      stopNarration();
    } else {
      setIsPlaying(true);
      speakNarration(currentChapter.narration);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = pct * TOTAL_DEMO_DURATION;

    setCurrentTime(newTime);
    lastNarratedChapterIdx.current = -1;

    if (isPlaying) {
      stopNarration();
      const targetChapIdx = DEMO_CHAPTERS.findIndex((c, i) => {
        const start = DEMO_CHAPTERS.slice(0, i).reduce((s, x) => s + x.duration, 0);
        return newTime >= start && newTime < start + c.duration;
      });
      if (targetChapIdx !== -1) {
        speakNarration(DEMO_CHAPTERS[targetChapIdx].narration);
        lastNarratedChapterIdx.current = targetChapIdx;
      }
    }
  };

  const handleJumpToChapter = (index: number) => {
    const startTime = DEMO_CHAPTERS.slice(0, index).reduce((acc, c) => acc + c.duration, 0);
    setCurrentTime(startTime);
    lastNarratedChapterIdx.current = index;

    if (!hasStarted) {
      setHasStarted(true);
    }
    setIsPlaying(true);
    speakNarration(DEMO_CHAPTERS[index].narration);
  };

  const handleNextChapter = () => {
    const nextIdx = Math.min(DEMO_CHAPTERS.length - 1, currentChapterIdx + 1);
    handleJumpToChapter(nextIdx);
  };

  const handlePrevChapter = () => {
    const prevIdx = Math.max(0, currentChapterIdx - 1);
    handleJumpToChapter(prevIdx);
  };

  const handleReplay = () => {
    setCurrentTime(0);
    lastNarratedChapterIdx.current = -1;
    setIsPlaying(true);
    setHasStarted(true);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div id="system-video-demo" style={{ maxWidth: 1160, margin: '0 auto', width: '100%' }}>
      {/* Section Header */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 18px',
            borderRadius: 999,
            background: 'linear-gradient(135deg, rgba(35, 139, 69, 0.18), rgba(23, 107, 53, 0.08))',
            border: '1px solid rgba(35, 139, 69, 0.35)',
            marginBottom: 16,
            fontSize: 12,
            fontWeight: 800,
            color: '#238B45',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 18px rgba(35, 139, 69, 0.20)',
          }}
        >
          <Sparkles size={14} color="#238B45" /> Interactive System Walkthrough
        </div>

        <h2
          style={{
            fontSize: '40px',
            fontWeight: 900,
            color: 'var(--text)',
            letterSpacing: '-0.8px',
            lineHeight: 1.15,
            marginBottom: 12,
          }}
        >
          See AlpasFarm in Action
        </h2>

        <p
          style={{
            fontSize: '17px',
            color: 'var(--text-secondary)',
            maxWidth: 640,
            margin: '0 auto',
            lineHeight: 1.6,
            fontWeight: 500,
          }}
        >
          A smarter way to manage your goats and sheep. Watch the full walkthrough with synchronized voice narration.
        </p>
      </div>

      {/* Main Liquid Glass Video Player Container */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          borderRadius: 28,
          background: 'linear-gradient(135deg, rgba(16, 38, 60, 0.95), rgba(6, 21, 37, 0.96))',
          backdropFilter: 'blur(35px) saturate(180%)',
          WebkitBackdropFilter: 'blur(35px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow:
            'inset 0 1px 1px rgba(255, 255, 255, 0.25), 0 30px 80px rgba(0, 0, 0, 0.55), 0 0 60px rgba(35, 139, 69, 0.18)',
          overflow: 'hidden',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Top Floating Glass Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.01))',
            borderBottom: '1px solid rgba(255, 255, 255, 0.10)',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #238B45, #176B35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(35, 139, 69, 0.40)',
              }}
            >
              <currentChapter.icon size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.3px', color: '#fff' }}>
                {currentChapter.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{currentChapter.subtitle}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                padding: '4px 12px',
                borderRadius: 999,
                background: 'rgba(35, 139, 69, 0.18)',
                border: '1px solid rgba(35, 139, 69, 0.35)',
                color: '#66BB6A',
                fontWeight: 800,
              }}
            >
              {currentChapter.badge}
            </span>
          </div>
        </div>

        {/* Video Viewport Stage Area */}
        <div
          style={{
            position: 'relative',
            padding: '24px 28px',
            minHeight: 460,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background:
              'radial-gradient(circle at 50% 20%, rgba(255, 122, 24, 0.12) 0%, transparent 65%), radial-gradient(circle at 80% 80%, rgba(255, 59, 48, 0.08) 0%, transparent 55%)',
          }}
        >
          {/* Pre-Play Poster / Click to Start Overlay */}
          {!hasStarted && (
            <div
              onClick={handleStartDemo}
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 20,
                background: 'linear-gradient(135deg, rgba(6, 21, 37, 0.92), rgba(11, 28, 45, 0.95))',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 30,
                textAlign: 'center',
              }}
            >
              {/* Glowing Ambient Halo */}
              <div
                style={{
                  position: 'absolute',
                  width: 300,
                  height: 300,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255, 122, 24, 0.35) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }}
              />

              {/* Central Glowing Play Button */}
              <div
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(255, 59, 48, 0.92), rgba(255, 122, 24, 0.85))',
                  border: '2px solid rgba(255, 255, 255, 0.40)',
                  boxShadow:
                    'inset 0 2px 2px rgba(255, 255, 255, 0.5), 0 20px 50px rgba(255, 75, 43, 0.50), 0 0 35px rgba(255, 122, 24, 0.40)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 20,
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  transform: 'scale(1)',
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.transform = 'scale(1.10)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.transform = 'scale(1.00)')}
              >
                <Play size={40} fill="#fff" color="#fff" style={{ marginLeft: 6 }} />
              </div>

              <span
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                  color: '#238B45',
                  marginBottom: 8,
                }}
              >
                SYSTEM DEMO
              </span>

              <h3
                style={{
                  fontSize: '26px',
                  fontWeight: 900,
                  color: '#fff',
                  letterSpacing: '-0.5px',
                  marginBottom: 8,
                }}
              >
                Watch AlpasFarm Walkthrough
              </h3>

              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: 460, lineHeight: 1.5 }}>
                Click to start the interactive walkthrough with voice narration explaining every capability from animal registration to AI health analytics.
              </p>

              <button
                className="btn btn-primary"
                style={{
                  marginTop: 22,
                  padding: '12px 32px',
                  fontSize: 14,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Play size={16} fill="#fff" /> Watch Demo (with Voice)
              </button>
            </div>
          )}

          {/* Dynamic Mockup Screen for Current Chapter */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px 0 16px' }}>
            <SimulatedChapterView chapter={currentChapter} progress={currentInfo.chapterProgress} />
          </div>

          {/* Synchronized Voiceover Captions Glass Capsule */}
          {showCaptions && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(6, 21, 37, 0.90), rgba(11, 28, 45, 0.85))',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                borderLeft: '4px solid #238B45',
                boxShadow:
                  'inset 0 1px 0 rgba(255, 255, 255, 0.20), 0 15px 40px rgba(0, 0, 0, 0.40)',
                borderRadius: 18,
                padding: '14px 22px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                zIndex: 10,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: 'rgba(35, 139, 69, 0.20)',
                  border: '1px solid rgba(35, 139, 69, 0.40)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Volume2 size={16} color="#238B45" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#238B45', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 2 }}>
                  Voice Narration
                </div>
                <div style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 600, lineHeight: 1.5 }}>
                  "{currentChapter.narration}"
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scrubber Progress Bar */}
        <div style={{ padding: '0 24px', position: 'relative' }}>
          <div
            onClick={handleSeek}
            style={{
              height: 8,
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
            }}
            title="Click to seek"
          >
            <div
              style={{
                height: '100%',
                width: `${(currentTime / TOTAL_DEMO_DURATION) * 100}%`,
                background: 'linear-gradient(90deg, #238B45, #176B35)',
                boxShadow: '0 0 14px rgba(35, 139, 69, 0.8)',
                transition: isPlaying ? 'width 0.1s linear' : 'none',
              }}
            />
          </div>
        </div>

        {/* Bottom Control Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(0, 0, 0, 0.35))',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {/* Left Controls: Play/Pause, Prev, Next, Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleTogglePlay}
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #238B45, #176B35)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                boxShadow: '0 4px 16px rgba(35, 139, 69, 0.40)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 0.2s',
              }}
              title={isPlaying ? 'Pause Demo' : 'Play Demo'}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} fill="#fff" style={{ marginLeft: 2 }} />}
            </button>

            <button
              onClick={handlePrevChapter}
              className="btn-ghost"
              style={{ padding: 8, color: '#CBD5E0', borderRadius: '50%' }}
              title="Previous Chapter"
            >
              <SkipBack size={17} />
            </button>

            <button
              onClick={handleNextChapter}
              className="btn-ghost"
              style={{ padding: 8, color: '#CBD5E0', borderRadius: '50%' }}
              title="Next Chapter"
            >
              <SkipForward size={17} />
            </button>

            <button
              onClick={handleReplay}
              className="btn-ghost"
              style={{ padding: 8, color: '#CBD5E0', borderRadius: '50%' }}
              title="Replay from Beginning"
            >
              <RotateCcw size={16} />
            </button>

            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginLeft: 6 }}>
              {formatTime(currentTime)} / {formatTime(TOTAL_DEMO_DURATION)}
            </span>
          </div>

          {/* Chapter Quick Jump Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {DEMO_CHAPTERS.map((chap, idx) => (
              <button
                key={chap.id}
                onClick={() => handleJumpToChapter(idx)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background:
                    currentChapterIdx === idx
                      ? 'linear-gradient(135deg, #238B45, #176B35)'
                      : 'rgba(255, 255, 255, 0.06)',
                  color: currentChapterIdx === idx ? '#fff' : '#A7B8CC',
                  border:
                    currentChapterIdx === idx
                      ? '1px solid rgba(255, 255, 255, 0.35)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: currentChapterIdx === idx ? '0 4px 14px rgba(35, 139, 69, 0.35)' : 'none',
                }}
              >
                {idx + 1}. {chap.tag}
              </button>
            ))}
          </div>

          {/* Right Controls: Speed, Captions, Mute/Voice, Fullscreen */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Speed Toggle */}
            <button
              onClick={() => {
                const speeds = [1, 1.25, 1.5];
                const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                setPlaybackSpeed(next);
              }}
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: 11,
                fontWeight: 800,
                color: '#CBD5E0',
                cursor: 'pointer',
              }}
              title="Playback Speed"
            >
              {playbackSpeed}x SPEED
            </button>

            {/* Captions Toggle */}
            <button
              onClick={() => setShowCaptions(!showCaptions)}
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                background: showCaptions ? 'rgba(35, 139, 69, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                border: showCaptions ? '1px solid #238B45' : '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: 11,
                fontWeight: 800,
                color: showCaptions ? '#66BB6A' : '#CBD5E0',
                cursor: 'pointer',
              }}
              title="Toggle Captions"
            >
              CC
            </button>

            {/* Mute Voiceover Button */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="btn-ghost"
              style={{ padding: 8, color: isMuted ? '#FF3B30' : '#CBD5E0' }}
              title={isMuted ? 'Unmute Voice Narration' : 'Mute Voice Narration'}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="btn-ghost"
              style={{ padding: 8, color: '#CBD5E0' }}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Individual Chapter Screen Mockups (Real UI Walkthrough)
// -------------------------------------------------------------

// ─── Cursor waypoint system ──────────────────────────────────────────────────

interface CursorWaypoint {
  t: number;  // 0–1 normalized time within chapter
  x: number;  // % of container width
  y: number;  // % of container height
  click?: boolean;
  label?: string;
}

const CURSOR_PATHS: Record<DemoChapter['screenType'], CursorWaypoint[]> = {
  intro: [
    { t: 0.0, x: 50, y: 50 },
    { t: 0.4, x: 50, y: 62 },
    { t: 0.7, x: 50, y: 62, click: true, label: 'Get Started' },
    { t: 1.0, x: 50, y: 62 },
  ],
  dashboard: [
    { t: 0.0, x: 20, y: 20 },
    { t: 0.2, x: 22, y: 32, label: 'Total Animals' },
    { t: 0.35, x: 52, y: 32, label: 'Health Alerts' },
    { t: 0.55, x: 52, y: 32, click: true },
    { t: 0.7, x: 30, y: 60, label: 'Quick Action' },
    { t: 0.85, x: 30, y: 60, click: true },
    { t: 1.0, x: 75, y: 20 },
  ],
  add_animal: [
    { t: 0.0, x: 80, y: 10, label: '+ Add Animal' },
    { t: 0.15, x: 80, y: 10, click: true },
    { t: 0.3, x: 30, y: 35, label: 'Tag ID' },
    { t: 0.45, x: 30, y: 35, click: true },
    { t: 0.6, x: 68, y: 35, label: 'Breed' },
    { t: 0.75, x: 40, y: 60, label: 'Weight' },
    { t: 0.85, x: 40, y: 60, click: true },
    { t: 0.95, x: 72, y: 85, label: 'Save', click: true },
    { t: 1.0, x: 72, y: 85 },
  ],
  animal_profile: [
    { t: 0.0, x: 50, y: 20 },
    { t: 0.2, x: 25, y: 42, label: 'Health Risk' },
    { t: 0.4, x: 25, y: 42, click: true },
    { t: 0.55, x: 60, y: 55, label: 'Weight & Growth' },
    { t: 0.7, x: 60, y: 55, click: true },
    { t: 0.85, x: 80, y: 20, label: 'QR Code' },
    { t: 0.95, x: 80, y: 20, click: true },
    { t: 1.0, x: 80, y: 20 },
  ],
  health: [
    { t: 0.0, x: 30, y: 30 },
    { t: 0.2, x: 30, y: 40, label: 'Temperature' },
    { t: 0.4, x: 30, y: 40, click: true },
    { t: 0.55, x: 65, y: 40, label: 'Heart Rate' },
    { t: 0.7, x: 65, y: 40, click: true },
    { t: 0.85, x: 50, y: 75, label: 'Analyze', click: true },
    { t: 1.0, x: 50, y: 75 },
  ],
  illness_risk: [
    { t: 0.0, x: 50, y: 30 },
    { t: 0.25, x: 50, y: 45, label: 'Risk Score' },
    { t: 0.5, x: 25, y: 60, label: 'Detected Condition' },
    { t: 0.7, x: 25, y: 60, click: true },
    { t: 0.85, x: 70, y: 75, label: 'View Animal' },
    { t: 0.95, x: 70, y: 75, click: true },
    { t: 1.0, x: 70, y: 75 },
  ],
  breeding: [
    { t: 0.0, x: 20, y: 25 },
    { t: 0.2, x: 35, y: 35, label: 'Mating Date' },
    { t: 0.4, x: 35, y: 35, click: true },
    { t: 0.55, x: 65, y: 35, label: 'Expected Kidding' },
    { t: 0.7, x: 50, y: 65, label: 'Status: Pregnant' },
    { t: 0.85, x: 50, y: 65, click: true },
    { t: 1.0, x: 75, y: 20 },
  ],
  weight: [
    { t: 0.0, x: 20, y: 20 },
    { t: 0.2, x: 50, y: 45, label: 'Weight Chart' },
    { t: 0.45, x: 70, y: 55, label: 'Growth Trend' },
    { t: 0.65, x: 70, y: 55, click: true },
    { t: 0.8, x: 35, y: 75, label: 'Record Weight' },
    { t: 0.9, x: 35, y: 75, click: true },
    { t: 1.0, x: 50, y: 50 },
  ],
  inventory: [
    { t: 0.0, x: 30, y: 25 },
    { t: 0.2, x: 30, y: 42, label: 'Rice Bran' },
    { t: 0.35, x: 30, y: 42, click: true },
    { t: 0.5, x: 62, y: 42, label: 'Current Stock' },
    { t: 0.65, x: 78, y: 55, label: 'Record Usage' },
    { t: 0.75, x: 78, y: 55, click: true },
    { t: 0.88, x: 55, y: 70, label: 'Confirm' },
    { t: 0.95, x: 55, y: 70, click: true },
    { t: 1.0, x: 55, y: 70 },
  ],
  ai_assistant: [
    { t: 0.0, x: 88, y: 88, label: 'AI Cloud' },
    { t: 0.2, x: 88, y: 88, click: true },
    { t: 0.35, x: 50, y: 65, label: 'Type question' },
    { t: 0.5, x: 50, y: 65, click: true },
    { t: 0.7, x: 82, y: 72, label: 'Send' },
    { t: 0.8, x: 82, y: 72, click: true },
    { t: 0.95, x: 50, y: 45, label: 'AI Response' },
    { t: 1.0, x: 50, y: 45 },
  ],
  ending: [
    { t: 0.0, x: 50, y: 40 },
    { t: 0.3, x: 50, y: 55, label: 'One Platform' },
    { t: 0.6, x: 50, y: 68, label: 'Get Started' },
    { t: 0.75, x: 50, y: 68, click: true },
    { t: 0.9, x: 50, y: 68 },
    { t: 1.0, x: 50, y: 68 },
  ],
};

/** Smooth cubic ease-in-out interpolation */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/** Interpolate cursor position between waypoints */
function interpolateCursor(waypoints: CursorWaypoint[], progress: number): { x: number; y: number; click: boolean; label: string } {
  if (waypoints.length === 0) return { x: 50, y: 50, click: false, label: '' };
  if (progress <= waypoints[0].t) return { x: waypoints[0].x, y: waypoints[0].y, click: false, label: '' };
  if (progress >= waypoints[waypoints.length - 1].t) {
    const last = waypoints[waypoints.length - 1];
    return { x: last.x, y: last.y, click: !!last.click, label: last.label ?? '' };
  }
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    if (progress >= a.t && progress <= b.t) {
      const span = b.t - a.t;
      const local = span > 0 ? (progress - a.t) / span : 0;
      const t = easeInOut(local);
      const isNearClick = b.click && local > 0.85;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        click: !!isNearClick,
        label: isNearClick ? (b.label ?? '') : (local > 0.3 ? (b.label ?? '') : (a.label ?? '')),
      };
    }
  }
  const last = waypoints[waypoints.length - 1];
  return { x: last.x, y: last.y, click: false, label: last.label ?? '' };
}

// ─── Cursor SVG ───────────────────────────────────────────────────────────────

function DemoCursor({ x, y, clicking, label, visible }: { x: number; y: number; clicking: boolean; label: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-4px, -4px)',
        pointerEvents: 'none',
        zIndex: 50,
        transition: 'left 0.12s cubic-bezier(0.25,0.46,0.45,0.94), top 0.12s cubic-bezier(0.25,0.46,0.45,0.94)',
      }}
    >
      {/* Click ripple */}
      {clicking && (
        <div style={{
          position: 'absolute',
          width: 32, height: 32,
          borderRadius: '50%',
          border: '2px solid rgba(255,122,24,0.7)',
          top: -12, left: -12,
          animation: 'none',
          opacity: 0.8,
          transform: 'scale(1.2)',
          transition: 'all 0.15s',
        }} />
      )}
      {/* Cursor SVG */}
      <svg width="22" height="28" viewBox="0 0 22 28" fill="none">
        <filter id="cs">
          <feDropShadow dx="1" dy="2" stdDeviation="1.5" floodColor="rgba(0,0,0,0.5)" />
        </filter>
        <path
          d="M4 2L4 22L9 17L13 26L15.5 25L11.5 16L18 16Z"
          fill={clicking ? '#238B45' : '#ffffff'}
          stroke="#333"
          strokeWidth="1"
          filter="url(#cs)"
          style={{ transition: 'fill 0.1s' }}
        />
      </svg>
      {/* Label tooltip */}
      {label && (
        <div style={{
          position: 'absolute',
          left: 20,
          top: -4,
          background: 'rgba(0,0,0,0.82)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(35, 139, 69, 0.5)',
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 10,
          fontWeight: 700,
          color: '#66BB6A',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}>
          {label}
        </div>
      )}
    </div>
  );
}

// ─── Updated SimulatedChapterView with cursor ────────────────────────────────

function SimulatedChapterView({ chapter, progress }: { chapter: DemoChapter; progress: number }) {
  const waypoints = CURSOR_PATHS[chapter.screenType] ?? [];
  const cursor = interpolateCursor(waypoints, progress);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 880,
        borderRadius: 20,
        background: 'linear-gradient(135deg, rgba(8, 24, 42, 0.95), rgba(4, 15, 28, 0.95))',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.20)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Animated cursor overlay — rendered on top of everything */}
      <DemoCursor
        x={cursor.x}
        y={cursor.y}
        clicking={cursor.click}
        label={cursor.label}
        visible={true}
      />
      {/* Mock Browser Topbar */}
      <div
        style={{
          padding: '10px 18px',
          background: 'rgba(5, 17, 30, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF3B30' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF9F0A' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#238B45' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 8, fontFamily: 'monospace' }}>
            app.alpasfarm.ph/{chapter.screenType.replace('_', '-')}
          </span>
        </div>

        <div
          style={{
            padding: '3px 10px',
            borderRadius: 6,
            background: `${chapter.color}22`,
            border: `1px solid ${chapter.color}55`,
            fontSize: 11,
            fontWeight: 800,
            color: chapter.color,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <chapter.icon size={13} /> {chapter.tag}
        </div>
      </div>

      {/* Dynamic Chapter Screen Content */}
      <div style={{ padding: '22px 24px', minHeight: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {chapter.screenType === 'intro' && <IntroScreen progress={progress} />}
        {chapter.screenType === 'dashboard' && <DashboardScreen progress={progress} />}
        {chapter.screenType === 'add_animal' && <AddAnimalScreen progress={progress} />}
        {chapter.screenType === 'animal_profile' && <AnimalProfileScreen progress={progress} />}
        {chapter.screenType === 'health' && <HealthScreen progress={progress} />}
        {chapter.screenType === 'illness_risk' && <IllnessRiskScreen progress={progress} />}
        {chapter.screenType === 'breeding' && <BreedingScreen progress={progress} />}
        {chapter.screenType === 'weight' && <WeightScreen progress={progress} />}
        {chapter.screenType === 'inventory' && <InventoryScreen progress={progress} />}
        {chapter.screenType === 'ai_assistant' && <AIAssistantScreen progress={progress} />}
        {chapter.screenType === 'ending' && <EndingScreen progress={progress} />}
      </div>
    </div>
  );
}

// 1. Intro Screen
function IntroScreen({ progress }: { progress: number }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 10px' }}>
      <div
        style={{
          width: 68,
          height: 68,
          borderRadius: 20,
          background: 'linear-gradient(135deg, #238B45, #176B35)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 30px rgba(35, 139, 69, 0.45)',
          marginBottom: 16,
          transform: `scale(${1 + Math.sin(progress * Math.PI) * 0.05})`,
          transition: 'transform 0.2s',
        }}
      >
        <Flame size={36} color="#fff" />
      </div>
      <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#fff', marginBottom: 8, letterSpacing: '-0.5px' }}>
        ALPASFARM
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto 16px', lineHeight: 1.5 }}>
        Smart Farm Management System for Goats & Sheep. Complete recordkeeping, automated illness risk indicators, breeding genealogy & AI assistance.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
        <span className="badge badge-healthy">Livestock Records</span>
        <span className="badge badge-healthy">ML Disease AI</span>
        <span className="badge badge-healthy">QR Ear Tags</span>
      </div>
    </div>
  );
}

// 2. Dashboard Screen
function DashboardScreen({ progress }: { progress: number }) {
  return (
    <div>
      {/* 3 Stat Cards on top */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
        <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Total Animals</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginTop: 2 }}>42 Head</div>
          <div style={{ fontSize: 9, color: '#238B45', marginTop: 2 }}>+4 this month</div>
        </div>
        <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(35,139,69,0.3)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Healthy Herd</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#238B45', marginTop: 2 }}>95.2%</div>
          <div style={{ fontSize: 9, color: '#238B45', marginTop: 2 }}>Optimal vitals</div>
        </div>
        <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Health Alerts</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#EF4444', marginTop: 2 }}>1 Alert</div>
          <div style={{ fontSize: 9, color: '#EF4444', marginTop: 2 }}>Requires check</div>
        </div>
      </div>

      {/* Quick Actions row */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'hidden', paddingBottom: 6 }}>
        <div style={{ padding: '6px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={12} color="#238B45" /> Add Animal
        </div>
        <div style={{ padding: '6px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <HeartPulse size={12} color="#238B45" /> Health Check
        </div>
        <div style={{ padding: '6px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Scale size={12} color="#238B45" /> Record Weight
        </div>
        <div style={{ padding: '6px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Baby size={12} color="#238B45" /> Breeding
        </div>
      </div>
    </div>
  );
}

// 3. Add Animal Screen
function AddAnimalScreen({ progress }: { progress: number }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 18, border: '1px solid rgba(35,139,69,0.3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>New Animal Registration Form</div>
        <span style={{ fontSize: 10, background: '#EAF6ED', color: '#174B2A', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>
          Auto-generating QR...
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Tag ID</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#238B45' }}>TAG-BOER-045</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Species & Breed</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Goat • Purebred Boer</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Sex & Birth Date</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Buck (Male) • Jan 12, 2024</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Initial Weight</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#238B45' }}>46.8 kg</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-primary btn-sm" style={{ padding: '6px 18px' }}>
          <Check size={14} /> Save Animal to Database
        </button>
      </div>
    </div>
  );
}

// 4. Animal Profile Screen
function AnimalProfileScreen({ progress }: { progress: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #238B45, #176B35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PawPrint size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>Boer Champion #042</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>TAG #BOER-042 • 2.5 yrs</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          Status: <strong style={{ color: '#238B45' }}>Healthy</strong> • Pen A-1 • Weight: 68.4 kg
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <span className="badge badge-healthy">Vaccinated</span>
          <span className="badge badge-healthy">Breeding Sire</span>
        </div>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#238B45', marginBottom: 4 }}>
            QR FIELD TAG EMBEDDED
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Direct URL: <span style={{ fontFamily: 'monospace', color: '#fff' }}>alpasfarm.ph/public/boer-042</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
          3-Generation Pedigree verified · No inbreeding risk detected
        </div>
      </div>
    </div>
  );
}

// 5. Health Screen
function HealthScreen({ progress }: { progress: number }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <HeartPulse size={16} color="#238B45" /> Daily Vitals & Clinical Observation Log
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Temperature</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#238B45', marginTop: 2 }}>39.1 °C</div>
          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Normal range</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>FAMACHA Score</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#238B45', marginTop: 2 }}>Score 2</div>
          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Optimal red</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Rumen / Appetite</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#238B45', marginTop: 2 }}>Active</div>
          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Normal grazing</div>
        </div>
      </div>
    </div>
  );
}

// 6. Illness Risk Screen
function IllnessRiskScreen({ progress }: { progress: number }) {
  return (
    <div style={{ background: 'linear-gradient(135deg, rgba(255,59,48,0.18), rgba(10,26,44,0.92))', borderRadius: 16, padding: 18, border: '1px solid rgba(255,59,48,0.45)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <AlertTriangle size={18} color="#FF3B30" />
        <span style={{ fontSize: 12, fontWeight: 800, color: '#FF3B30', textTransform: 'uppercase' }}>
          Statistical Anomaly & Risk Indicator
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
        Elevated Fever Detected in Animal #TAG-018 (39.9°C)
      </div>
      <p style={{ fontSize: 12, color: '#E2E8F0', lineHeight: 1.45, marginBottom: 12 }}>
        Automated anomaly score highlighted unusual temperature reading. Early intervention advised: isolate doe and verify with farm veterinarian. (Risk indicator based on historical baseline).
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <span className="badge badge-red">High Priority Alert</span>
        <span className="badge badge-orange">Isolate in Pen B</span>
      </div>
    </div>
  );
}

// 7. Breeding Screen
function BreedingScreen({ progress }: { progress: number }) {
  return (
    <div style={{ background: 'rgba(35,139,69,0.08)', borderRadius: 16, padding: 16, border: '1px solid rgba(35,139,69,0.3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#238B45' }}>GESTATION COUNTDOWN (Doe #BELLA)</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>Day 115 / 150 (76%)</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.4)', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ height: '100%', width: '76%', background: 'linear-gradient(90deg, #238B45, #176B35)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11 }}>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 8 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Sire: </span>
          <strong style={{ color: '#fff' }}>#BOER-CHAMPION (Inbreeding: 0.0% Safe)</strong>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 8 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Expected Kidding: </span>
          <strong style={{ color: '#238B45' }}>Sept 18 (20 days to pen)</strong>
        </div>
      </div>
    </div>
  );
}

// 8. Weight Screen
function WeightScreen({ progress }: { progress: number }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Weight Growth & Daily Gain Trajectory</span>
        <span style={{ fontSize: 11, color: '#238B45', fontWeight: 700 }}>+0.28 kg/day ADG</span>
      </div>
      <div style={{ height: 90, display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        {[38, 41, 45, 50, 54, 59, 64, 68.4].map((w, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: '100%', height: `${(w / 75) * 70}px`, background: 'linear-gradient(180deg, #238B45, #176B35)', borderRadius: 4 }} />
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Wk {i + 1}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
        Polynomial growth model fit: R² = 0.96 · Target market weight (70kg) reached in 12 days.
      </div>
    </div>
  );
}

// 9. Inventory Screen
function InventoryScreen({ progress }: { progress: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#238B45', marginBottom: 6 }}>FEED & MEDICINE STOCK</div>
        <div style={{ fontSize: 12, color: '#fff', marginBottom: 4 }}>• Alfalfa Pellets: <strong style={{ color: '#238B45' }}>42 bags</strong></div>
        <div style={{ fontSize: 12, color: '#fff', marginBottom: 4 }}>• CDT Vaccine: <strong style={{ color: '#238B45' }}>8 vials (Exp: Nov 2026)</strong></div>
        <div style={{ fontSize: 12, color: '#fff' }}>• Dewormer: <strong style={{ color: '#238B45' }}>14 doses</strong></div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#238B45', marginBottom: 6 }}>DAILY MILK YIELD</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>48.5 L / day</div>
        <div style={{ fontSize: 11, color: '#238B45', marginTop: 2 }}>+12% yield improvement</div>
      </div>
    </div>
  );
}

// 10. AI Assistant Screen
function AIAssistantScreen({ progress }: { progress: number }) {
  return (
    <div style={{ background: 'linear-gradient(135deg, rgba(35,139,69,0.12), rgba(6,21,37,0.95))', borderRadius: 16, padding: 16, border: '1px solid rgba(35,139,69,0.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Brain size={18} color="#238B45" />
        <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>AlpasFarm AI Smart Farm Assistant</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 10, fontSize: 12, color: '#E2E8F0', marginBottom: 8 }}>
        <em>"Farmer Marlon, 3 does in Pen A are due for CDT boosters this Friday, and Feed conversion is up 14%."</em>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <span className="badge badge-healthy">Tagalog/English Ready</span>
        <span className="badge badge-healthy">Real-Time Sync</span>
      </div>
    </div>
  );
}

// 11. Ending Screen
function EndingScreen({ progress }: { progress: number }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px 10px' }}>
      <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#fff', marginBottom: 6 }}>
        Transform Your Farm with AlpasFarm
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: 440, margin: '0 auto 16px' }}>
        Join modern livestock raisers adopting data-driven herd health, breeding tracking & AI optimization.
      </p>
      <a
        href="/login"
        className="btn btn-primary"
        style={{
          padding: '12px 32px',
          fontSize: 14,
          fontWeight: 800,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        Get Started Now <ArrowRight size={16} />
      </a>
    </div>
  );
}
