import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { Server } from "socket.io";
import QRCode from "qrcode";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type GamePhase = "lobby" | "countdown" | "running" | "finished";
type HitAreaShape = "rect" | "ellipse";

type HitArea = {
  id: string;
  shape: HitAreaShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

type GameStep = {
  id: string;
  title: string;
  instruction: string;
  areas: HitArea[];
};

type Player = {
  id: string;
  name: string;
  connected: boolean;
  stepIndex: number;
  completedAreaIds: string[];
  stepStartAt: number;
  stepDurationsMs: number[];
  finishedAt?: number;
};

type GameState = {
  phase: GamePhase;
  roomId: string;
  startedAt?: number;
  countdownEndsAt?: number;
  currentLeaderPlayerId?: string;
  players: Record<string, Player>;
  steps: GameStep[];
  groupName: string;
};

const env = {
  hostPort: Number(process.env.HOST_PORT ?? 8080),
  clientPublicUrl: process.env.CLIENT_PUBLIC_URL ?? "",
  allowOrigins: (process.env.ALLOW_ORIGINS ?? "*").split(","),
  stepsConfigPath:
    process.env.STEPS_CONFIG_PATH ?? path.resolve(__dirname, "../../assets/steps.config.json"),
  resultPath:
    process.env.RESULTS_PATH ?? path.resolve(__dirname, "../../assets/results-history.json"),
  resultsDir:
    process.env.RESULTS_DIR ?? path.resolve(__dirname, "../../assets/results"),
};

const readSteps = (): GameStep[] => {
  const raw = readFileSync(env.stepsConfigPath, "utf-8");
  return JSON.parse(raw) as GameStep[];
};

const safeWriteResults = (payload: unknown): void => {
  writeFileSync(env.resultPath, JSON.stringify(payload, null, 2), "utf-8");
};

const sanitizeFilenamePart = (input: string): string =>
  input.replace(/[^a-zA-Z0-9-_]/g, "_").replace(/_+/g, "_").slice(0, 40) || "gruppe";

const getLanIp = (): string | undefined => {
  const entries = Object.values(os.networkInterfaces()).flat().filter(Boolean);
  const candidate = entries.find(
    (entry) => entry && entry.family === "IPv4" && !entry.internal && entry.address !== "127.0.0.1",
  );
  return candidate?.address;
};

const getJoinUrl = (hostHeader?: string) => {
  const fromEnv = env.clientPublicUrl.trim();
  if (fromEnv) {
    return `${fromEnv.replace(/\/$/, "")}/join?room=${state.roomId}`;
  }
  const lanIp = getLanIp();
  if (lanIp) {
    return `http://${lanIp}:5173/join?room=${state.roomId}`;
  }
  if (hostHeader) {
    const host = hostHeader.split(":")[0];
    return `http://${host}:5173/join?room=${state.roomId}`;
  }
  return `http://localhost:5173/join?room=${state.roomId}`;
};

const playerWelcomeTemplates = [
  "Willkommen im Spiel, {name}. Schoen, dass du dabei bist.",
  "Hallo {name}, viel Erfolg bei GTS-Battle.",
  "Super, {name} ist jetzt mit im Team.",
  "{name} ist eingeloggt. Das wird spannend.",
  "Stark, {name} ist bereit fuer die Challenge.",
];
let playerWelcomeIndex = 0;

const teamWelcomeTemplates = [
  "Willkommen Team {group}. Wir freuen uns auf eure Runde.",
  "Team {group} ist jetzt aktiv. Auf gehts!",
  "Alles klar, Team {group} ist eingetragen. Viel Erfolg!",
];
let teamWelcomeIndex = 0;

const nextTemplate = (templates: string[], counter: "player" | "team"): string => {
  if (counter === "player") {
    const value = templates[playerWelcomeIndex % templates.length];
    playerWelcomeIndex += 1;
    return value;
  }
  const value = templates[teamWelcomeIndex % templates.length];
  teamWelcomeIndex += 1;
  return value;
};

const buildRanking = (players: Player[]) => {
  return players
    .map((player) => {
      const totalMs =
        player.stepDurationsMs.reduce((sum, part) => sum + part, 0) +
        (player.finishedAt && state.startedAt ? player.finishedAt - state.startedAt : 0);
      const progress = (player.stepIndex / Math.max(1, state.steps.length)) * 100;
      return { ...player, totalMs, progress };
    })
    .sort((a, b) => {
      if (a.stepIndex !== b.stepIndex) {
        return b.stepIndex - a.stepIndex;
      }
      return a.totalMs - b.totalMs;
    });
};

const state: GameState = {
  phase: "lobby",
  roomId: randomUUID().slice(0, 8),
  players: {},
  steps: readSteps(),
  groupName: "Unbenannt",
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.allowOrigins.includes("*") ? true : env.allowOrigins,
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, phase: state.phase });
});

