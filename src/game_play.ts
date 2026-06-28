/**
 * Core gameplay loop for the NCAA School Find game.
 *
 * Ports parts/game_play.js: wires user interaction to game state and UI.
 * Owns dotClicksEnabled and updateScoreInterval as module-local bindings
 * mutated only through setDotClicksEnabled, startTimerUpdates, and
 * stopTimerUpdates.
 */

import type { NCAASchool } from "./types";
import { findElement } from "./dom_utils";
import {
  gameState,
  recordAttempt,
  scoreAnswer,
  advanceAfterReveal,
  getResults,
} from "./game_state";
import {
  applySchoolColors,
  updateScoreDisplay,
  clearHighlights,
  hideCursorLabel,
  markDotAnswered,
  showZoomCircle,
  showMapLabel,
  markDotWrong,
  highlightRegionDots,
  showFeedbackLine,
  showResultsScreen,
  isAnswered,
  updateRemainingList,
} from "./game_ui";

// ---------------------------------------------------------------------------
// Module-local mutable state
// ---------------------------------------------------------------------------

// Controls whether dot clicks on the map are processed
let dotClicksEnabled = true;

// setInterval handle for the periodic score display refresh (null when stopped)
let updateScoreInterval: number | null = null;

// ---------------------------------------------------------------------------
// Show next question
// ---------------------------------------------------------------------------

/**
 * Displays the current question: applies school colors to the topbar, refreshes
 * the score display, clears temporary map highlights, resets the feedback panel,
 * updates the sidebar, and re-enables dot clicking.
 */
export function showNextQuestion(): void {
  const school = gameState.currentSchool;
  if (school === null) {
    return;
  }

  // Apply school brand colors to the topbar name pill
  applySchoolColors(school);

  // Refresh elapsed-time score display
  updateScoreDisplay();

  // Remove wrong/hint highlight classes (answered dots keep their color)
  clearHighlights();

  // Clear feedback panel text from the previous question
  const feedbackPanel = findElement("feedback-panel");
  if (feedbackPanel) {
    feedbackPanel.textContent = "";
  }

  // Refresh sidebar to highlight the current question school
  updateRemainingList(gameState.remaining, gameState.schools);

  // Allow the player to click dots for the new question
  setDotClicksEnabled(true);
}

// ---------------------------------------------------------------------------
// Handle dot click
// ---------------------------------------------------------------------------

/**
 * Event handler registered via addEventListener("click", handleDotClick) on
 * the school-dots SVG group. Processes one click attempt for the current
 * question and updates the map and feedback panel accordingly.
 *
 * @param event - The MouseEvent fired by clicking a school dot group.
 */
