/**
 * UI rendering logic for the NCAA School Find game.
 *
 * Ports parts/game_ui.js: screen transitions, map rendering, dot states,
 * zoom circle animation, map labels, sidebar, state labels, and share text.
 *
 * This module owns its mutable UI state. The four module-local bindings
 * (correctlyAnsweredIndices, projectedCoords, sidebarSortedIndices,
 * stateLabelsVisible) are exported as ESM live bindings so consumers such as
 * game_play.ts get a read-only view that updates as the mutator functions run.
 * Reassignment of those bindings happens only inside this module.
 */

import type { GameResults, NCAASchool } from "./types";
import { gameState, saveBestScore, loadBestScore, getElapsedFormatted } from "./game_state";
import { albersProjection } from "./map_projection";
import { SUBREGIONS } from "./constants";
import { US_STATE_PATHS } from "./data_loader";
import { findElement } from "./dom_utils";

// ---------------------------------------------------------------------------
// Module-local mutable UI state (exported as live bindings)
// ---------------------------------------------------------------------------

/** A school dot's projected SVG pixel position. */
export interface ProjectedCoord {
  x: number;
  y: number;
}

/** Map of school index -> true once that dot has been correctly answered. */
export let correctlyAnsweredIndices: Record<number, boolean> = {};

/** Projected coordinates for each school, computed once in renderMap. */
export let projectedCoords: ProjectedCoord[] = [];

/** Alphabetically sorted school index list for the sidebar (per game). */
export let sidebarSortedIndices: number[] = [];

/** Whether the state abbreviation labels are currently shown. */
export let stateLabelsVisible = false;

//============================================
// Read accessor for other modules that only need to test answered state.
export function isAnswered(schoolIndex: number): boolean {
  return correctlyAnsweredIndices[schoolIndex] === true;
}

// ---------------------------------------------------------------------------
// SVG element helper
// ---------------------------------------------------------------------------

//============================================
// Create a namespaced SVG element with the correct specific element type.
// Using the literal namespace here keeps the typed createElementNS overload,
// so callers get SVGPathElement/SVGTextElement/etc. without an `as` cast.
function createSvgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

// ---------------------------------------------------------------------------
// School colors
// ---------------------------------------------------------------------------

//============================================
export function getSchoolColors(school: NCAASchool): { fill: string; stroke: string } {
  // Return both school colors for half-and-half dots. colorSwap is pre-computed
  // so neighboring schools render visually distinct dot patterns.
  if (school.colorSwap === true) {
    return {
      fill: school.colorSecondary,
      stroke: school.colorPrimary,
    };
  }
  return {
    fill: school.colorPrimary,
    stroke: school.colorSecondary,
  };
}

//============================================
export function getDotColor(school: NCAASchool): string {
  // Returns the primary color used for sidebar dots
  return school.colorPrimary;
}

// ---------------------------------------------------------------------------
// Screen management
// ---------------------------------------------------------------------------

//============================================
export function showScreen(screenName: string): void {
  const screens = ["setup", "game", "results"];
  for (const name of screens) {
    const el = findElement(`${name}-screen`);
    if (el === null) {
      continue;
    }
    if (name === screenName) {
      el.style.display = "flex";
      // Trigger fade-in animation
      el.classList.remove("animate-in");
      // Force reflow so the re-added class restarts the animation
      void el.offsetWidth;
      el.classList.add("animate-in");
    } else {
      el.style.display = "none";
      el.classList.remove("animate-in");
    }
  }
}

//============================================
export function showSetupScreen(): void {
  showScreen("setup");
  // Reset tier radio to first option (Major Conferences)
  const radios = document.querySelectorAll<HTMLInputElement>(".tier-radio");
  const firstRadio = radios[0];
  if (firstRadio !== undefined) {
    firstRadio.checked = true;
  }
  // Hide any setup error
  const errorEl = findElement("setup-error");
  if (errorEl !== null) {
    errorEl.style.display = "none";
  }
  // Reset answered tracking
  correctlyAnsweredIndices = {};
  projectedCoords = [];
}

// ---------------------------------------------------------------------------
// Map rendering
// ---------------------------------------------------------------------------

