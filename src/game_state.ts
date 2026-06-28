/**
 * Game state machine and scoring engine.
 *
 * Exports the mutable gameState singleton and named state-transition functions.
 * Does NOT touch the DOM -- that is handled by game_ui.ts and game_play.ts.
 */

import type { AnswerRecord, GameResults, GameState, NCAASchool } from "./types";

// ---------------------------------------------------------------------------
// Game state singleton
// ---------------------------------------------------------------------------

export const gameState: GameState = {
  screen: "setup",
  schools: [],
  remaining: [],
  currentIndex: 0,
  totalQuestions: 0,
  currentSchool: null,
  currentAttempt: 0,
  clickedSchools: [],
  distancesMiles: [],
  scores: [],
  answers: [],
  conferences: [],
  tierName: "",
  startTime: 0,
  elapsedMs: 0,
  questionStartTime: 0,
  streak: 0,
  bestStreak: 0,
  timerPaused: false,
  timerInterval: null,
};

// ---------------------------------------------------------------------------
// Initialize game with pre-filtered school list
// ---------------------------------------------------------------------------

/**
 * Shuffle-initializes a new round from a pre-filtered school list.
 *
 * @param filteredSchools - Subset of NCAA_SCHOOLS for the chosen tier.
 * @param tierName - Tier name used to build the localStorage key.
 * @returns The mutated gameState singleton after reset and first question advance.
 */
export function startGame(filteredSchools: NCAASchool[], tierName: string): GameState {
  // Copy and shuffle the filtered list (Fisher-Yates)
  const filtered = filteredSchools.slice();
  shuffleArray(filtered);

  // Initialize all state fields
  gameState.screen = "setup";
  gameState.schools = filtered;
  gameState.conferences = [];
  gameState.tierName = tierName;
  gameState.currentIndex = -1;
  gameState.totalQuestions = filtered.length;
  gameState.currentSchool = null;
  gameState.currentAttempt = 0;
  gameState.clickedSchools = [];
  gameState.distancesMiles = [];
  gameState.scores = [];
  gameState.answers = [];
  gameState.streak = 0;
  gameState.bestStreak = 0;
  gameState.timerPaused = false;
  gameState.startTime = Date.now();
  gameState.elapsedMs = 0;

  // Build remaining[] from shortNames
  gameState.remaining = filtered.map((school) => school.shortName);

  // Start the elapsed timer (setInterval updating elapsedMs every 100ms)
  // window.setInterval returns number in the browser (not NodeJS.Timeout)
  gameState.timerInterval = window.setInterval(() => {
    if (!gameState.timerPaused) {
      gameState.elapsedMs = Date.now() - gameState.startTime;
    }
  }, 100);

  // Set screen to "playing" and advance to first question
  gameState.screen = "playing";
  nextQuestion();

  return gameState;
}

// ---------------------------------------------------------------------------
// Advance to next question
// ---------------------------------------------------------------------------

/**
 * Increments currentIndex and sets currentSchool to the next school.
 *
 * @returns The next NCAASchool, or null if all questions are exhausted.
 */
export function nextQuestion(): NCAASchool | null {
  // Advance currentIndex
  gameState.currentIndex += 1;

  // If game is over, return null
  if (gameState.currentIndex >= gameState.totalQuestions) {
    return null;
  }

  // Set currentSchool to schools[currentIndex]
  // noUncheckedIndexedAccess: guard against undefined (index is within bounds here)
  const school = gameState.schools[gameState.currentIndex];
  if (school === undefined) {
    throw new Error(`nextQuestion: no school at index ${String(gameState.currentIndex)}`);
  }
  gameState.currentSchool = school;

  // Reset currentAttempt to 1, clickedSchools to [], distancesMiles to []
  gameState.currentAttempt = 1;
  gameState.clickedSchools = [];
  gameState.distancesMiles = [];
  // Track when this question started for per-question timing
  gameState.questionStartTime = Date.now();

  // Remove currentSchool.shortName from remaining[]
  const idx = gameState.remaining.indexOf(gameState.currentSchool.shortName);
  if (idx !== -1) {
    gameState.remaining.splice(idx, 1);
  }

  return gameState.currentSchool;
}

// ---------------------------------------------------------------------------
// Record an attempt for the current question
// ---------------------------------------------------------------------------

/**
 * Records one click attempt and updates distancesMiles when the click is wrong.
 *
 * @param clickedSchool - The school the player clicked.
 * @returns Whether the click was correct and how many attempts have been made.
 */
export function recordAttempt(clickedSchool: NCAASchool): {
  correct: boolean;
  attemptsUsed: number;
} {
  // Add clickedSchool to clickedSchools
  gameState.clickedSchools.push(clickedSchool);

  // currentSchool must be set when an attempt is recorded
  const currentSchool = gameState.currentSchool;
  if (currentSchool === null) {
    throw new Error("recordAttempt: currentSchool is null");
  }

  // If wrong: compute distance in miles using haversineDistance(), add to distancesMiles
  const correct = clickedSchool.shortName === currentSchool.shortName;
  if (!correct) {
    const distance = haversineDistance(
      currentSchool.lat,
      currentSchool.lon,
      clickedSchool.lat,
      clickedSchool.lon,
    );
    gameState.distancesMiles.push(distance);
  }

  // Increment currentAttempt
  gameState.currentAttempt += 1;

  return {
    correct,
    attemptsUsed: gameState.clickedSchools.length,
  };
}

