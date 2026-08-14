import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  FastForward,
  Settings,
  Upload,
  Check,
  Sparkles,
  PawPrint,
  HeartPulse,
  Syringe,
  Heart,
  ScanLine,
  Package,
  FileCheck,
  Cpu,
  LucideIcon,
} from 'lucide-react';

interface Chapter {
  id: string;
  title: string;
  subtitle: string;
  duration: number; // in seconds
  icon: LucideIcon;
  color: string;
  tag: string;
  caption: string;
  badge: string;
  screenType: 'animals' | 'health' | 'vaccine' | 'breeding' | 'inventory' | 'scanner';
}

const CHAPTERS: Chapter[] = [
  {
    id: 'animals',
    title: '1. Livestock Registration & QR Tagging',
    subtitle: 'Register goats & sheep with unique IDs, weights, and printable QR tags',
    duration: 18,
    icon: PawPrint,
    color: '#FF4B2B',
    tag: 'Animal Management',
    badge: 'Step 1: Onboarding',
    caption: 'Easily register every animal with RFID/Tag IDs, breeds, weight history, and photos. Automatically generate QR tags for rapid identification in the paddock.',
    screenType: 'animals'
  },
  {
    id: 'health',
    title: '2. Daily Health Vitals & AI Diagnostics',
    subtitle: 'Log symptoms, temperature, vitals, and get instant AI risk assessments',
    duration: 20,
    icon: HeartPulse,
    color: '#EF4444',
    tag: 'AI Health Guard',
    badge: 'Step 2: AI Health',
    caption: 'Record temperature, eye membrane condition (FAMACHA score), and respiratory symptoms. Built-in AI instantly flags critical pneumonia, bloat, and mastitis risks.',
    screenType: 'health'
  },
  {
    id: 'vaccine',
    title: '3. Vaccination Schedules & Smart Alerts',
    subtitle: 'Automated deworming & vaccine tracking with push/SMS reminders',
    duration: 16,
    icon: Syringe,
    color: '#F59E0B',
    tag: 'Preventive Care',
    badge: 'Step 3: Immunity',
    caption: 'Schedule CDT, Dewormers, and Vitamins. AlpasFarm automatically alerts you before due dates so no animal misses critical immunizations.',
    screenType: 'vaccine'
  },
  {
    id: 'breeding',
    title: '4. Breeding, Inbreeding Check & Kidding',
    subtitle: 'Track mating, gestation countdowns, inbreeding coefficient & kid records',
    duration: 18,
    icon: Heart,
    color: '#EC4899',
    tag: 'Genetics & Fertility',
    badge: 'Step 4: Reproduction',
    caption: 'Record sire & dam pairing with automatic inbreeding coefficient checks. Track estimated kidding dates with automated gestation milestone reminders.',
    screenType: 'breeding'
  },
  {
    id: 'inventory',
    title: '5. Feed, Milk Yields & Inventory Supplies',
    subtitle: 'Track stock depletion, daily milk production, and feed conversion',
    duration: 18,
    icon: Package,
    color: '#FF7A18',
    tag: 'Supplies & Yield',
    badge: 'Step 5: Operations',
    caption: 'Monitor feed stocks, medication batches, and daily milk yield per doe. Receive instant alerts when supplies reach minimum reorder thresholds.',
    screenType: 'inventory'
  },
  {
    id: 'scanner',
    title: '6. Field QR Scanner & Real-Time Reports',
    subtitle: 'Scan ear tags in seconds with your phone camera & export farm reports',
    duration: 15,
    icon: ScanLine,
    color: '#FF9F0A',
    tag: 'QR Tag & Audit',
    badge: 'Step 6: Traceability',
    caption: 'Scan animal ear tags directly with any phone or tablet. Instant offline-capable lookup with full health and pedigree audit trails.',
    screenType: 'scanner'
  }
];

const TOTAL_DURATION = CHAPTERS.reduce((acc, c) => acc + c.duration, 0); // 105 seconds