//============================================
export function renderMap(schools: NCAASchool[]): void {
  const statesGroup = findElement("states");
  const dotsGroup = findElement("school-dots");
  const labelsGroup = findElement("map-labels");

  // Clear everything
  if (statesGroup !== null) {
    statesGroup.innerHTML = "";
  }
  if (dotsGroup !== null) {
    dotsGroup.innerHTML = "";
  }
  if (labelsGroup !== null) {
    labelsGroup.innerHTML = "";
  }

  // Reset tracking
  correctlyAnsweredIndices = {};
  projectedCoords = [];

  // Render state outlines with region-based color tints
  if (statesGroup !== null) {
    for (const state of US_STATE_PATHS) {
      const path = createSvgElement("path");
      path.setAttribute("d", state.d);
      // Add region class for subtle color tinting
      const regionClass = state.region !== "" ? `region-${state.region.toLowerCase()}` : "";
      path.setAttribute("class", `state-path ${regionClass}`);
      statesGroup.appendChild(path);
    }
  }

  // Project all school coordinates and detect overlaps
  const coordsList: ProjectedCoord[] = [];
  for (const school of schools) {
    const coords = albersProjection(school.lat, school.lon);
    if (coords === null) {
      // Fail loud: every NCAA school must project to a valid map coordinate
      throw new Error(`renderMap: albersProjection returned null for ${school.shortName}`);
    }
    coordsList.push({ x: coords[0], y: coords[1] });
  }

  // Save original positions so we can cap displacement
  const origCoords: ProjectedCoord[] = [];
  for (const coord of coordsList) {
    origCoords.push({ x: coord.x, y: coord.y });
  }

  // Jitter overlapping dots - multiple passes to separate clusters.
  // minSpacing just larger than dot diameter so dots don't visually overlap.
  // maxDrift caps how far a dot can move from its true location (accuracy).
  const minSpacing = 10;
  const maxDrift = 12;
  const maxPasses = 10;
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    for (let i = 0; i < coordsList.length; i++) {
      const ci = coordsList[i];
      if (ci === undefined) {
        continue;
      }
      for (let j = i + 1; j < coordsList.length; j++) {
        const cj = coordsList[j];
        if (cj === undefined) {
          continue;
        }
        const dx = cj.x - ci.x;
        const dy = cj.y - ci.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minSpacing) {
          const angle = dist > 0.1 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
          const push = (minSpacing - dist) / 2 + 1;
          // ci/cj are live references into coordsList, so these mutate the array
          ci.x -= Math.cos(angle) * push;
          ci.y -= Math.sin(angle) * push;
          cj.x += Math.cos(angle) * push;
          cj.y += Math.sin(angle) * push;
          moved = true;
        }
      }
    }
    // Clamp all dots to maxDrift from original position
    for (let c = 0; c < coordsList.length; c++) {
      const cc = coordsList[c];
      const oc = origCoords[c];
      if (cc === undefined || oc === undefined) {
        continue;
      }
      const cdx = cc.x - oc.x;
      const cdy = cc.y - oc.y;
      const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
      if (cdist > maxDrift) {
        const scale = maxDrift / cdist;
        cc.x = oc.x + cdx * scale;
        cc.y = oc.y + cdy * scale;
      }
    }
    if (!moved) {
      break;
    }
  }

  // Store projected coords for later use
  projectedCoords = coordsList;

  // Detect touch device for larger hit targets
  const isTouch = "ontouchstart" in window;
  const baseDotRadius = isTouch ? 7 : 6;
  const baseHitRadius = isTouch ? 18 : 12;

  // Compute per-dot density: count neighbors within 40px.
  // Dense regions get smaller dots so they don't pile up.
  const densityRadius = 40;
  const dotRadii: number[] = [];
  const hitRadii: number[] = [];
  for (let di = 0; di < coordsList.length; di++) {
    const cdi = coordsList[di];
    if (cdi === undefined) {
      // coordsList is dense; fail loud to keep dotRadii index-aligned with schools
      throw new Error(`renderMap: missing coordinate at index ${String(di)}`);
    }
    let neighborCount = 0;
    for (let dj = 0; dj < coordsList.length; dj++) {
      if (di === dj) {
        continue;
      }
      const cdj = coordsList[dj];
      if (cdj === undefined) {
        continue;
      }
      const ddx = cdj.x - cdi.x;
      const ddy = cdj.y - cdi.y;
      const ddist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (ddist < densityRadius) {
        neighborCount++;
      }
    }
    // Scale down: 0-1 neighbors = full size, 5+ neighbors = 70% size
    const densityScale = Math.max(0.7, 1.0 - neighborCount * 0.06);
    dotRadii.push(Math.round(baseDotRadius * densityScale * 10) / 10);
    hitRadii.push(Math.round(baseHitRadius * densityScale * 10) / 10);
  }

  // Render dots - all start as gray (unanswered)
  if (dotsGroup !== null) {
    // Theme-aware unanswered color, read once for all dots
    const dotColor =
      getComputedStyle(document.documentElement).getPropertyValue("--dot-unanswered").trim() ||
      "#888";

    for (let idx = 0; idx < schools.length; idx++) {
      const school = schools[idx];
      const coord = coordsList[idx];
      const dotRadius = dotRadii[idx];
      const hitRadius = hitRadii[idx];
      if (
        school === undefined ||
        coord === undefined ||
        dotRadius === undefined ||
        hitRadius === undefined
      ) {
        continue;
      }
      const x = coord.x;
      const y = coord.y;

      const group = createSvgElement("g");
      group.setAttribute("class", "school-dot-group");
      group.setAttribute("data-school-index", String(idx));
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", school.shortName);
      group.setAttribute("tabindex", "0");

      // Hit-area circle (larger invisible target)
      const hitCircle = createSvgElement("circle");
      hitCircle.setAttribute("cx", String(x));
      hitCircle.setAttribute("cy", String(y));
      hitCircle.setAttribute("r", String(hitRadius));
      hitCircle.setAttribute("class", "hit-area");

      // Visible dot - starts with theme-aware unanswered color
      const dot = createSvgElement("circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", String(dotRadius));
      dot.setAttribute("class", "visible-dot");
      dot.setAttribute("fill", dotColor);

      group.appendChild(hitCircle);
      group.appendChild(dot);
      dotsGroup.appendChild(group);
    }
  }
}