// ---------------------------------------------------------------------------
// Score the answer after correct or 3 misses
// ---------------------------------------------------------------------------

/**
 * Calculates the score for the current question and records the answer.
 *
 * Score values: 1000 (1st attempt), 667 (2nd), 333 (3rd), or partial (all wrong).
 * Pauses the timer and transitions screen to "revealed".
 *
 * @returns The AnswerRecord built for this question.
 */
export function scoreAnswer(): AnswerRecord {
  // currentSchool must be set when scoring
  const currentSchool = gameState.currentSchool;
  if (currentSchool === null) {
    throw new Error("scoreAnswer: currentSchool is null");
  }

  // Determine if correct answer was clicked
  let correct = false;
  for (const clicked of gameState.clickedSchools) {
    if (clicked.shortName === currentSchool.shortName) {
      correct = true;
      break;
    }
  }

  // Compute score based on attempt number
  let score = 0;
  if (correct) {
    // clickedSchools.length is the attempt number on which the correct answer was found
    const attemptNum = gameState.clickedSchools.length;
    if (attemptNum === 1) {
      score = 1000;
    } else if (attemptNum === 2) {
      score = 667;
    } else if (attemptNum === 3) {
      score = 333;
    }
  } else {
    // All 3 wrong - compute partial credit from closest miss
    const minDistance = Math.min(...gameState.distancesMiles);
    score = missPartialCredit(minDistance);
  }

  // Update streak counter
  if (correct && gameState.clickedSchools.length === 1) {
    // First-attempt correct: increment streak
    gameState.streak += 1;
    if (gameState.streak > gameState.bestStreak) {
      gameState.bestStreak = gameState.streak;
    }
  } else {
    // Wrong or multi-attempt: reset streak
    gameState.streak = 0;
  }

  // Compute how long this question took
  const questionTimeMs = Date.now() - gameState.questionStartTime;

  // Build answer record and push to answers[]
  const answerRecord: AnswerRecord = {
    school: currentSchool,
    attempts: gameState.clickedSchools.length,
    clickedSchools: gameState.clickedSchools.slice(),
    distancesMiles: gameState.distancesMiles.slice(),
    score,
    correct,
    questionTimeMs,
  };
  gameState.answers.push(answerRecord);

  // Push score to scores[]
  gameState.scores.push(score);

  // Pause timer and transition to revealed screen
  pauseTimer();
  gameState.screen = "revealed";

  return answerRecord;
}

// ---------------------------------------------------------------------------
// Resume timer and advance to next question or results
// ---------------------------------------------------------------------------

/**
 * Resumes the timer (when not the final question) then either ends the game
 * or advances to the next question.
 *
 * @returns The next NCAASchool to ask about, or null if the game ended.
 */
export function advanceAfterReveal(): NCAASchool | null {
  // Resume timer before checking game-over so the final elapsed time is accurate
  if (!isGameOver()) {
    resumeTimer();
  }

  // If all questions answered: transition to results, stop timer, return null
  if (isGameOver()) {
    gameState.screen = "results";
    stopTimer();
    return null;
  }

  // Otherwise: set screen to "playing" and advance to next question
  gameState.screen = "playing";
  return nextQuestion();
}

// ---------------------------------------------------------------------------
// Check if game is over
// ---------------------------------------------------------------------------

/**
 * Returns true when the number of recorded answers equals totalQuestions.
 */
export function isGameOver(): boolean {
  return gameState.answers.length >= gameState.totalQuestions;
}

// ---------------------------------------------------------------------------
// Get final results
// ---------------------------------------------------------------------------

/**
 * Builds and returns the round-level GameResults object from current state.
 */
export function getResults(): GameResults {
  let totalScore = 0;
  for (const s of gameState.scores) {
    totalScore += s;
  }

  return {
    scores: gameState.scores,
    answers: gameState.answers,
    totalScore,
    totalQuestions: gameState.totalQuestions,
    elapsedMs: gameState.elapsedMs,
    conferences: gameState.conferences,
    tierName: gameState.tierName,
    bestStreak: gameState.bestStreak,
  };
}

// ---------------------------------------------------------------------------
// Compute partial credit for all wrong answers
// ---------------------------------------------------------------------------

/**
 * Returns partial credit score (0-200) based on the closest wrong guess.
 *
 * >= 200 miles away: 0 points.
 * Distance d miles away (0 <= d < 200): Math.round(200 * (1 - d/200)).
 *
 * @param minDistanceMiles - Minimum haversine distance across all wrong clicks.
 * @returns Integer partial credit score.
 */