export function SystemVideoDemo() {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [videoMode, setVideoMode] = useState<'interactive' | 'custom'>(() => {
    return localStorage.getItem('alpasfarm_video_source') ? 'custom' : 'interactive';
  });
  const [customVideoUrl, setCustomVideoUrl] = useState<string>(() => {
    return localStorage.getItem('alpasfarm_video_source') || '';
  });
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const nativeVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine current chapter based on currentTime
  const getCurrentChapterInfo = () => {
    let accumulated = 0;
    for (let i = 0; i < CHAPTERS.length; i++) {
      const ch = CHAPTERS[i];
      if (currentTime >= accumulated && currentTime < accumulated + ch.duration) {
        const chapterProgress = (currentTime - accumulated) / ch.duration;
        return {
          chapter: ch,
          index: i,
          chapterTime: currentTime - accumulated,
          chapterProgress: Math.min(Math.max(chapterProgress, 0), 1),
        };
      }
      accumulated += ch.duration;
    }
    const lastChapter = CHAPTERS[CHAPTERS.length - 1];
    return {
      chapter: lastChapter,
      index: CHAPTERS.length - 1,
      chapterTime: lastChapter.duration,
      chapterProgress: 1,
    };
  };

  const { chapter: currentChapter, index: currentChapterIndex, chapterProgress } = getCurrentChapterInfo();

  // Timer loop for interactive simulation
  useEffect(() => {
    if (videoMode !== 'interactive' || !isPlaying) return;

    const intervalMs = 100;
    const timer = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + (intervalMs / 1000) * playbackSpeed;
        if (next >= TOTAL_DURATION) {
          return 0; // loop back to beginning
        }
        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, videoMode]);

  // Jump to specific chapter
  const jumpToChapter = (index: number) => {
    let time = 0;
    for (let i = 0; i < index; i++) {
      time += CHAPTERS[i].duration;
    }
    setCurrentTime(time);
    setIsPlaying(true);
  };

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Fullscreen handler
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Handle custom video upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomVideoUrl(url);
      setUploadedFileName(file.name);
      setVideoMode('custom');
      localStorage.setItem('alpasfarm_video_source', url);
      setShowSettingsModal(false);
    }
  };

  const handleSetCustomUrl = (url: string) => {
    setCustomVideoUrl(url);
    if (url.trim()) {
      setVideoMode('custom');
      localStorage.setItem('alpasfarm_video_source', url);
    } else {
      setVideoMode('interactive');
      localStorage.removeItem('alpasfarm_video_source');
    }
    setShowSettingsModal(false);
  };

  // Parse YouTube or direct video URL
  const isYouTubeUrl = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be');
  };

  const getYouTubeEmbedUrl = (url: string) => {
    try {
      if (url.includes('youtu.be/')) {
        const id = url.split('youtu.be/')[1].split('?')[0];
        return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      }
      const match = url.match(/[?&]v=([^&]+)/);
      if (match && match[1]) {
        return `https://www.youtube.com/embed/${match[1]}?autoplay=1&rel=0`;
      }
    } catch {
      // fallback
    }
    return url;
  };

  return (
    <div
      id="system-video-demo"
      style={{
        width: '100%',
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 20px',
      }}
    >
      {/* Section Header */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 999,
            background: 'linear-gradient(135deg, rgba(255, 75, 43, 0.15), rgba(255, 122, 24, 0.1))',
            border: '1px solid rgba(255, 75, 43, 0.3)',
            marginBottom: 16,
            fontSize: 12,
            fontWeight: 800,
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}
        >
          <Sparkles size={14} /> See AlpasFarm in Action
        </div>
        <h2
          style={{
            fontSize: '40px',
            fontWeight: 900,
            color: 'var(--text)',
            letterSpacing: '-0.5px',
            marginBottom: 12,
          }}
        >
          How the System Works
        </h2>
        <p
          style={{
            fontSize: 16,
            color: 'var(--text-secondary)',
            maxWidth: 680,
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          Watch the end-to-end workflow of AlpasFarm — from onboarding your flock with QR tags to AI health risk diagnostics, breeding tracking, and real-time mobile scanning.
        </p>
      </div>

      {/* Main Showcase Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 24,
        }}
      >
        {/* Video Player Container */}
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            borderRadius: isFullscreen ? 0 : 20,
            overflow: 'hidden',
            background: '#040d18',
            border: isFullscreen ? 'none' : '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: isFullscreen
              ? 'none'
              : '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(255, 75, 43, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            aspectRatio: isFullscreen ? 'auto' : '16/9',
            minHeight: isFullscreen ? '100vh' : 440,
          }}
        >
          {/* Top Bar inside Video */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              padding: '14px 20px',
              background: 'linear-gradient(180deg, rgba(4, 13, 24, 0.85) 0%, rgba(4, 13, 24, 0) 100%)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 15,
              pointerEvents: 'auto',
            }}
          >
            {/* Live Indicator & Current Step Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#EF4444',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#EF4444',
                    boxShadow: '0 0 8px #EF4444',
                  }}
                />
                {videoMode === 'interactive' ? 'Interactive Demo' : 'Video Player'}
              </div>

              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>{currentChapter.badge}</span>
                <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>•</span>
                <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{currentChapter.title}</span>
              </div>
            </div>

            {/* Video Source Switcher & Settings */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setShowSettingsModal(true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s ease',
                }}
                title="Change Video Source / Upload Video"
              >
                <Settings size={14} />
                <span>Source</span>
              </button>
            </div>
          </div>

          {/* Video Content Layer */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              background: '#061322',
            }}
          >
            {videoMode === 'custom' && customVideoUrl ? (
              isYouTubeUrl(customVideoUrl) ? (
                <iframe
                  src={getYouTubeEmbedUrl(customVideoUrl)}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="AlpasFarm System Walkthrough Video"
                />
              ) : (
                <video
                  ref={nativeVideoRef}
                  src={customVideoUrl}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  controls={false}
                  autoPlay={isPlaying}
                  muted={isMuted}
                  loop
                  onTimeUpdate={() => {
                    if (nativeVideoRef.current) {
                      setCurrentTime(nativeVideoRef.current.currentTime);
                    }
                  }}
                />
              )
            ) : (
              /* Interactive Animated Mockup Screen */
              <InteractiveScreenSimulation
                chapter={currentChapter}
                progress={chapterProgress}
                isPlaying={isPlaying}
                onJumpToChapter={jumpToChapter}
              />
            )}

            {/* Big Center Play/Pause Overlay Button */}
            {!isPlaying && (
              <div
                onClick={() => setIsPlaying(true)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0, 0, 0, 0.45)',
                  backdropFilter: 'blur(3px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 20,
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 40px rgba(255, 75, 43, 0.6), 0 8px 24px rgba(0,0,0,0.5)',
                  }}
                >
                  <Play size={36} color="#fff" style={{ marginLeft: 4 }} />
                </div>
              </div>
            )}
          </div>

          {/* Video Explanatory Caption Banner */}
          <div
            style={{
              padding: '12px 24px',
              background: 'rgba(8, 24, 42, 0.95)',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `${currentChapter.color}22`,
                  border: `1px solid ${currentChapter.color}55`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <currentChapter.icon size={18} color={currentChapter.color} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: currentChapter.color, textTransform: 'uppercase' }}>
                  {currentChapter.tag}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: '#E2E8F0',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {currentChapter.caption}
                </div>
              </div>
            </div>

            {/* Sound toggle & Narrator indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setIsMuted(!isMuted)}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: isMuted ? 'var(--text-tertiary)' : 'var(--text)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                <span style={{ fontSize: 11, fontWeight: 600 }}>{isMuted ? 'Muted' : 'Audio On'}</span>
              </button>
            </div>
          </div>

          {/* Bottom Player Controls Bar */}
          <div
            style={{
              padding: '12px 20px',
              background: 'rgba(4, 13, 24, 0.98)',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              zIndex: 15,
            }}
          >
            {/* Seek Bar with Chapter Markers */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: 8,
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.15)',
                cursor: 'pointer',
                overflow: 'hidden',
              }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                const targetTime = pos * TOTAL_DURATION;
                setCurrentTime(targetTime);
                if (nativeVideoRef.current) {
                  nativeVideoRef.current.currentTime = targetTime;
                }
              }}
            >
              {/* Progress Fill */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${(currentTime / TOTAL_DURATION) * 100}%`,
                  background: 'linear-gradient(90deg, #FF4B2B, #FF7A18)',
                  borderRadius: 4,
                  boxShadow: '0 0 10px rgba(255, 75, 43, 0.8)',
                  transition: 'width 0.1s linear',
                }}
              />

              {/* Chapter division ticks */}
              {CHAPTERS.map((ch, idx) => {
                let prevTime = 0;
                for (let k = 0; k < idx; k++) prevTime += CHAPTERS[k].duration;
                const leftPercent = (prevTime / TOTAL_DURATION) * 100;
                if (idx === 0) return null;
                return (
                  <div
                    key={ch.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${leftPercent}%`,
                      width: 2,
                      background: 'rgba(0, 0, 0, 0.6)',
                      zIndex: 2,
                    }}
                  />
                );
              })}
            </div>

            {/* Action Buttons & Time Stamps */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {/* Left: Play/Pause, Rewind, Time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 4,
                  }}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>

                <button
                  onClick={() => {
                    setCurrentTime(0);
                    if (nativeVideoRef.current) nativeVideoRef.current.currentTime = 0;
                    setIsPlaying(true);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 4,
                  }}
                  title="Restart Walkthrough"
                >
                  <RotateCcw size={16} />
                </button>

                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)', fontFamily: 'monospace' }}>
                  {formatTime(currentTime)} / {formatTime(TOTAL_DURATION)}
                </span>
              </div>

              {/* Right: Playback Speed, Fullscreen */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Speed selector */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      style={{
                        background: playbackSpeed === speed ? 'var(--accent)' : 'rgba(255, 255, 255, 0.08)',
                        border: 'none',
                        color: '#fff',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>

                <div style={{ width: 1, height: 16, background: 'rgba(255, 255, 255, 0.15)' }} />

                {/* Fullscreen Button */}
                <button
                  onClick={toggleFullscreen}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 4,
                  }}
                  title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Chapter Navigation Selector Cards */}
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <FastForward size={14} color="var(--accent)" /> Click Any Chapter to Jump Straight In
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {CHAPTERS.map((ch, idx) => {
              const isCurrent = currentChapterIndex === idx;
              return (
                <div
                  key={ch.id}
                  onClick={() => jumpToChapter(idx)}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 14,
                    background: isCurrent
                      ? 'linear-gradient(135deg, rgba(255, 75, 43, 0.15), rgba(255, 122, 24, 0.08))'
                      : 'var(--surface)',
                    border: isCurrent
                      ? '1px solid rgba(255, 75, 43, 0.45)'
                      : '1px solid var(--border-light)',
                    backdropFilter: 'var(--glass-blur)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isCurrent ? '0 8px 24px rgba(255, 75, 43, 0.15)' : 'none',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: isCurrent
                        ? 'linear-gradient(135deg, var(--accent), var(--accent-secondary))'
                        : `${ch.color}20`,
                      color: isCurrent ? '#fff' : ch.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <ch.icon size={18} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          color: isCurrent ? 'var(--accent)' : 'var(--text)',
                        }}
                      >
                        {ch.title}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--text-tertiary)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {ch.duration}s
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4,
                        margin: 0,
                      }}
                    >
                      {ch.subtitle}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Settings / Custom Video Modal */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              padding: 28,
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 20, fontWeight: 900, marginBottom: 8, color: 'var(--text)' }}>
              Video Source Settings
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              You can play the built-in animated interactive walkthrough simulation, or embed an external MP4/YouTube video recording.
            </p>

            {/* Option 1: Built-in Interactive Simulation */}
            <div
              onClick={() => handleSetCustomUrl('')}
              style={{
                padding: 16,
                borderRadius: 12,
                border: videoMode === 'interactive' ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                background: videoMode === 'interactive' ? 'rgba(255, 75, 43, 0.08)' : 'var(--surface)',
                cursor: 'pointer',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Sparkles size={20} color="var(--accent)" />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
                    Built-in Interactive Walkthrough Demo
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Auto-animated feature tour with chapter timeline
                  </div>
                </div>
              </div>
              {videoMode === 'interactive' && <Check size={18} color="var(--accent)" />}
            </div>

            {/* Option 2: Custom URL / YouTube Embed */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                Or Enter Video URL (YouTube or direct .mp4 link):
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=... or /video.mp4"
                  defaultValue={customVideoUrl}
                  id="custom-video-input"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('custom-video-input') as HTMLInputElement;
                    if (input) handleSetCustomUrl(input.value);
                  }}
                  className="btn btn-primary"
                  style={{ padding: '10px 18px', fontSize: 13 }}
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Option 3: Local File Upload */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                Or Upload Screen Recording (.mp4 / .webm):
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: '1px dashed var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Upload size={16} />
                {uploadedFileName ? `Selected: ${uploadedFileName}` : 'Choose Video File from Computer'}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="btn btn-secondary"
                style={{ padding: '8px 20px', fontSize: 13 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Interactive Screen Simulation (Rendered inside the video screen)
// -------------------------------------------------------------
interface ScreenProps {
  chapter: Chapter;
  progress: number;
  isPlaying: boolean;
  onJumpToChapter: (idx: number) => void;
}

function InteractiveScreenSimulation({ chapter, progress }: ScreenProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '30px 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: `radial-gradient(circle at 50% 30%, ${chapter.color}15 0%, #051322 75%)`,
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Background Grid Pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
        }}
      />

      {/* Screen Frame Container */}
      <div
        style={{
          width: '100%',
          maxWidth: 960,
          background: 'rgba(10, 26, 44, 0.88)',
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          border: `1px solid ${chapter.color}44`,
          boxShadow: `0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px ${chapter.color}20`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 5,
        }}
      >
        {/* App Mockup Browser Header */}
        <div
          style={{
            padding: '10px 16px',
            background: 'rgba(5, 17, 30, 0.9)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF3B30' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF9F0A' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF7A18' }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 8, fontFamily: 'monospace' }}>
              app.alpasfarm.ph/{chapter.screenType}
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

        {/* Dynamic Screen Content based on current chapter */}
        <div style={{ padding: '20px 24px', minHeight: 280, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {chapter.screenType === 'animals' && <AnimalsScreenMockup progress={progress} />}
          {chapter.screenType === 'health' && <HealthScreenMockup progress={progress} />}
          {chapter.screenType === 'vaccine' && <VaccineScreenMockup progress={progress} />}
          {chapter.screenType === 'breeding' && <BreedingScreenMockup progress={progress} />}
          {chapter.screenType === 'inventory' && <InventoryScreenMockup progress={progress} />}
          {chapter.screenType === 'scanner' && <ScannerScreenMockup progress={progress} />}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Individual Mockup Screens for Each Chapter
// -------------------------------------------------------------

function AnimalsScreenMockup({ progress }: { progress: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      {/* Animal Card 1 */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: 14,
          padding: 16,
          border: '1px solid rgba(255, 122, 24, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          transform: `translateY(${Math.sin(progress * Math.PI) * -4}px)`,
          transition: 'transform 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #FF3B30, #FF7A18)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 14,
              }}
            >
              🐐
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>Tag #BOER-042</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Boer Buck • 2.5 yrs</div>
            </div>
          </div>
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(255, 159, 10, 0.2)',
              color: '#FFB340',
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            Healthy
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Weight: </span>
            <strong style={{ color: '#fff' }}>68.4 kg</strong>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Pen: </span>
            <strong style={{ color: '#fff' }}>Pen A-1</strong>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 6,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11,
          }}
        >
          <span style={{ color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ScanLine size={13} /> QR Tag Active
          </span>
          <span style={{ color: 'var(--text-tertiary)' }}>Last weighed 2d ago</span>
        </div>
      </div>

      {/* Animal Card 2 */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: 14,
          padding: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #FF9F0A, #FF7A18)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 14,
              }}
            >
              🐑
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>Tag #DORP-019</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Dorper Ewe • 1.8 yrs</div>
            </div>
          </div>
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(255, 122, 24, 0.2)',
              color: '#FF9F0A',
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            Pregnant
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Weight: </span>
            <strong style={{ color: '#fff' }}>52.1 kg</strong>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Due: </span>
            <strong style={{ color: '#FF7A18' }}>In 18 Days</strong>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 6,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11,
          }}
        >
          <span style={{ color: '#FFB340', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <FileCheck size={13} /> Complete Pedigree
          </span>
          <span style={{ color: 'var(--text-tertiary)' }}>Sire: Boer Champion</span>
        </div>
      </div>
    </div>
  );
}

function HealthScreenMockup({ progress }: { progress: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 16 }}>
      {/* Vitals Form Simulation */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 14,
          padding: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 10 }}>
          🩺 LIVE VITALS LOGGING (#BOER-042)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 8 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Body Temperature</span>
            <span style={{ fontWeight: 800, color: '#FF3B30', fontSize: 13 }}>39.8 °C (Elevated)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 8 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>FAMACHA Score</span>
            <span style={{ fontWeight: 800, color: '#FF9F0A', fontSize: 13 }}>Score 3 (Pale Pink)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 8 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Appetite / Rumen</span>
            <span style={{ fontWeight: 800, color: '#FF3B30', fontSize: 13 }}>Lethargic / Coughing</span>
          </div>
        </div>
      </div>

      {/* AI Risk Assessment Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(255, 59, 48, 0.18), rgba(10, 26, 44, 0.9))',
          borderRadius: 14,
          padding: 16,
          border: '1px solid rgba(255, 59, 48, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Cpu size={16} color="#FF3B30" />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#FF3B30', textTransform: 'uppercase' }}>
              AI Disease Risk Assessment
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
            Possible Early Pneumonia (88% Confidence)
          </div>
          <p style={{ fontSize: 12, color: '#E2E8F0', lineHeight: 1.4 }}>
            Elevated fever + coughing detected. Isolate immediately in pen B-2 and administer recommended antibiotic protocol.
          </p>
        </div>

        <div
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(255, 59, 48, 0.25)',
            fontSize: 11,
            fontWeight: 800,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>🚨 High Priority Action Required</span>
          <span>Alert Sent to Vet</span>
        </div>
      </div>
    </div>
  );
}

function VaccineScreenMockup({ progress }: { progress: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Upcoming Herd Immunizations</span>
        <span style={{ fontSize: 11, color: '#FF9F0A', fontWeight: 700 }}>3 Pending This Week</span>
      </div>

      {[
        { name: 'CDT Clostridial Booster', dose: '2ml SubQ', due: 'Tomorrow (Aug 15)', count: '14 Goats', status: 'Due Soon', color: '#FF3B30' },
        { name: 'Albendazole Dewormer', dose: '5ml Oral', due: 'In 3 Days (Aug 17)', count: '28 Sheep', status: 'Scheduled', color: '#FF9F0A' },
        { name: 'ADE Vitamin Complex', dose: '3ml IM', due: 'Aug 22, 2026', count: '10 Kids', status: 'Upcoming', color: '#FFB340' },
      ].map((v, i) => (
        <div
          key={i}
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 10,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Syringe size={16} color={v.color} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{v.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{v.dose} • {v.count}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: v.color }}>{v.due}</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Auto-reminders enabled</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BreedingScreenMockup({ progress }: { progress: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      {/* Gestation Progress */}
      <div
        style={{
          background: 'rgba(255, 122, 24, 0.1)',
          borderRadius: 14,
          padding: 16,
          border: '1px solid rgba(255, 122, 24, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#FF7A18' }}>🐐 GESTATION COUNTDOWN</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>Day 115 / 150</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
          Dam: #TAG-BELLA (Nubian Doe)
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Sire: #TAG-THOR • Expected Kidding: Sept 18
        </div>

        {/* Progress bar */}
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.4)', overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ height: '100%', width: '76%', background: 'linear-gradient(90deg, #FF3B30, #FF7A18)' }} />
        </div>

        <div style={{ fontSize: 11, color: '#FF9F0A', fontWeight: 600 }}>
          ✨ Milestone: Move to Kidding Pen in 20 days
        </div>
      </div>

      {/* Genetics & Inbreeding Safety */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 14,
          padding: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#FFB340', marginBottom: 6 }}>
            🧬 INBREEDING CHECK: SAFE (0.0%)
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
            Optimal Genetic Diversity Match
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            System verified 3-generation pedigree. No common ancestors found. Recommended for high-yield offspring.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 6, textAlign: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Est. Litter</span>
            <div style={{ fontWeight: 800, color: '#fff', fontSize: 13 }}>Twins (85%)</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 6, textAlign: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Kid Vigor</span>
            <div style={{ fontWeight: 800, color: '#FFB340', fontSize: 13 }}>High (A+)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventoryScreenMockup({ progress }: { progress: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 14,
          padding: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: '#FF7A18', marginBottom: 8 }}>
          📦 REAL-TIME FEED & SUPPLIES
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#fff' }}>Alfalfa Hay Bales</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#FFB340' }}>42 bags (Good)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#fff' }}>Goat Starter Pellet</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#FF9F0A' }}>4 bags (Low Stock)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#fff' }}>Mineral Salt Block</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#FFB340' }}>12 units (Good)</span>
          </div>
        </div>
      </div>

      <div
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 14,
          padding: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: '#FF7A18', marginBottom: 8 }}>
          🥛 DAILY MILK PRODUCTION
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 900, color: '#fff' }}>48.5 Liters</span>
          <span style={{ fontSize: 12, color: '#FFB340', fontWeight: 800 }}>+12% vs last week</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          Avg 2.7L per milking doe. Peak yield recorded for #SAANEN-018. All records synced to cloud reports.
        </div>
      </div>
    </div>
  );
}