// ---------------------------------------------------------------------------
// Dot state updates
// ---------------------------------------------------------------------------

//============================================
export function markDotAnswered(schoolIndex: number, schools: NCAASchool[]): void {
  // Mark a dot as correctly answered - replace gray circle with half-and-half dot
  correctlyAnsweredIndices[schoolIndex] = true;
  const group = document.querySelector(`.school-dot-group[data-school-index='${schoolIndex}']`);
  if (group === null) {
    return;
  }
  const dot = group.querySelector(".visible-dot");
  const coord = projectedCoords[schoolIndex];
  const school = schools[schoolIndex];
  if (dot === null || coord === undefined || school === undefined) {
    return;
  }
  const x = coord.x;
  const y = coord.y;
  const r = 7;
  const colors = getSchoolColors(school);

  // Hide the original circle
  dot.setAttribute("r", "0");

  // Left half = primary color
  const leftPath = createSvgElement("path");
  const leftD = `M ${x},${y - r} A ${r},${r} 0 0,0 ${x},${y + r} Z`;
  leftPath.setAttribute("d", leftD);
  leftPath.setAttribute("fill", colors.fill);
  leftPath.setAttribute("class", "half-dot");

  // Right half = secondary color
  const rightPath = createSvgElement("path");
  const rightD = `M ${x},${y - r} A ${r},${r} 0 0,1 ${x},${y + r} Z`;
  rightPath.setAttribute("d", rightD);
  rightPath.setAttribute("fill", colors.stroke);
  rightPath.setAttribute("class", "half-dot");

  // Thin outline for definition
  const outline = createSvgElement("circle");
  outline.setAttribute("cx", String(x));
  outline.setAttribute("cy", String(y));
  outline.setAttribute("r", String(r));
  outline.setAttribute("fill", "none");
  outline.setAttribute("stroke", "#333");
  outline.setAttribute("stroke-width", "0.5");
  outline.setAttribute("class", "half-dot");

  group.appendChild(leftPath);
  group.appendChild(rightPath);
  group.appendChild(outline);

  // Disable hover/click styling for answered dots
  group.classList.add("dot-answered");

  // Move answered dot to front of parent (renders behind unanswered dots in SVG)
  const parent = group.parentNode;
  if (parent !== null && parent.firstChild !== group) {
    parent.insertBefore(group, parent.firstChild);
  }
}