app.get("/api/config", async (_req, res) => {
  const joinUrl = getJoinUrl(_req.headers.host);
  const qrCodeDataUrl = await QRCode.toDataURL(joinUrl, {
    margin: 1,
    width: 280,
  });
  res.json({
    roomId: state.roomId,
    joinUrl,
    qrCodeDataUrl,
    phase: state.phase,
    groupName: state.groupName,
    lanIp: getLanIp(),
  });
});

app.post("/api/group-name", (req, res) => {
  const input = String(req.body?.groupName ?? "").trim();
  if (!input) {
    res.status(400).json({ error: "groupName required" });
    return;
  }
  state.groupName = input;
  io.emit("host:state", getHostPayload());
  const text = nextTemplate(teamWelcomeTemplates, "team").replace("{group}", state.groupName);
  io.emit("avatar:event", { type: "team-welcome", text });
  res.json({ ok: true, groupName: state.groupName });
});

app.post("/api/start", (_req, res) => {
  if (state.phase !== "lobby") {
    res.status(400).json({ error: "Game can only be started from lobby" });
    return;
  }
  state.phase = "countdown";
  state.countdownEndsAt = Date.now() + 5_000;
  io.emit("game:countdown", { endsAt: state.countdownEndsAt });
  io.emit("host:state", getHostPayload());
  io.emit("avatar:event", { type: "greeting", text: `Willkommen Team ${state.groupName}.` });

  for (let number = 5; number >= 1; number -= 1) {
    const delay = (5 - number) * 1000;
    setTimeout(() => {
      io.emit("game:countdown-tick", { value: number });
    }, delay);
  }

  setTimeout(() => {
    state.phase = "running";
    state.startedAt = Date.now();
    for (const player of Object.values(state.players)) {
      player.stepIndex = 0;
      player.completedAreaIds = [];
      player.stepStartAt = Date.now();
      player.stepDurationsMs = [];
      player.finishedAt = undefined;
    }
    io.emit("game:started", { startedAt: state.startedAt });
    io.emit("host:state", getHostPayload());
  }, 5_000);

  res.json({ ok: true, phase: "countdown" });
});

