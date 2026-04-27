export type GamePhase = "lobby" | "countdown" | "running" | "finished";

export type HitAreaShape = "rect" | "ellipse";

export interface HitArea {
  id: string;
  shape: HitAreaShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface GameStep {
  id: string;
  title: string;
  instruction: string;
  areas: HitArea[];
}

export interface PlayerProgress {
  stepIndex: number;
  completedAreaIds: string[];
  stepStartAt: number;
  stepDurationsMs: number[];
  finishedAt?: number;
}