//============================================
export function markDotCorrect(schoolIndex: number): void {
  const group = document.querySelector(`.school-dot-group[data-school-index='${schoolIndex}']`);
  if (group !== null) {
    group.classList.add("dot-correct");
  }
}

//============================================
export function markDotWrong(schoolIndex: number): void {
  const group = document.querySelector(`.school-dot-group[data-school-index='${schoolIndex}']`);
  if (group !== null) {
    group.classList.add("dot-wrong");
  }
}

//============================================
export function clearHighlights(): void {
  // Remove temporary highlight classes (not dot-answered which is permanent)
  const groups = document.querySelectorAll(".school-dot-group");
  for (const group of groups) {
    group.classList.remove("dot-wrong");
    group.classList.remove("dot-correct");
    group.classList.remove("dot-region-hint");
  }
  // Hide feedback line
  const feedbackLine = findElement("feedback-line");
  if (feedbackLine !== null) {
    feedbackLine.style.display = "none";
  }
  // Clear map labels
  const labelsGroup = findElement("map-labels");
  if (labelsGroup !== null) {
    labelsGroup.innerHTML = "";
  }
  // Hide zoom circle
  const zoomCircle = findElement("zoom-circle");
  if (zoomCircle !== null) {
    zoomCircle.classList.remove("animate");
    zoomCircle.setAttribute("opacity", "0");
  }
}

// ---------------------------------------------------------------------------
// Zoom circle animation (Seterra-style)
// ---------------------------------------------------------------------------

//============================================
export function showZoomCircle(schoolIndex: number): void {
  // Animated expanding ring on the correct dot location
  const coord = projectedCoords[schoolIndex];
  if (coord === undefined) {
    return;
  }
  const x = coord.x;
  const y = coord.y;
  const zoomCircle = findElement("zoom-circle");
  if (zoomCircle !== null) {
    zoomCircle.setAttribute("cx", String(x));
    zoomCircle.setAttribute("cy", String(y));
    zoomCircle.setAttribute("r", "6");
    zoomCircle.setAttribute("opacity", "1");
    // Trigger animation by removing and re-adding the class
    zoomCircle.classList.remove("animate");
    // Force reflow
    void zoomCircle.offsetWidth;
    zoomCircle.classList.add("animate");
  }
}

// ---------------------------------------------------------------------------
// Map labels (show school name near dot)
// ---------------------------------------------------------------------------

//============================================
export function showMapLabel(
  schoolIndex: number,
  text: string,
  color: string,
  _schools: NCAASchool[],
): void {
  // Add a text label near a dot on the map
  const labelsGroup = findElement("map-labels");
  const coord = projectedCoords[schoolIndex];
  if (labelsGroup === null || coord === undefined) {
    return;
  }
  const x = coord.x;
  const y = coord.y;

  // Background rect + text for readability
  const g = createSvgElement("g");
  g.setAttribute("class", "map-label-group");

  // Create text first to measure it
  const label = createSvgElement("text");
  label.setAttribute("x", String(x + 10));
  label.setAttribute("y", String(y - 8));
  label.setAttribute("class", "map-label");
  label.setAttribute("fill", color);
  label.textContent = text;

  // White background behind text
  const bg = createSvgElement("rect");
  bg.setAttribute("x", String(x + 7));
  bg.setAttribute("y", String(y - 20));
  bg.setAttribute("width", String(text.length * 7 + 6));
  bg.setAttribute("height", "16");
  bg.setAttribute("rx", "2");
  bg.setAttribute("fill", "white");
  bg.setAttribute("opacity", "0.85");

  g.appendChild(bg);
  g.appendChild(label);
  labelsGroup.appendChild(g);
}

