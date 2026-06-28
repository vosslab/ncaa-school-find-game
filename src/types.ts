/**
 * Shared types for the NCAA School Find game.
 * All exported interfaces and string-union types used across src/ modules.
 * Consumers: use `import type { ... } from "./types";` (verbatimModuleSyntax).
 */

// ---------------------------------------------------------------------------
// String-union types
// ---------------------------------------------------------------------------

/** NCAA subdivision levels - mirrors the subdivision field in the school data. */
export type Subdivision = "FBS" | "FCS" | "Non-football";

/** Difficulty tier filter mode - mirrors the type field in DIFFICULTY_TIERS. */
export type TierType = "conference" | "subdivision" | "all";

/** Valid values for gameState.screen across the game lifecycle. */
export type GameScreen = "setup" | "playing" | "revealed" | "results";

// ---------------------------------------------------------------------------
// Data interfaces
// ---------------------------------------------------------------------------

/** One NCAA Division I school entry from the schools dataset. */
export interface NCAASchool {
  name: string;
  shortName: string;
  mascot: string;
  conference: string;
  subdivision: Subdivision;
  city: string;
  state: string;
  lat: number;
  lon: number;
  colorPrimary: string;
  colorSecondary: string;
  /** Present only for schools where the secondary color should render first. */
  colorSwap?: boolean;
  hintRegion: string;
}

/** One difficulty tier entry from DIFFICULTY_TIERS. */
export interface DifficultyTier {
  name: string;
  type: TierType;
  /** Conference names (TierType "conference"), subdivision keys, or empty for "all". */
  values: string[];
}

/** One US state SVG path entry from US_STATE_PATHS. */
export interface StatePathData {
  /** Two-letter state/territory code (e.g. "AL", "DC"). */
  id: string;
  /** Named map region (e.g. "Southeast", "Mountain"). */
  region: string;
  labelX: number;
  labelY: number;
  /** Full state/territory name. */
  name: string;
  /** SVG path data string for the Albers-projected outline. */
  d: string;
}

// ---------------------------------------------------------------------------
// Runtime game interfaces
// ---------------------------------------------------------------------------

/** Per-question answer record built by scoreAnswer() in game_state.ts. */
export interface AnswerRecord {
  school: NCAASchool;
  /** Total number of click attempts made for this question (1-3). */
  attempts: number;
  /** Schools clicked in order, including the correct answer when found. */
  clickedSchools: NCAASchool[];
  /** Haversine distance in miles for each wrong click, in click order. */
  distancesMiles: number[];
  score: number;
  correct: boolean;
  /** Wall-clock milliseconds spent on this question. */
  questionTimeMs: number;
}

/** Round-level results returned by getResults() in game_state.ts. */
export interface GameResults {
  scores: number[];
  answers: AnswerRecord[];
  totalScore: number;
  totalQuestions: number;
  elapsedMs: number;
  conferences: string[];
  tierName: string;
  bestStreak: number;
}

/** Full mutable runtime state for a game round. */
export interface GameState {
  screen: GameScreen;
  /** Shuffled filtered school list for this round. */
  schools: NCAASchool[];
  /** shortNames not yet asked (used by the sidebar display). */
  remaining: string[];
  /** Zero-based index of the current question. */
  currentIndex: number;
  totalQuestions: number;
  currentSchool: NCAASchool | null;
  /** Current attempt number within the active question (1, 2, or 3). */
  currentAttempt: number;
  /** Schools clicked so far this question (up to 3). */
  clickedSchools: NCAASchool[];
  /** Haversine distances in miles for each wrong click this question. */
  distancesMiles: number[];
  scores: number[];
  answers: AnswerRecord[];
  conferences: string[];
  /** Tier name used as the localStorage key suffix. */
  tierName: string;
  /** Date.now() value when the round started. */
  startTime: number;
  /** Running elapsed time in milliseconds (updated every 100 ms by timerInterval). */
  elapsedMs: number;
  /** Date.now() value when the current question started. */
  questionStartTime: number;
  streak: number;
  bestStreak: number;
  /** True while the reveal feedback is showing; timer does not advance. */
  timerPaused: boolean;
  /** setInterval handle for the elapsed-time updater; null when not running. */
  timerInterval: number | null;
}