app.post("/api/save-results", (_req, res) => {
  const ranking = buildRanking(Object.values(state.players));
  const record = {
    at: new Date().toISOString(),
    groupName: state.groupName,
    roomId: state.roomId,
    ranking: ranking.map((entry, index) => ({
      rank: index + 1,
      name: entry.name,
      progress: entry.progress,
      totalMs: entry.totalMs,
      stepDurationsMs: entry.stepDurationsMs,
      finished: Boolean(entry.finishedAt),
    })),
  };
  let previous: unknown[] = [];
  try {
    previous = JSON.parse(readFileSync(env.resultPath, "utf-8")) as unknown[];
  } catch {
    previous = [];
  }
  safeWriteResults([record, ...previous]);

  mkdirSync(env.resultsDir, { recursive: true });
  const groupSlug = sanitizeFilenamePart(state.groupName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = path.resolve(env.resultsDir, `${groupSlug}.csv`);
  const txtPath = path.resolve(env.resultsDir, `${groupSlug}.txt`);
  const csvHeader = "timestamp,group,room,rank,name,progress,total_seconds,finished,step_times_seconds\n";
  if (!existsSync(csvPath)) {
    appendFileSync(csvPath, csvHeader, "utf-8");
  }
  const csvLines = ranking.map((entry, index) => {
    const steps = entry.stepDurationsMs.map((value) => (value / 1000).toFixed(2)).join("|");
    return `${timestamp},${state.groupName},${state.roomId},${index + 1},${entry.name},${entry.progress.toFixed(
      2,
    )},${(entry.totalMs / 1000).toFixed(2)},${Boolean(entry.finishedAt)},${steps}`;
  });
  appendFileSync(csvPath, `${csvLines.join("\n")}\n`, "utf-8");
  const txtBlock = [
    `Zeitpunkt: ${timestamp}`,
    `Gruppe: ${state.groupName}`,
    `Raum: ${state.roomId}`,
    ...ranking.map(
      (entry, index) =>
        `${index + 1}. ${entry.name} | Fortschritt ${entry.progress.toFixed(1)}% | Gesamt ${(
          entry.totalMs / 1000
        ).toFixed(2)}s`,
    ),
    "",
  ].join("\n");
  appendFileSync(txtPath, `${txtBlock}\n`, "utf-8");

  res.json({ ok: true, saved: record });
});

app.post("/api/reset", (req, res) => {
  const nextGroupName = String(req.body?.groupName ?? "").trim();
  state.phase = "lobby";
  state.countdownEndsAt = undefined;
  state.startedAt = undefined;
  state.currentLeaderPlayerId = undefined;
  state.roomId = randomUUID().slice(0, 8);
  state.players = {};
  state.steps = readSteps();
  if (nextGroupName) {
    state.groupName = nextGroupName;
  }
  io.emit("game:reset", { roomId: state.roomId, groupName: state.groupName });
  io.emit("host:state", getHostPayload());
  res.json({ ok: true, roomId: state.roomId, groupName: state.groupName });
});

app.get("/api/group-summary", (_req, res) => {
  mkdirSync(env.resultsDir, { recursive: true });
  const files = readdirSync(env.resultsDir).filter((entry) => entry.toLowerCase().endsWith(".csv"));
  const summary = files.map((file) => {
    const csvPath = path.resolve(env.resultsDir, file);
    const rows = readFileSync(csvPath, "utf-8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    if (rows.length <= 1) {
      return {
        group: file.replace(/\.csv$/i, ""),
        rounds: 0,
        bestSeconds: null,
        averageWinnerSeconds: null,
      };
    }
    const dataRows = rows.slice(1);
    const winnerRows = dataRows.filter((line) => line.split(",")[3] === "1");
    const winnerTimes = winnerRows
      .map((line) => Number(line.split(",")[6]))
      .filter((value) => Number.isFinite(value));
    const bestSeconds = winnerTimes.length ? Math.min(...winnerTimes) : null;
    const averageWinnerSeconds = winnerTimes.length
      ? winnerTimes.reduce((sum, value) => sum + value, 0) / winnerTimes.length
      : null;
    return {
      group: file.replace(/\.csv$/i, ""),
      rounds: winnerRows.length,
      bestSeconds,
      averageWinnerSeconds,
    };
  });
  summary.sort((a, b) => {
    const left = a.bestSeconds ?? Number.POSITIVE_INFINITY;
    const right = b.bestSeconds ?? Number.POSITIVE_INFINITY;
    return left - right;
  });
  res.json({ ok: true, summary });
});

const clientDistPath = path.resolve(__dirname, "../../client/dist");
if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => {
    res.sendFile(path.resolve(clientDistPath, "index.html"));
  });
}