// ---------------------------------------------------------------------------
// Feedback line
// ---------------------------------------------------------------------------

//============================================
export function showFeedbackLine(
  fromSchoolIndex: number,
  toSchoolIndex: number,
  _schools: NCAASchool[],
): void {
  const fromCoord = projectedCoords[fromSchoolIndex];
  const toCoord = projectedCoords[toSchoolIndex];
  if (fromCoord === undefined || toCoord === undefined) {
    return;
  }
  const feedbackLine = findElement("feedback-line");
  if (feedbackLine !== null) {
    feedbackLine.setAttribute("x1", String(fromCoord.x));
    feedbackLine.setAttribute("y1", String(fromCoord.y));
    feedbackLine.setAttribute("x2", String(toCoord.x));
    feedbackLine.setAttribute("y2", String(toCoord.y));
    feedbackLine.style.display = "block";
  }
}

// ---------------------------------------------------------------------------
// Region hints
// ---------------------------------------------------------------------------

//============================================
export function highlightRegionDots(hintRegion: string, schools: NCAASchool[]): void {
  const regionStates = SUBREGIONS[hintRegion] ?? [];
  const regionStatesSet: Record<string, boolean> = {};
  for (const state of regionStates) {
    regionStatesSet[state] = true;
  }

  const groups = document.querySelectorAll(".school-dot-group");
  for (const group of groups) {
    const attr = group.getAttribute("data-school-index");
    if (attr === null) {
      continue;
    }
    const idx = parseInt(attr, 10);
    if (Number.isNaN(idx)) {
      continue;
    }
    const school = schools[idx];
    // Only highlight unanswered dots in the region
    if (
      school !== undefined &&
      regionStatesSet[school.state] === true &&
      correctlyAnsweredIndices[idx] !== true
    ) {
      group.classList.add("dot-region-hint");
    }
  }
}

// ---------------------------------------------------------------------------
// School color theming (minimal - topbar is fixed dark)
// ---------------------------------------------------------------------------

//============================================
export function applySchoolColors(school: NCAASchool): void {
  // Topbar is fixed dark gray - just update the school name pill text
  const nameEl = findElement("question-text");
  if (nameEl !== null) {
    nameEl.textContent = school.name;
  }
}

// ---------------------------------------------------------------------------
// Score and progress display
// ---------------------------------------------------------------------------

//============================================
export function updateScoreDisplay(): void {
  // Score as percentage
  const scoreDisplay = findElement("score-display");
  if (scoreDisplay !== null && gameState.totalQuestions > 0) {
    let total = 0;
    for (const s of gameState.scores) {
      total += s;
    }
    const maxPossible = gameState.answers.length * 1000;
    const pct = maxPossible > 0 ? Math.round((total / maxPossible) * 100) : 0;
    scoreDisplay.textContent = `${pct}%`;
  }

  // Progress: "3 of 16"
  const progressDisplay = findElement("progress-display");
  if (progressDisplay !== null) {
    const answered = gameState.answers.length;
    const totalQ = gameState.totalQuestions;
    progressDisplay.textContent = `${answered} of ${totalQ}`;
  }

  // Streak indicator (show when streak >= 3)
  const streakDisplay = findElement("streak-display");
  if (streakDisplay !== null) {
    if (gameState.streak >= 3) {
      streakDisplay.textContent = `${gameState.streak}x streak`;
    } else {
      streakDisplay.textContent = "";
    }
  }

  // Timer
  const timerDisplay = findElement("timer-display");
  if (timerDisplay !== null) {
    timerDisplay.textContent = getElapsedFormatted();
  }
}

// ---------------------------------------------------------------------------
// Results screen
// ---------------------------------------------------------------------------

