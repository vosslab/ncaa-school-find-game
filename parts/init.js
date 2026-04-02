// init.js - Bootstrap the game on DOMContentLoaded
// Wires up all event handlers and initializes the game.

//============================================
function getSchoolsForTier(tierName) {
	// Find the tier definition matching the given name
	for (var i = 0; i < DIFFICULTY_TIERS.length; i++) {
		var tier = DIFFICULTY_TIERS[i];
		if (tier.name !== tierName) {
			continue;
		}
		// Filter schools based on tier type
		if (tier.type === "all") {
			return NCAA_SCHOOLS.slice();
		}
		var values = tier.values;
		if (tier.type === "conference") {
			return NCAA_SCHOOLS.filter(function(school) {
				return values.indexOf(school.conference) !== -1;
			});
		}
		if (tier.type === "subdivision") {
			return NCAA_SCHOOLS.filter(function(school) {
				return values.indexOf(school.subdivision) !== -1;
			});
		}
	}
	return [];
}

//============================================
function countSchoolsForTier(tierName) {
	// Count how many schools belong to the selected tier
	var schools = getSchoolsForTier(tierName);
	return schools.length;
}

//============================================
function initTheme() {
	// Check localStorage for saved preference
	var saved = localStorage.getItem("ncaa-theme");
	if (saved === "dark" || saved === "light") {
		document.documentElement.setAttribute("data-theme", saved);
	}
	// Otherwise, system default via CSS @media query handles it
}

//============================================
function toggleTheme() {
	// Cycle through: system -> light -> dark -> system
	var current = document.documentElement.getAttribute("data-theme");
	var newTheme;
	if (!current) {
		// Currently system default, switch to light
		newTheme = "light";
	} else if (current === "light") {
		newTheme = "dark";
	} else {
		// Dark -> remove attribute (back to system default)
		document.documentElement.removeAttribute("data-theme");
		localStorage.removeItem("ncaa-theme");
		return;
	}
	document.documentElement.setAttribute("data-theme", newTheme);
	localStorage.setItem("ncaa-theme", newTheme);
}

//============================================
function updateTierCounts() {
	// Update the school count labels next to each tier radio button
	var radios = document.querySelectorAll(".tier-radio");
	for (var j = 0; j < radios.length; j++) {
		var count = countSchoolsForTier(radios[j].value);
		var label = radios[j].parentElement;
		var countSpan = label.querySelector(".tier-count");
		if (countSpan) {
			countSpan.textContent = "(" + count + " schools)";
		}
	}
}

//============================================
// Initialize game when DOM is ready
document.addEventListener("DOMContentLoaded", function() {
	// Initialize theme from localStorage or system default
	initTheme();

	// Show setup screen
	showSetupScreen();

	// Wire up theme toggle buttons
	var themeToggleSetup = document.getElementById("theme-toggle-setup");
	if (themeToggleSetup) {
		themeToggleSetup.addEventListener("click", toggleTheme);
	}
	var themeToggleGame = document.getElementById("theme-toggle-game");
	if (themeToggleGame) {
		themeToggleGame.addEventListener("click", toggleTheme);
	}

	// Update tier school counts on page load
	updateTierCounts();

	// Wire up start button click
	var startButton = document.getElementById("start-button");
	if (startButton) {
		startButton.addEventListener("click", function() {
			// Read selected tier radio button
			var selectedRadio = document.querySelector(".tier-radio:checked");
			if (!selectedRadio) {
				// Show inline error instead of alert()
				var errorEl = document.getElementById("setup-error");
				if (errorEl) {
					errorEl.style.display = "block";
				}
				return;
			}

			// Hide any previous error
			var errorEl = document.getElementById("setup-error");
			if (errorEl) {
				errorEl.style.display = "none";
			}

			// Get filtered schools for the selected tier
			var tierName = selectedRadio.value;
			var filteredSchools = getSchoolsForTier(tierName);

			// Start the game with the filtered schools
			startGame(filteredSchools, tierName);

			// Show game screen
			showScreen("game");

			// Render the map with all schools
			renderMap(gameState.schools);

			// Initialize the sidebar school list
			initSidebar(gameState.schools);

			// Render state labels if toggle is on
			var stateLabelsCheckbox = document.getElementById("show-state-labels");
			if (stateLabelsCheckbox && stateLabelsCheckbox.checked) {
				renderStateLabels();
			}

			// Show the first question
			showNextQuestion();

			// Start timer updates
			startTimerUpdates();
		});
	}

	// Wire up next button click
	var nextButton = document.getElementById("next-button");
	if (nextButton) {
		nextButton.addEventListener("click", handleNextButton);
	}

	// Wire up share results button
	var shareButton = document.getElementById("share-results-button");
	if (shareButton) {
		shareButton.addEventListener("click", function() {
			var results = getResults();
			var copied = copyShareResults(results);
			if (copied) {
				shareButton.textContent = "Copied!";
				setTimeout(function() {
					shareButton.textContent = "Copy Results";
				}, 2000);
			}
		});
	}

	// Wire up play again button click
	var playAgainButton = document.getElementById("play-again-button");
	if (playAgainButton) {
		playAgainButton.addEventListener("click", function() {
			// Stop timer updates
			stopTimerUpdates();

			// Reset and show setup
			showSetupScreen();
		});
	}

	// Wire up click event delegation on school dots
	var schoolDotsGroup = document.getElementById("school-dots");
	if (schoolDotsGroup) {
		schoolDotsGroup.addEventListener("click", handleDotClick);
	}

	// Cursor-following label: current question name tracks the mouse across the map
	var gameMap = document.getElementById("game-map");
	if (gameMap) {
		gameMap.addEventListener("mousemove", function(event) {
			// Convert page coordinates to SVG viewBox coordinates
			var pt = gameMap.createSVGPoint();
			pt.x = event.clientX;
			pt.y = event.clientY;
			var svgPt = pt.matrixTransform(gameMap.getScreenCTM().inverse());
			updateCursorLabel(svgPt.x, svgPt.y);
		});

		gameMap.addEventListener("mouseleave", function() {
			hideCursorLabel();
		});
	}

	// Wire up state labels toggle
	var stateLabelsCheckbox = document.getElementById("show-state-labels");
	if (stateLabelsCheckbox) {
		// Load saved preference (default OFF)
		var savedPref = localStorage.getItem("ncaa-show-state-labels");
		if (savedPref === "1") {
			stateLabelsCheckbox.checked = true;
		}
		stateLabelsCheckbox.addEventListener("change", function() {
			toggleStateLabels(stateLabelsCheckbox.checked);
		});
	}

	// Wire up mobile drawer toggle
	var drawerHandle = document.getElementById("mobile-drawer-handle");
	if (drawerHandle) {
		drawerHandle.addEventListener("click", function() {
			var drawer = document.getElementById("mobile-drawer");
			if (drawer) {
				drawer.classList.toggle("drawer-open");
			}
		});
	}

	// Wire up keyboard handlers for Enter and Space
	document.addEventListener("keydown", function(event) {
		// Check if next-button is visible
		var nextButton = document.getElementById("next-button");
		if (nextButton && nextButton.style.display !== "none") {
			// Enter or Space key
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				nextButton.click();
			}
		}
	});
});
