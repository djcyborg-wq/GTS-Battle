import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type GamePhase = "lobby" | "countdown" | "running" | "finished";
type HitAreaShape = "rect" | "ellipse";
type HitArea = { id: string; shape: HitAreaShape; x: number; y: number; width: number; height: number; rotation?: number };
type GameStep = {
  id: string;
  title: string;
  instruction: string;
  slideWidthPx?: number;
  slideHeightPx?: number;
  areas: HitArea[];
};
type HostPlayer = { id: string; rank: number; name: string; progress: number; currentStep: number; totalMs: number; connected: boolean };
type GroupSummaryRow = {
  group: string;
  rounds: number;
  bestSeconds: number | null;
  averageWinnerSeconds: number | null;
};

const resolveServerBase = () => {
  const fromEnv = import.meta.env.VITE_SERVER_URL;
  if (fromEnv) return fromEnv;
  return window.location.origin;
};

const serverBase = resolveServerBase();

function App() {
  const mode = useMemo(() => (window.location.pathname.startsWith("/host") ? "host" : "player"), []);
  return mode === "host" ? <HostScreen /> : <PlayerScreen />;
}

function HostScreen() {
  const [state, setState] = useState<{ phase: GamePhase; groupName: string; players: HostPlayer[]; roomId: string; countdownEndsAt?: number }>({
    phase: "lobby",
    groupName: "Unbenannt",
    players: [],
    roomId: "",
  });
  const [joinData, setJoinData] = useState<{ joinUrl: string; qrCodeDataUrl: string }>({ joinUrl: "", qrCodeDataUrl: "" });
  const [groupNameInput, setGroupNameInput] = useState("Team A");
  const [voiceText, setVoiceText] = useState("");
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [groupSummary, setGroupSummary] = useState<GroupSummaryRow[]>([]);

  useEffect(() => {
    void fetch(`${serverBase}/api/config`).then(async (res) => {
      const data = await res.json();
      setJoinData({ joinUrl: data.joinUrl, qrCodeDataUrl: data.qrCodeDataUrl });
      setState((old) => ({ ...old, roomId: data.roomId, groupName: data.groupName }));
    });

    const socket = io(serverBase);
    socket.on("host:state", (payload) => setState(payload));
    socket.on("avatar:event", (event) => {
      setVoiceText(event.text);
      speak(event.text, {
        onStart: () => {
          setIsSpeaking(true);
          setVoiceProgress(0);
        },
        onProgress: (progress) => setVoiceProgress(progress),
        onEnd: () => {
          setIsSpeaking(false);
          setVoiceProgress(1);
        },
      });
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const startGame = async () => {
    await fetch(`${serverBase}/api/start`, { method: "POST" });
  };

  const saveGroupName = async () => {
    await fetch(`${serverBase}/api/group-name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupName: groupNameInput }),
    });
  };

  const saveResults = async () => {
    const response = await fetch(`${serverBase}/api/save-results`, { method: "POST" });
    const payload = await response.json();
    if (payload?.ok) {
      setActionMessage("Ergebnisse gespeichert unter assets/results/ (CSV + TXT).");
    }
  };

  const resetGame = async () => {
    const response = await fetch(`${serverBase}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupName: groupNameInput.trim() }),
    });
    const payload = await response.json();
    if (payload?.ok) {
      setActionMessage(`Reset erfolgreich. Neuer Raum: ${payload.roomId}`);
      void fetch(`${serverBase}/api/config`).then(async (res) => {
        const data = await res.json();
        setJoinData({ joinUrl: data.joinUrl, qrCodeDataUrl: data.qrCodeDataUrl });
      });
    }
  };

  const loadGroupSummary = async () => {
    if (showSummary) {
      setShowSummary(false);
      return;
    }
    const response = await fetch(`${serverBase}/api/group-summary`);
    const payload = await response.json();
    if (payload?.ok) {
      setGroupSummary(payload.summary);
      setShowSummary(true);
    }
  };

  const countdown = state.countdownEndsAt ? Math.max(0, Math.ceil((state.countdownEndsAt - Date.now()) / 1000)) : 0;

  return (
    <main className="host-layout">
      <h1>GTS-Battle Host</h1>
      <section className="panel top-grid">
        <div className="host-info-col">
          <div className="host-meta-inline">
            <span>Raum: {state.roomId || "..."}</span>
            <span>Phase: {state.phase}</span>
          </div>
          <p>Gruppe: {state.groupName}</p>
          {state.phase === "countdown" && <p className="countdown">Start in {countdown}s</p>}
          <div className="btn-col">
            <button onClick={startGame} disabled={state.phase !== "lobby"}>Spiel starten</button>
            <button onClick={saveResults}>Ergebnisse speichern</button>
            <button onClick={resetGame}>Server reset</button>
            <button onClick={loadGroupSummary}>{showSummary ? "Gruppenauswertung ausblenden" : "Gruppenauswertung"}</button>
          </div>
          <div className="group-input-wrap">
            <h3>Gruppenname</h3>
            <div className="group-name-row">
              <input value={groupNameInput} onChange={(e) => setGroupNameInput(e.target.value)} />
              <button onClick={saveGroupName}>Speichern</button>
            </div>
          </div>
          {actionMessage && <p className="action-message">{actionMessage}</p>}
        </div>
        <div className="host-visual-col">
          <Avatar
            text={voiceText || "Willkommen bei GTS-Battle."}
            isSpeaking={isSpeaking}
            speechProgress={voiceProgress}
            onClick={() => {
              const greeting = `Willkommen Team ${state.groupName}. Ich freue mich, euch bei GTS-Battle zu begleiten.`;
              setVoiceText(greeting);
              speak(greeting, {
                onStart: () => {
                  setIsSpeaking(true);
                  setVoiceProgress(0);
                },
                onProgress: (progress) => setVoiceProgress(progress),
                onEnd: () => {
                  setIsSpeaking(false);
                  setVoiceProgress(1);
                },
              });
            }}
          />
        </div>
        <div className="host-visual-col">
          <h3>QR-Join</h3>
          {joinData.qrCodeDataUrl && <img src={joinData.qrCodeDataUrl} alt="QR Join Code" className="qr qr-large" />}
          <p className="mono">{joinData.joinUrl}</p>
        </div>
      </section>
      <section className="panel">
        <h2>Live-Ranking</h2>
        <table>
          <thead><tr><th>Platz</th><th>Spieler</th><th>Step</th><th>Fortschritt</th><th>Zeit</th></tr></thead>
          <tbody>
            {state.players.map((player) => (
              <tr key={player.id}>
                <td>{player.rank}</td>
                <td>{player.name}{!player.connected ? " (offline)" : ""}</td>
                <td>{player.currentStep}</td>
                <td>{player.progress.toFixed(1)}%</td>
                <td>{(player.totalMs / 1000).toFixed(1)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {showSummary && (
        <section className="panel">
          <h2>Gruppenauswertung (CSV)</h2>
          <table>
            <thead>
              <tr>
                <th>Gruppe</th>
                <th>Runden</th>
                <th>Beste Siegerzeit</th>
                <th>Durchschnitt Sieger</th>
              </tr>
            </thead>
            <tbody>
              {groupSummary.map((row) => (
                <tr key={row.group}>
                  <td>{row.group}</td>
                  <td>{row.rounds}</td>
                  <td>{row.bestSeconds === null ? "-" : `${row.bestSeconds.toFixed(2)}s`}</td>
                  <td>{row.averageWinnerSeconds === null ? "-" : `${row.averageWinnerSeconds.toFixed(2)}s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

function PlayerScreen() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [name, setName] = useState("");
  const [hasJoined, setHasJoined] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<GamePhase>("lobby");
  const [steps, setSteps] = useState<GameStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [hits, setHits] = useState<string[]>([]);
  const [stepDurations, setStepDurations] = useState<number[]>([]);
  const [countdownValue, setCountdownValue] = useState(5);
  const [stepStartAt, setStepStartAt] = useState<number>(Date.now());
  const [backgroundImageUrl, setBackgroundImageUrl] = useState("/slide1-bg.png");
  const [boardRect, setBoardRect] = useState({ width: 1200, height: 680 });
  const [, setUiTick] = useState(0);

  useEffect(() => {
    const sock = io(serverBase);
    setSocket(sock);
    sock.on("player:error", (payload) => setError(payload.message));
    sock.on("player:joined", (payload) => {
      setHasJoined(true);
      setPhase(payload.phase);
      setSteps(payload.steps);
      setStepIndex(0);
      setHits([]);
      setStepDurations([]);
    });
    sock.on("game:countdown", () => {
      setPhase("countdown");
      setCountdownValue(5);
      speak("Countdown gestartet.");
    });
    sock.on("game:countdown-tick", (payload) => {
      setCountdownValue(payload.value);
    });
    sock.on("game:started", () => {
      setPhase("running");
      setStepStartAt(Date.now());
    });
    sock.on("player:update", (payload) => {
      setPhase(payload.phase);
      setStepIndex(payload.stepIndex);
      setHits(payload.completedAreaIds);
      setStepDurations(payload.stepDurationsMs);
      if (payload.stepIndex >= payload.totalSteps) setPhase("finished");
    });
    sock.on("game:finished", () => setPhase("finished"));
    sock.on("game:reset", () => {
      setHasJoined(false);
      setPhase("lobby");
      setSteps([]);
      setStepIndex(0);
      setHits([]);
      setStepDurations([]);
      setName("");
      setError("");
    });
    return () => {
      sock.disconnect();
    };
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    const tick = window.setInterval(() => {
      setUiTick((value) => value + 1);
    }, 300);
    return () => window.clearInterval(tick);
  }, [phase]);

  useEffect(() => {
    const candidates = ["/slide1-bg.png", "/slide1-bg.jpg", "/slide1-bg.jpeg", "/slide1-bg.webp"];
    let cancelled = false;

    const tryNext = (index: number) => {
      if (index >= candidates.length || cancelled) return;
      const test = new Image();
      test.onload = () => {
        if (!cancelled) setBackgroundImageUrl(candidates[index]);
      };
      test.onerror = () => tryNext(index + 1);
      test.src = candidates[index];
    };

    tryNext(0);
    return () => {
      cancelled = true;
    };
  }, []);

  const currentStep = steps[stepIndex];
  const hintVisible = Date.now() - stepStartAt > 3000;
  const baseWidth = currentStep?.slideWidthPx ?? 1280;
  const baseHeight = currentStep?.slideHeightPx ?? 720;
  const boardAspect = boardRect.width / Math.max(1, boardRect.height);
  const imageAspect = baseWidth / Math.max(1, baseHeight);
  const renderedWidth = boardAspect > imageAspect ? boardRect.height * imageAspect : boardRect.width;
  const renderedHeight = boardAspect > imageAspect ? boardRect.height : boardRect.width / imageAspect;
  const imageOffsetX = (boardRect.width - renderedWidth) / 2;
  const imageOffsetY = (boardRect.height - renderedHeight) / 2;
  const scaleX = renderedWidth / baseWidth;
  const scaleY = renderedHeight / baseHeight;

  const join = () => {
    const cleanedName = name.trim();
    if (!cleanedName) {
      setError("Bitte gib einen Namen ein.");
      return;
    }
    setError("");
    socket?.emit("player:join", { name: cleanedName });
  };

  if (!hasJoined && phase === "lobby") {
    return (
      <main className="player-center">
        <h1>GTS-Battle</h1>
        <input
          placeholder="Dein Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") join();
          }}
        />
        <button onClick={join} disabled={!socket}>
          Beitreten
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  if (phase === "lobby") {
    return (
      <main className="player-center player-wait">
        <h1>Du bist drin!</h1>
        <p>Warte auf den Start durch den Host.</p>
      </main>
    );
  }
  if (phase === "countdown") {
    return (
      <main className="player-center countdown-screen">
        <p>Das Spiel startet</p>
        <h1 key={`count-${countdownValue}`} className="countdown-number">
          {countdownValue}
        </h1>
      </main>
    );
  }
  if (phase === "finished") {
    const total = stepDurations.reduce((sum, value) => sum + value, 0);
    return (
      <main className="player-center finish-screen">
        <h1>Geschafft!</h1>
        <p>Du hast alle Aufgaben abgeschlossen.</p>
        <section className="finish-card">
          <h3>Deine Zeiten</h3>
          <ul>
            {stepDurations.map((value, idx) => (
              <li key={idx}>
                <span>Schritt {idx + 1}</span>
                <strong>{(value / 1000).toFixed(2)}s</strong>
              </li>
            ))}
          </ul>
          <div className="finish-total">
            <span>Gesamtzeit</span>
            <strong>{(total / 1000).toFixed(2)}s</strong>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="game-stage">
      <header className="player-hud">
        <div>
          <p className="hud-label">Anweisung</p>
          <h2>{currentStep?.instruction ?? "Lade Schritt..."}</h2>
        </div>
        <div className="hud-progress">
          <span>Schritt {Math.min(stepIndex + 1, steps.length)} / {steps.length}</span>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${steps.length ? ((stepIndex + (hits.length > 0 ? 0.5 : 0)) / steps.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </header>
      <div
        className="background-board"
        style={{ backgroundImage: `url("${backgroundImageUrl}")` }}
        ref={(element) => {
          if (!element) return;
          const rect = element.getBoundingClientRect();
          if (rect.width !== boardRect.width || rect.height !== boardRect.height) {
            setBoardRect({ width: rect.width, height: rect.height });
          }
        }}
      >
        {(currentStep?.areas ?? []).map((area) => {
          const done = hits.includes(area.id);
          return (
            <button
              key={area.id}
              onClick={() => socket?.emit("player:hit", { areaId: area.id })}
              className={`hit ${done ? "done" : ""} ${hintVisible ? "hint" : ""}`}
              style={{
                left: `${imageOffsetX + area.x * scaleX}px`,
                top: `${imageOffsetY + area.y * scaleY}px`,
                width: `${area.width * scaleX}px`,
                height: `${area.height * scaleY}px`,
                transform: `rotate(${area.rotation ?? 0}deg)`,
                borderRadius: area.shape === "ellipse" ? "50%" : "10px",
                opacity: done ? 0.9 : hintVisible ? 0.65 : 0.08,
              }}
            />
          );
        })}
      </div>
    </main>
  );
}

function Avatar({
  text,
  isSpeaking,
  speechProgress,
  onClick,
}: {
  text: string;
  isSpeaking: boolean;
  speechProgress: number;
  onClick?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const boundedProgress = Math.max(0, Math.min(1, speechProgress));
  const mouthScale = isSpeaking ? 0.7 + 0.55 * Math.abs(Math.sin(boundedProgress * Math.PI * 12)) : 0;
  const transitionDelayMs = 2000;
  const idleRestartDelayMs = 2000;
  const speakingRange = { start: 1.0, end: 3.5 };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const targetRange = isSpeaking ? speakingRange : { start: 0.0, end: 1.0 };

    const keepInRange = () => {
      if (isSpeaking) {
        if (video.currentTime < speakingRange.start || video.currentTime > speakingRange.end) {
          video.currentTime = speakingRange.start;
        }
        return;
      }
    };

    const applyRangeAfterDelay = async () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
      setVideoReady(false);

      transitionTimeoutRef.current = window.setTimeout(async () => {
        video.currentTime = targetRange.start;
        try {
          await video.play();
        } catch {
          // autoplay kann vom Browser blockiert sein; dann startet das Video nach User-Interaktion.
        }
      }, transitionDelayMs);
    };

    void applyRangeAfterDelay();
    video.addEventListener("timeupdate", keepInRange);
    video.onended = () => {
      if (isSpeaking) return;
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
      transitionTimeoutRef.current = window.setTimeout(async () => {
        video.currentTime = 0;
        try {
          await video.play();
        } catch {
          // autoplay kann vom Browser blockiert sein.
        }
      }, idleRestartDelayMs);
    };
    return () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
      video.onended = null;
      video.removeEventListener("timeupdate", keepInRange);
    };
  }, [isSpeaking]);

  return (
    <button
      type="button"
      className={`avatar avatar-host avatar-button ${isSpeaking ? "speaking" : ""}`}
      onClick={onClick}
      title="Avatar anklicken für Begrüßung"
    >
      <div className="avatar-video-shell">
        <video
          ref={videoRef}
          className="avatar-video"
          src={
            isSpeaking
              ? "/media/avatar-host.mp4"
              : "/media/avatar-idle-forward.mp4"
          }
          autoPlay
          muted
          loop={isSpeaking ? true : false}
          playsInline
          onLoadedData={() => setVideoReady(true)}
          style={{
            objectPosition: "center 28%",
            opacity: videoReady ? 1 : 0.96,
          }}
        />
        <div
          className="avatar-mouth-sync"
          style={{
            opacity: isSpeaking ? 0.8 : 0,
            transform: `translateX(-50%) scaleX(${mouthScale})`,
          }}
        />
      </div>
      <p className="avatar-text">{text}</p>
    </button>
  );
}

type SpeakHandlers = {
  onStart?: () => void;
  onProgress?: (progress: number) => void;
  onEnd?: () => void;
};

const preferredVoice = (): SpeechSynthesisVoice | null => {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const germanVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("de"));
  const katjaNatural = germanVoices.find((voice) => {
    const name = voice.name.toLowerCase();
    return name.includes("katja") && name.includes("natural");
  });
  if (katjaNatural) return katjaNatural;

  const katjaFallback = germanVoices.find((voice) => voice.name.toLowerCase().includes("katja"));
  if (katjaFallback) return katjaFallback;

  const score = (voice: SpeechSynthesisVoice) => {
    const name = voice.name.toLowerCase();
    let points = 0;
    if (name.includes("female") || name.includes("frau") || name.includes("weiblich")) points += 8;
    if (name.includes("neural") || name.includes("natural") || name.includes("online")) points += 7;
    if (name.includes("wavenet") || name.includes("premium") || name.includes("enhanced")) points += 4;
    if (name.includes("katja") || name.includes("vicki") || name.includes("anna") || name.includes("petra")) {
      points += 5;
    }
    if (name.includes("microsoft")) points += 3;
    if (name.includes("google")) points += 2;
    if (name.includes("male") || name.includes("männlich")) points -= 6;
    if (voice.default) points += 1;
    return points;
  };
  const pool = germanVoices.length ? germanVoices : voices;
  const sorted = [...pool].sort((a, b) => score(b) - score(a));
  return sorted[0] ?? null;
};

const speak = (text: string, handlers?: SpeakHandlers) => {
  if (!("speechSynthesis" in window)) return;
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  const voice = preferredVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  utterance.rate = 0.92;
  utterance.pitch = 1.0;
  utterance.volume = 1;
  utterance.onstart = () => handlers?.onStart?.();
  utterance.onend = () => handlers?.onEnd?.();
  utterance.onboundary = (event) => {
    const progress = Math.max(0, Math.min(1, event.charIndex / Math.max(1, text.length)));
    handlers?.onProgress?.(progress);
  };
  window.speechSynthesis.speak(utterance);
};

if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

export default App;