export function handleDotClick(event: MouseEvent): void {
  if (!dotClicksEnabled) {
    return;
  }

  // Walk up from the click target to the nearest school-dot-group element
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const group = target.closest(".school-dot-group");
  if (group === null) {
    return;
  }

  // Read the school index from the data attribute
  const indexAttr = group.getAttribute("data-school-index");
  const schoolIndex = parseInt(indexAttr ?? "", 10);
  if (isNaN(schoolIndex)) {
    return;
  }

  // Ignore clicks on dots that were already answered correctly
  if (isAnswered(schoolIndex)) {
    return;
  }

  // Guard: school must exist at this index (noUncheckedIndexedAccess)
  const clickedSchool: NCAASchool | undefined = gameState.schools[schoolIndex];
  if (clickedSchool === undefined) {
    return;
  }

  // Remove hover tooltip while processing the click
  hideCursorLabel();

  // Record the attempt and get correctness + attempt count
  const result = recordAttempt(clickedSchool);
  const correct = result.correct;
  const attemptsUsed = result.attemptsUsed;

  const feedbackPanel = findElement("feedback-panel");
  const currentSchool = gameState.currentSchool;
  if (currentSchool === null) {
    return;
  }

  // Find the index of the correct school in gameState.schools for map annotations
  let correctIndex = -1;
  for (let i = 0; i < gameState.schools.length; i++) {
    const s: NCAASchool | undefined = gameState.schools[i];
    if (s !== undefined && s.shortName === currentSchool.shortName) {
      correctIndex = i;
      break;
    }
  }

  if (correct) {
    // === CORRECT ANSWER ===
    scoreAnswer();

    // Mark dot permanently answered with the school's primary color
    markDotAnswered(schoolIndex, gameState.schools);

    // Play the zoom circle animation on the correct dot
    showZoomCircle(schoolIndex);

    // Label the dot with the school short name in green
    showMapLabel(schoolIndex, currentSchool.shortName, "#155724", gameState.schools);

    // Show score earned in the feedback panel
    if (feedbackPanel) {
      const answers = gameState.answers;
      const scoreRecord = answers[answers.length - 1];
      if (scoreRecord !== undefined) {
        feedbackPanel.textContent = `${currentSchool.shortName} - +${String(scoreRecord.score)}`;
      }
    }

    // Disable further clicks and immediately advance to the next question
    setDotClicksEnabled(false);
    handleNextButton();
  } else if (attemptsUsed === 1) {
    // === FIRST WRONG ATTEMPT ===
    markDotWrong(schoolIndex);

    // Label the clicked dot with the wrong school name in red
    showMapLabel(schoolIndex, clickedSchool.shortName, "#721c24", gameState.schools);

    if (feedbackPanel) {
      feedbackPanel.textContent = `That is ${clickedSchool.shortName}. Try again.`;
    }

    // Remove the wrong highlight and label after 800ms
    window.setTimeout(() => {
      const g = document.querySelector(
        `.school-dot-group[data-school-index='${String(schoolIndex)}']`,
      );
      if (g) {
        g.classList.remove("dot-wrong");
      }
      const labelsGroup = findElement("map-labels");
      if (labelsGroup !== null) {
        labelsGroup.innerHTML = "";
      }
    }, 800);
  } else if (attemptsUsed === 2) {
    // === SECOND WRONG ATTEMPT ===
    markDotWrong(schoolIndex);

    // Label the clicked dot with the wrong school name in red
    showMapLabel(schoolIndex, clickedSchool.shortName, "#721c24", gameState.schools);

    // Pulse region hint dots to give the player a geographic clue
    highlightRegionDots(currentSchool.hintRegion, gameState.schools);

    if (feedbackPanel) {
      feedbackPanel.textContent = `That is ${clickedSchool.shortName}. Look in the ${currentSchool.hintRegion}.`;
    }

    // Remove the wrong highlight after 800ms (region hint dots stay visible)
    window.setTimeout(() => {
      const g = document.querySelector(
        `.school-dot-group[data-school-index='${String(schoolIndex)}']`,
      );
      if (g) {
        g.classList.remove("dot-wrong");
      }
    }, 800);
  } else if (attemptsUsed === 3) {
    // === THIRD WRONG ATTEMPT (ALL MISSED) ===
    scoreAnswer();

    // Mark the wrongly clicked dot and reveal the correct dot
    markDotWrong(schoolIndex);
    if (correctIndex !== -1) {
      markDotAnswered(correctIndex, gameState.schools);
      showZoomCircle(correctIndex);
    }

    // Label both the wrong dot (red) and the correct dot (green)
    showMapLabel(schoolIndex, clickedSchool.shortName, "#721c24", gameState.schools);
    if (correctIndex !== -1) {
      showMapLabel(correctIndex, currentSchool.shortName, "#155724", gameState.schools);
    }

    // Draw a line connecting the wrong click to the correct location
    if (correctIndex !== -1) {
      showFeedbackLine(schoolIndex, correctIndex, gameState.schools);
    }

    // Show partial score in the feedback panel
    if (feedbackPanel) {
      const answers = gameState.answers;
      const scoreRecord = answers[answers.length - 1];
      if (scoreRecord !== undefined) {
        feedbackPanel.textContent = `${currentSchool.shortName} was here. +${String(scoreRecord.score)}`;
      }
    }

    // Disable clicks and auto-advance after a brief pause so the player can see
    // the correct location before moving on
    setDotClicksEnabled(false);
    window.setTimeout(handleNextButton, 2000);
  }
}

// ---------------------------------------------------------------------------
// Handle next button
// ---------------------------------------------------------------------------

/**
 * Advances the game after an answer is revealed.
 * Ends the round and shows the results screen when all questions are answered;
 * otherwise shows the next question.
 */
export function handleNextButton(): void {
  // Clear temporary highlights before advancing (answered dots keep their color)
  clearHighlights();

  const result = advanceAfterReveal();

  if (result === null) {
    // All questions answered: stop score updates and display results
    stopTimerUpdates();
    const finalResults = getResults();
    showResultsScreen(finalResults);
  } else {
    showNextQuestion();
  }
}

// ---------------------------------------------------------------------------
// Enable or disable dot clicks
// ---------------------------------------------------------------------------

/**
 * Sets whether dot clicks on the map are processed.
 *
 * @param enabled - Pass true to allow clicks; false to ignore them.
 */
export function setDotClicksEnabled(enabled: boolean): void {
  dotClicksEnabled = enabled;
}

// ---------------------------------------------------------------------------
// Timer update helpers
// ---------------------------------------------------------------------------

/**
 * Starts a 200ms interval that refreshes the score display while the game is
 * in the "playing" or "revealed" screen state. Clears any existing interval
 * before starting a new one to prevent duplicate timers.
 */
export function startTimerUpdates(): void {
  if (updateScoreInterval !== null) {
    window.clearInterval(updateScoreInterval);
  }
  updateScoreInterval = window.setInterval(() => {
    if (gameState.screen === "playing" || gameState.screen === "revealed") {
      updateScoreDisplay();
    }
  }, 200);
}

/**
 * Stops the periodic score-display interval and resets the handle to null.
 */
export function stopTimerUpdates(): void {
  if (updateScoreInterval !== null) {
    window.clearInterval(updateScoreInterval);
    updateScoreInterval = null;
  }
}