function ScannerScreenMockup({ progress }: { progress: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 0' }}>
      <div
        style={{
          position: 'relative',
          width: 220,
          height: 140,
          borderRadius: 12,
          border: '2px solid rgba(255, 122, 24, 0.5)',
          background: 'rgba(255, 122, 24, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        {/* Animated Laser Scanning Line */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 2,
            background: 'linear-gradient(90deg, transparent, #FF9F0A, #FF7A18, #FF9F0A, transparent)',
            boxShadow: '0 0 12px #FF9F0A',
            top: `${(progress * 100) % 100}%`,
            transition: 'top 0.1s linear',
          }}
        />

        <ScanLine size={48} color="#FF7A18" style={{ opacity: 0.8 }} />
        <div style={{ fontSize: 11, fontWeight: 800, color: '#FF9F0A', marginTop: 6 }}>
          Scanning Ear Tag QR Code...
        </div>
      </div>

      <div
        style={{
          padding: '6px 14px',
          borderRadius: 8,
          background: 'rgba(255, 159, 10, 0.2)',
          border: '1px solid rgba(255, 159, 10, 0.4)',
          fontSize: 12,
          fontWeight: 800,
          color: '#FFB340',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Check size={14} /> Tag Verified: #BOER-042 (Records Loaded in 0.2s)
      </div>
    </div>
  );
}