export function missPartialCredit(minDistanceMiles: number): number {
  // If minDistanceMiles >= 200: return 0
  if (minDistanceMiles >= 200) {
    return 0;
  }
  // Otherwise: return rounded credit based on distance
  return Math.round(200 * (1 - minDistanceMiles / 200));
}

// ---------------------------------------------------------------------------
// Haversine distance formula
// ---------------------------------------------------------------------------

/**
 * Returns the great-circle distance in miles between two lat/lon coordinates.
 *
 * Reproduces the same constants and formula as parts/game_state.js (R = 3959 mi).
 *
 * @param lat1 - Latitude of point 1 in decimal degrees.
 * @param lon1 - Longitude of point 1 in decimal degrees.
 * @param lat2 - Latitude of point 2 in decimal degrees.
 * @param lon2 - Longitude of point 2 in decimal degrees.
 * @returns Distance in miles.
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  // Convert to radians
  const toRad = Math.PI / 180;
  const lat1Rad = lat1 * toRad;
  const lon1Rad = lon1 * toRad;
  const lat2Rad = lat2 * toRad;
  const lon2Rad = lon2 * toRad;

  // Differences
  const dLat = lat2Rad - lat1Rad;
  const dLon = lon2Rad - lon1Rad;

  // Haversine formula
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.asin(Math.sqrt(a));

  // Earth radius in miles = 3959
  const R = 3959;
  const distance = R * c;

  return distance;
}

// ---------------------------------------------------------------------------
// Fisher-Yates shuffle (in-place)
// ---------------------------------------------------------------------------

/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 *
 * @param arr - Array to shuffle; mutated in place.
 * @returns The same array reference after shuffling.
 */
export function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    // Random index from 0 to i (inclusive)
    const j = Math.floor(Math.random() * (i + 1));

    // Swap arr[i] and arr[j]; indices are guaranteed in bounds by the loop construction
    const temp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = temp;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Timer helpers
// ---------------------------------------------------------------------------

/** Sets timerPaused=true; the setInterval callback skips elapsedMs updates. */
export function pauseTimer(): void {
  gameState.timerPaused = true;
}

/** Clears timerPaused; elapsedMs resumes updating on the next interval tick. */
export function resumeTimer(): void {
  gameState.timerPaused = false;
}

/** Clears the interval handle and snaps elapsedMs to the final wall-clock value. */
export function stopTimer(): void {
  if (gameState.timerInterval !== null) {
    window.clearInterval(gameState.timerInterval);
    gameState.timerInterval = null;
  }
  gameState.elapsedMs = Date.now() - gameState.startTime;
}

// ---------------------------------------------------------------------------
// Format elapsed time as "M:SS"
// ---------------------------------------------------------------------------

/**
 * Formats gameState.elapsedMs as a "minutes:seconds" string (e.g. "1:05").
 *
 * @returns Formatted elapsed time string.
 */
export function getElapsedFormatted(): string {
  const totalSeconds = Math.floor(gameState.elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  // Pad seconds with a leading zero when below 10
  const secondsStr = seconds < 10 ? "0" + String(seconds) : String(seconds);

  return String(minutes) + ":" + secondsStr;
}

// ---------------------------------------------------------------------------
// Best score persistence via localStorage
// ---------------------------------------------------------------------------

/**
 * Builds the localStorage key for storing best score for a given tier.
 *
 * Key format (preserved exactly from parts/game_state.js):
 *   "ncaa-best-" + tierName.replace(/\s+/g, "-").toLowerCase()
 *
 * Example: "All Division I" -> "ncaa-best-all-division-i"
 *
 * @param tierName - The tier name string from DIFFICULTY_TIERS.
 * @returns The localStorage key string.
 */
export function getBestScoreKey(tierName: string): string {
  const key = "ncaa-best-" + tierName.replace(/\s+/g, "-").toLowerCase();
  return key;
}

/**
 * Saves a new best score percentage to localStorage if it exceeds the stored value.
 *
 * The stored value is an integer percentage (0-100) as a string.
 *
 * @param tierName - Tier name used to build the key.
 * @param totalScore - Raw point total for the round.
 * @param totalQuestions - Number of questions in the round.
 * @returns True if a new best was saved, false otherwise.
 */
export function saveBestScore(
  tierName: string,
  totalScore: number,
  totalQuestions: number,
): boolean {
  const key = getBestScoreKey(tierName);
  const maxScore = totalQuestions * 1000;
  const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const existing = localStorage.getItem(key);
  const existingPct = existing !== null ? parseInt(existing, 10) : 0;
  if (pct > existingPct) {
    localStorage.setItem(key, String(pct));
    return true;
  }
  return false;
}

/**
 * Loads the stored best score percentage for a given tier from localStorage.
 *
 * @param tierName - Tier name used to build the key.
 * @returns Stored integer percentage (0-100), or null if no score is stored.
 */
export function loadBestScore(tierName: string): number | null {
  const key = getBestScoreKey(tierName);
  const stored = localStorage.getItem(key);
  if (stored !== null) {
    return parseInt(stored, 10);
  }
  return null;
}