io.on("connection", (socket) => {
  socket.on("player:join", ({ name }: { name: string }) => {
    const cleaned = name.trim().slice(0, 24);
    if (!cleaned) {
      socket.emit("player:error", { message: "Name ist erforderlich." });
      return;
    }
    for (const [playerId, existingPlayer] of Object.entries(state.players)) {
      if (!existingPlayer.connected && existingPlayer.name.toLowerCase() === cleaned.toLowerCase()) {
        delete state.players[playerId];
      }
    }
    const nameExists = Object.values(state.players).some(
      (player) => player.connected && player.name.toLowerCase() === cleaned.toLowerCase(),
    );
    if (nameExists) {
      socket.emit("player:error", { message: "Name bereits vergeben." });
      return;
    }
    const player: Player = {
      id: socket.id,
      name: cleaned,
      connected: true,
      stepIndex: 0,
      completedAreaIds: [],
      stepStartAt: Date.now(),
      stepDurationsMs: [],
    };
    state.players[socket.id] = player;
    socket.join(state.roomId);
    socket.emit("player:joined", {
      playerId: player.id,
      roomId: state.roomId,
      phase: state.phase,
      steps: state.steps,
    });
    const welcome = nextTemplate(playerWelcomeTemplates, "player").replace("{name}", cleaned);
    io.emit("avatar:event", { type: "player-welcome", text: welcome });
    io.emit("host:state", getHostPayload());
  });

  socket.on("player:hit", ({ areaId }: { areaId: string }) => {
    if (state.phase !== "running") return;
    const player = state.players[socket.id];
    if (!player) return;
    const step = state.steps[player.stepIndex];
    if (!step) return;
    const areaExists = step.areas.some((area) => area.id === areaId);
    if (!areaExists || player.completedAreaIds.includes(areaId)) return;

    player.completedAreaIds.push(areaId);

    if (player.completedAreaIds.length >= step.areas.length) {
      player.stepDurationsMs.push(Date.now() - player.stepStartAt);
      player.stepIndex += 1;
      player.completedAreaIds = [];
      player.stepStartAt = Date.now();
      if (player.stepIndex >= state.steps.length) {
        player.finishedAt = Date.now();
      }
    }

    const ranking = buildRanking(Object.values(state.players));
    const leader = ranking[0];
    if (leader && leader.id !== state.currentLeaderPlayerId) {
      state.currentLeaderPlayerId = leader.id;
      io.emit("avatar:event", {
        type: "leader-change",
        text: `${leader.name} ist jetzt auf Platz eins.`,
      });
    }

    finalizeGameIfComplete();
    socket.emit("player:update", getPlayerPayload(player));
    io.emit("host:state", getHostPayload());
  });

  socket.on("disconnect", () => {
    const player = state.players[socket.id];
    if (player) {
      player.connected = false;
      finalizeGameIfComplete();
      io.emit("host:state", getHostPayload());
    }
  });
});

const finalizeGameIfComplete = () => {
  if (state.phase !== "running") return;
  const activePlayers = Object.values(state.players).filter((entry) => entry.connected);
  if (activePlayers.length === 0) return;
  const everyoneDone = activePlayers.every((entry) => entry.finishedAt || entry.stepIndex >= state.steps.length);
  if (!everyoneDone) return;

  state.phase = "finished";
  const ranking = buildRanking(Object.values(state.players));
  const winner = ranking[0];
  io.emit("game:finished", { ranking });
  io.emit("avatar:event", {
    type: "game-finished",
    text: winner
      ? `Das Spiel ist beendet. Herzlichen Glueckwunsch an ${winner.name} zum ersten Platz.`
      : "Das Spiel ist beendet. Vielen Dank fuers Mitmachen.",
  });
};

const getHostPayload = () => {
  const ranking = buildRanking(Object.values(state.players));
  return {
    phase: state.phase,
    roomId: state.roomId,
    groupName: state.groupName,
    countdownEndsAt: state.countdownEndsAt,
    steps: state.steps,
    players: ranking.map((player, index) => ({
      id: player.id,
      rank: index + 1,
      name: player.name,
      connected: player.connected,
      currentStep: Math.min(player.stepIndex + 1, state.steps.length),
      progress: player.progress,
      completedAreaIds: player.completedAreaIds,
      totalMs: player.totalMs,
    })),
  };
};

const getPlayerPayload = (player: Player) => ({
  phase: state.phase,
  stepIndex: player.stepIndex,
  completedAreaIds: player.completedAreaIds,
  stepDurationsMs: player.stepDurationsMs,
  totalSteps: state.steps.length,
});

server.listen(env.hostPort, () => {
  console.log(`GTS-Battle server listening on http://localhost:${env.hostPort}`);
});
