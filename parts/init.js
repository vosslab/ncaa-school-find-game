// init.js - Bootstrap the game on DOMContentLoaded
// Wires up all event handlers and initializes the game.

//============================================
// Initialize game when DOM is ready
document.addEventListener("DOMContentLoaded", function() {
	// Show setup screen
	showSetupScreen();

	// Wire up start button click
	var startButton = document.getElementById("start-button");
	if (startButton) {
		startButton.addEventListener("click", function() {
			// Read checked conference checkboxes
			var checkboxes = document.querySelectorAll(".conference-checkbox:checked");
			var selectedConferences = [];
			checkboxes.forEach(function(cb) {
				selectedConferences.push(cb.value);
			});

			// Validate at least one conference is selected
			if (selectedConferences.length === 0) {
				alert("Select at least one conference");
				return;
			}

			// Start the game
			startGame(selectedConferences);

			// Show game screen
			showScreen("game");

			// Render the map with all schools
			renderMap(gameState.schools);

			// Initialize the sidebar school list
			initSidebar(gameState.schools);

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