//============================================
export function showResultsScreen(results: GameResults): void {
  showScreen("results");

  // Update heading based on performance
  const maxScore = results.totalQuestions * 1000;
  const pct = maxScore > 0 ? Math.round((results.totalScore / maxScore) * 100) : 0;
  const headingEl = document.querySelector(".results-card h1");
  if (headingEl !== null) {
    if (pct === 100) {
      headingEl.textContent = "Perfect!";
    } else if (pct >= 80) {
      headingEl.textContent = "Great Job!";
    } else if (pct >= 50) {
      headingEl.textContent = "Good Effort!";
    } else {
      headingEl.textContent = "Keep Practicing!";
    }
  }

  // Show total score with max context
  const totalScoreEl = findElement("results-total-score");
  if (totalScoreEl !== null) {
    totalScoreEl.textContent = `${results.totalScore} / ${maxScore}`;
  }

  const timeEl = findElement("results-time");
  if (timeEl !== null) {
    const totalSec = Math.floor(results.elapsedMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const secStr = sec < 10 ? `0${sec}` : `${sec}`;
    timeEl.textContent = `${min}:${secStr}`;
  }

  const countEl = findElement("results-count");
  if (countEl !== null) {
    let correct = 0;
    for (const answer of results.answers) {
      if (answer.correct) {
        correct++;
      }
    }
    countEl.textContent = `${correct}/${results.totalQuestions}`;
  }

  // Best streak
  const streakEl = findElement("results-streak");
  if (streakEl !== null) {
    streakEl.textContent = `${results.bestStreak}`;
  }

  // Save best score and show "New Best!" if applicable
  if (results.tierName !== "") {
    const isNewBest = saveBestScore(results.tierName, results.totalScore, results.totalQuestions);
    const bestScoreEl = findElement("results-best-score");
    if (bestScoreEl !== null) {
      const bestPct = loadBestScore(results.tierName);
      if (bestPct !== null) {
        if (isNewBest) {
          bestScoreEl.textContent = `New Best! ${bestPct}%`;
          bestScoreEl.style.color = "var(--success-color)";
        } else {
          bestScoreEl.textContent = `Best: ${bestPct}%`;
          bestScoreEl.style.color = "";
        }
      }
    }
  }

  // Build results table body
  const tableBody = document.querySelector("#results-table tbody");
  if (tableBody !== null) {
    tableBody.innerHTML = "";
    for (const answer of results.answers) {
      const row = document.createElement("tr");
      // Color-code by attempt count
      const attempts = answer.clickedSchools.length;
      if (answer.correct && attempts === 1) {
        row.className = "result-attempt-1";
      } else if (answer.correct && attempts === 2) {
        row.className = "result-attempt-2";
      } else if (answer.correct && attempts === 3) {
        row.className = "result-attempt-3";
      } else {
        row.className = "result-missed";
      }

      const nameCell = document.createElement("td");
      nameCell.textContent = answer.school.shortName;
      row.appendChild(nameCell);

      const attemptsCell = document.createElement("td");
      attemptsCell.textContent = answer.correct ? `${attempts}` : "missed";
      row.appendChild(attemptsCell);

      const timeCell = document.createElement("td");
      // Format question time as seconds with one decimal
      const timeSec = answer.questionTimeMs > 0 ? (answer.questionTimeMs / 1000).toFixed(1) : "-";
      timeCell.textContent = `${timeSec}s`;
      row.appendChild(timeCell);

      const scoreCell = document.createElement("td");
      scoreCell.textContent = `${answer.score}`;
      row.appendChild(scoreCell);

      tableBody.appendChild(row);
    }
  }
}

// ---------------------------------------------------------------------------
// Hover tooltip (shows school name on dot hover)
// ---------------------------------------------------------------------------

//============================================
export function updateCursorLabel(svgX: number, svgY: number): void {
  // Move the current question label to follow the mouse on the map
  const currentSchool = gameState.currentSchool;
  if (currentSchool === null) {
    return;
  }

  const tooltipGroup = findElement("hover-tooltip");
  const tooltipText = findElement("hover-tooltip-text");
  const tooltipBg = findElement("hover-tooltip-bg");
  if (tooltipGroup === null || tooltipText === null || tooltipBg === null) {
    return;
  }

  const labelText = currentSchool.shortName;
  const textWidth = labelText.length * 7.2 + 10;

  // Position label offset below-right of cursor
  let textX = svgX + 16;
  let textY = svgY + 20;

  // Clamp to stay within the 960x600 viewBox
  if (textX + textWidth > 955) {
    textX = svgX - textWidth - 6;
  }
  if (textY > 590) {
    textY = svgY - 10;
  }

  // Update text content and position
  tooltipText.textContent = labelText;
  tooltipText.setAttribute("x", String(textX + 5));
  tooltipText.setAttribute("y", String(textY));

  // Update background rectangle
  tooltipBg.setAttribute("x", String(textX));
  tooltipBg.setAttribute("y", String(textY - 13));
  tooltipBg.setAttribute("width", String(textWidth));
  tooltipBg.setAttribute("height", "18");

  // Show the tooltip group
  tooltipGroup.style.display = "block";
}

//============================================
export function hideCursorLabel(): void {
  // Hide the cursor-following label
  const tooltipGroup = findElement("hover-tooltip");
  if (tooltipGroup !== null) {
    tooltipGroup.style.display = "none";
  }
}

// ---------------------------------------------------------------------------
// School list sidebar
// ---------------------------------------------------------------------------

//============================================
export function initSidebar(schools: NCAASchool[]): void {
  // Build alphabetically sorted index list and populate sidebar
  sidebarSortedIndices = [];
  for (let i = 0; i < schools.length; i++) {
    sidebarSortedIndices.push(i);
  }
  // Sort by shortName alphabetically
  sidebarSortedIndices.sort((a, b) => {
    const schoolA = schools[a];
    const schoolB = schools[b];
    if (schoolA === undefined || schoolB === undefined) {
      return 0;
    }
    const nameA = schoolA.shortName.toLowerCase();
    const nameB = schoolB.shortName.toLowerCase();
    if (nameA < nameB) {
      return -1;
    }
    if (nameA > nameB) {
      return 1;
    }
    return 0;
  });

  // Build the list HTML for both sidebar and mobile drawer
  const listEls = [findElement("remaining-list"), findElement("mobile-remaining-list")];

  for (const listEl of listEls) {
    if (listEl === null) {
      continue;
    }
    listEl.innerHTML = "";
    // Use a prefix to distinguish sidebar vs mobile list item IDs
    const prefix = listEl.id === "remaining-list" ? "sidebar-item-" : "mobile-item-";

    for (const idx of sidebarSortedIndices) {
      const school = schools[idx];
      if (school === undefined) {
        continue;
      }
      const li = document.createElement("li");
      li.setAttribute("data-school-index", String(idx));
      li.setAttribute("id", `${prefix}${idx}`);
      li.textContent = school.shortName;
      listEl.appendChild(li);
    }
  }
}

//============================================
export function updateRemainingList(_remaining: string[], schools: NCAASchool[]): void {
  // Update sidebar to reflect current game state
  if (schools.length === 0) {
    return;
  }

  const currentSchool = gameState.currentSchool;
  const currentName = currentSchool !== null ? currentSchool.shortName : "";

  // Update both sidebar and mobile list
  const prefixes = ["sidebar-item-", "mobile-item-"];
  for (const prefix of prefixes) {
    for (let i = 0; i < schools.length; i++) {
      const li = findElement(`${prefix}${i}`);
      if (li === null) {
        continue;
      }

      // Clear previous state classes
      li.classList.remove("sidebar-current", "sidebar-answered");
      li.innerHTML = "";

      const school = schools[i];
      if (school === undefined) {
        continue;
      }

      if (correctlyAnsweredIndices[i] === true) {
        // Answered: strikethrough + school color dot
        li.classList.add("sidebar-answered");
        // Only add colored dot in sidebar, not mobile (saves space)
        if (prefix === "sidebar-item-") {
          const dot = document.createElement("span");
          dot.className = "sidebar-dot";
          dot.style.backgroundColor = getDotColor(school);
          li.appendChild(dot);
        }
        const text = document.createTextNode(school.shortName);
        li.appendChild(text);
      } else if (school.shortName === currentName) {
        // Current question: highlighted
        li.classList.add("sidebar-current");
        li.textContent = school.shortName;
      } else {
        // Unanswered
        li.textContent = school.shortName;
      }
    }
  }

  // Scroll current item into view (sidebar only)
  if (currentSchool !== null) {
    let currentIndex = -1;
    for (let k = 0; k < schools.length; k++) {
      const school = schools[k];
      if (school !== undefined && school.shortName === currentSchool.shortName) {
        currentIndex = k;
        break;
      }
    }
    if (currentIndex !== -1) {
      const currentLi = findElement(`sidebar-item-${currentIndex}`);
      if (currentLi !== null) {
        currentLi.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// State abbreviation labels (toggle, default OFF)
// ---------------------------------------------------------------------------

//============================================
export function renderStateLabels(): void {
  // Add 2-letter state abbreviation labels at centroid positions
  const svg = findElement("game-map");
  if (svg === null) {
    return;
  }

  // Remove any existing state label group
  const existing = findElement("state-labels");
  if (existing !== null) {
    existing.remove();
  }

  // Create a new group for state labels
  const g = createSvgElement("g");
  g.setAttribute("id", "state-labels");
  g.setAttribute("pointer-events", "none");

  // Read theme color for labels
  const labelColor =
    getComputedStyle(document.documentElement).getPropertyValue("--state-stroke").trim() || "#bbb";

  for (const state of US_STATE_PATHS) {
    if (state.labelX === 0 || state.labelY === 0) {
      continue;
    }

    const text = createSvgElement("text");
    text.setAttribute("x", String(state.labelX));
    text.setAttribute("y", String(state.labelY));
    text.setAttribute("font-size", "9");
    text.setAttribute("font-family", "-apple-system, BlinkMacSystemFont, sans-serif");
    text.setAttribute("font-weight", "600");
    text.setAttribute("fill", labelColor);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.textContent = state.id;
    g.appendChild(text);
  }

  // Insert before the school-dots group so labels are behind dots
  const dotsGroup = findElement("school-dots");
  if (dotsGroup !== null) {
    svg.insertBefore(g, dotsGroup);
  } else {
    svg.appendChild(g);
  }
}

//============================================
export function removeStateLabels(): void {
  const existing = findElement("state-labels");
  if (existing !== null) {
    existing.remove();
  }
}

//============================================
export function toggleStateLabels(show: boolean): void {
  stateLabelsVisible = show;
  if (show) {
    renderStateLabels();
  } else {
    removeStateLabels();
  }
  // Save preference
  localStorage.setItem("ncaa-show-state-labels", show ? "1" : "0");
}

// ---------------------------------------------------------------------------
// Share results (Wordle-style)
// ---------------------------------------------------------------------------

//============================================
export function generateShareText(results: GameResults): string {
  // Build a shareable text summary with emoji grid
  const maxScore = results.totalQuestions * 1000;
  const pct = maxScore > 0 ? Math.round((results.totalScore / maxScore) * 100) : 0;
  const tierLabel = results.tierName !== "" ? results.tierName : "NCAA";

  // Header lines
  let text = `NCAA School Find - ${tierLabel}\n`;
  text += `Score: ${pct}% (${results.totalScore}/${maxScore})\n`;

  // Emoji grid: each answer gets a colored square
  let grid = "";
  for (let i = 0; i < results.answers.length; i++) {
    const answer = results.answers[i];
    if (answer === undefined) {
      continue;
    }
    const attempts = answer.clickedSchools.length;
    if (answer.correct && attempts === 1) {
      grid += String.fromCodePoint(0x1f7e9);
    } else if (answer.correct && attempts === 2) {
      grid += String.fromCodePoint(0x1f7e8);
    } else if (answer.correct && attempts === 3) {
      grid += String.fromCodePoint(0x1f7e7);
    } else {
      grid += String.fromCodePoint(0x1f7e5);
    }
    // Line break every 10 schools
    if ((i + 1) % 10 === 0) {
      grid += "\n";
    }
  }
  text += `${grid.trim()}\n`;

  return text;
}

//============================================
export async function copyShareResults(results: GameResults): Promise<boolean> {
  const text = generateShareText(results);

  // Use the modern async clipboard API when available
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}
