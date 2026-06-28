/**
 * init.ts - Bootstrap and DOM event wiring for the NCAA School Find game.
 *
 * Exports initApp(), which queries DOM elements, attaches all event listeners,
 * runs initTheme + updateTierCounts, and shows the setup screen. Called once
 * from the DOMContentLoaded listener in main.ts.
 *
 * Ports parts/init.js; getSchoolsForTier/countSchoolsForTier are imported from
 * src/constants.ts (not reimplemented here).
 */

import { gameState, startGame, getResults } from "./game_state";
import {
  showScreen,
  showSetupScreen,
  renderMap,
  initSidebar,
  renderStateLabels,
  updateCursorLabel,
  hideCursorLabel,
  toggleStateLabels,
  copyShareResults,
} from "./game_ui";
import {
  showNextQuestion,
  handleDotClick,
  handleNextButton,
  startTimerUpdates,
  stopTimerUpdates,
} from "./game_play";
import { countSchoolsForTier, getSchoolsForTier } from "./constants";

//============================================
function initTheme(): void {
  // Check localStorage for saved theme preference (dark or light)
  const saved = localStorage.getItem("ncaa-theme");
  if (saved === "dark" || saved === "light") {
    document.documentElement.setAttribute("data-theme", saved);
  }
  // If no saved preference, CSS @media prefers-color-scheme handles the default
}

//============================================
function toggleTheme(): void {
  // Cycle through: system -> light -> dark -> system
  const current = document.documentElement.getAttribute("data-theme");
  if (current === null) {
    // Currently system default, switch to light
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("ncaa-theme", "light");
  } else if (current === "light") {
    // Light -> switch to dark
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("ncaa-theme", "dark");
  } else {
    // Dark -> remove attribute (back to system default)
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("ncaa-theme");
  }
}

//============================================
function updateTierCounts(): void {
  // Update the school count labels next to each tier radio button
  const radios = document.querySelectorAll<HTMLInputElement>(".tier-radio");
  for (const radio of radios) {
    const count = countSchoolsForTier(radio.value);
    const label = radio.parentElement;
    if (label === null) {
      continue;
    }
    const countSpan = label.querySelector(".tier-count");
    if (countSpan !== null) {
      // Display count as "(N schools)" beside the radio label
      countSpan.textContent = `(${count} schools)`;
    }
  }
}

//============================================
export function initApp(): void {
  // Initialize theme from localStorage or system default
  initTheme();

  // Show the setup screen as the initial view
  showSetupScreen();

  // Update tier school counts on page load
  updateTierCounts();

  // Wire up theme toggle buttons (setup screen and game topbar)
  const themeToggleSetup = document.getElementById("theme-toggle-setup");
  if (themeToggleSetup !== null) {
    themeToggleSetup.addEventListener("click", toggleTheme);
  }
  const themeToggleGame = document.getElementById("theme-toggle-game");
  if (themeToggleGame !== null) {
    themeToggleGame.addEventListener("click", toggleTheme);
  }

  // Wire up start button click
  const startButton = document.getElementById("start-button");
  if (startButton !== null) {
    startButton.addEventListener("click", () => {
      // Read selected tier radio button
      const selectedRadio = document.querySelector<HTMLInputElement>(".tier-radio:checked");
      if (selectedRadio === null) {
        // Show inline error instead of alert()
        const errorEl = document.getElementById("setup-error");
        if (errorEl !== null) {
          errorEl.style.display = "block";
        }
        return;
      }

      // Hide any previous error message
      const errorEl = document.getElementById("setup-error");
      if (errorEl !== null) {
        errorEl.style.display = "none";
      }

      // Get filtered schools for the selected tier
      const tierName = selectedRadio.value;
      const filteredSchools = getSchoolsForTier(tierName);

      // Start the game with the filtered schools
      startGame(filteredSchools, tierName);

      // Transition to the game screen
      showScreen("game");

      // Render the map with all schools for this tier
      renderMap(gameState.schools);

      // Initialize the sidebar school list
      initSidebar(gameState.schools);

      // Render state labels if toggle is on
      const stateLabelsEl = document.getElementById("show-state-labels") as HTMLInputElement | null;
      if (stateLabelsEl !== null && stateLabelsEl.checked) {
        renderStateLabels();
      }

      // Show the first question
      showNextQuestion();

      // Start timer updates for the elapsed-time display
      startTimerUpdates();
    });
  }

  // Wire up next button click
  const nextButton = document.getElementById("next-button");
  if (nextButton !== null) {
    nextButton.addEventListener("click", handleNextButton);
  }

  // Wire up share results button (copyShareResults is async; void the promise)
  const shareButton = document.getElementById("share-results-button");
  if (shareButton !== null) {
    shareButton.addEventListener("click", () => {
      const handleShare = async (): Promise<void> => {
        const results = getResults();
        const copied = await copyShareResults(results);
        if (copied) {
          // Briefly change button text to confirm copy
          shareButton.textContent = "Copied!";
          window.setTimeout(() => {
            shareButton.textContent = "Copy Results";
          }, 2000);
        }
      };
      void handleShare();
    });
  }

  // Wire up play again button click
  const playAgainButton = document.getElementById("play-again-button");
  if (playAgainButton !== null) {
    playAgainButton.addEventListener("click", () => {
      // Stop timer updates before returning to setup
      stopTimerUpdates();

      // Reset and show setup screen
      showSetupScreen();
    });
  }

  // Wire up click event delegation on school dots (SVG group)
  const schoolDotsGroup = document.getElementById("school-dots");
  if (schoolDotsGroup !== null) {
    schoolDotsGroup.addEventListener("click", handleDotClick);
  }

  // Cursor-following label: current question name tracks the mouse across the map
  // Cast to SVGSVGElement at the DOM boundary to access createSVGPoint/getScreenCTM
  const gameMap = document.getElementById("game-map") as SVGSVGElement | null;
  if (gameMap !== null) {
    gameMap.addEventListener("mousemove", (event: MouseEvent) => {
      // Convert page coordinates to SVG viewBox coordinates
      const pt = gameMap.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const ctm = gameMap.getScreenCTM();
      if (ctm !== null) {
        const svgPt = pt.matrixTransform(ctm.inverse());
        updateCursorLabel(svgPt.x, svgPt.y);
      }
    });

    gameMap.addEventListener("mouseleave", () => {
      hideCursorLabel();
    });
  }

  // Wire up state labels toggle
  // Cast to HTMLInputElement at the DOM boundary to access .checked
  const stateLabelsCheckbox = document.getElementById(
    "show-state-labels",
  ) as HTMLInputElement | null;
  if (stateLabelsCheckbox !== null) {
    // Load saved preference (default is OFF)
    const savedPref = localStorage.getItem("ncaa-show-state-labels");
    if (savedPref === "1") {
      stateLabelsCheckbox.checked = true;
    }
    stateLabelsCheckbox.addEventListener("change", () => {
      toggleStateLabels(stateLabelsCheckbox.checked);
    });
  }

  // Wire up mobile drawer toggle
  const drawerHandle = document.getElementById("mobile-drawer-handle");
  if (drawerHandle !== null) {
    drawerHandle.addEventListener("click", () => {
      const drawer = document.getElementById("mobile-drawer");
      if (drawer !== null) {
        drawer.classList.toggle("drawer-open");
      }
    });
  }

  // Wire up keyboard handlers for Enter and Space keys
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    // Trigger next-button if it is visible and Enter or Space is pressed
    const nextBtn = document.getElementById("next-button");
    if (nextBtn !== null && nextBtn.style.display !== "none") {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        nextBtn.click();
      }
    }
  });
}
