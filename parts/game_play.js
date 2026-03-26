// game_play.js - Core gameplay loop with three-attempt mechanic
// Handles dot clicks, answer feedback, and progression through the game.

//============================================
// Module-level state
var dotClicksEnabled = true;
var updateScoreInterval = null;

//============================================
// Show the next question on screen
function showNextQuestion() {
	var school = gameState.currentSchool;
	if (!school) {
		return;
	}

	// Update the school name in the topbar
	applySchoolColors(school);

	// Update score display
	updateScoreDisplay();

	// Clear temporary highlights (keep answered dots colored)
	clearHighlights();

	// Clear feedback panel text
	var feedbackPanel = document.getElementById("feedback-panel");
	if (feedbackPanel) {
		feedbackPanel.textContent = "";
	}

	// Update sidebar to reflect current question
	updateRemainingList(gameState.remaining, gameState.schools);

	// Enable dot clicking
	setDotClicksEnabled(true);
}

//============================================
// Handle dot click event
function handleDotClick(event) {
	if (!dotClicksEnabled) {
		return;
	}

	// Find the clicked school-dot-group
	var group = event.target.closest(".school-dot-group");
	if (!group) {
		return;
	}

	var schoolIndex = parseInt(group.getAttribute("data-school-index"), 10);
	if (isNaN(schoolIndex)) {
		return;
	}

	// Skip clicks on already-answered dots
	if (correctlyAnsweredIndices[schoolIndex]) {
		return;
	}

	var clickedSchool = gameState.schools[schoolIndex];
	if (!clickedSchool) {
		return;
	}

	// Hide cursor label during click feedback
	hideCursorLabel();

	// Record this attempt
	var result = recordAttempt(clickedSchool);
	var correct = result.correct;
	var attemptsUsed = result.attemptsUsed;

	var feedbackPanel = document.getElementById("feedback-panel");
	var currentSchool = gameState.currentSchool;

	// Find the correct school's index for map labels and lines
	var correctIndex = -1;
	for (var i = 0; i < gameState.schools.length; i++) {
		if (gameState.schools[i].shortName === currentSchool.shortName) {
			correctIndex = i;
			break;
		}
	}

	// === CORRECT ANSWER ===
	if (correct) {
		scoreAnswer();

		// Mark dot as permanently answered (school color)
		markDotAnswered(schoolIndex, gameState.schools);

		// Show zoom circle animation
		showZoomCircle(schoolIndex);

		// Show label on map near the dot
		showMapLabel(schoolIndex, currentSchool.shortName, "#155724", gameState.schools);

		// Show feedback
		if (feedbackPanel) {
			var scoreRecord = gameState.answers[gameState.answers.length - 1];
			feedbackPanel.textContent = currentSchool.shortName + " - +" + scoreRecord.score;
		}

		// Auto-advance
		setDotClicksEnabled(false);
		handleNextButton();

	// === FIRST WRONG ATTEMPT ===
	} else if (attemptsUsed === 1) {
		markDotWrong(schoolIndex);

		// Show wrong school name as label on map near clicked dot
		showMapLabel(schoolIndex, clickedSchool.shortName, "#721c24", gameState.schools);

		if (feedbackPanel) {
			feedbackPanel.textContent = "That is " + clickedSchool.shortName + ". Try again.";
		}

		// Remove wrong highlight after 800ms
		setTimeout(function() {
			var g = document.querySelector(".school-dot-group[data-school-index='" + schoolIndex + "']");
			if (g) {
				g.classList.remove("dot-wrong");
			}
			// Clear the label too
			var labelsGroup = document.getElementById("map-labels");
			if (labelsGroup) {
				labelsGroup.innerHTML = "";
			}
		}, 800);

	// === SECOND WRONG ATTEMPT ===
	} else if (attemptsUsed === 2) {
		markDotWrong(schoolIndex);

		// Show wrong school name near clicked dot
		showMapLabel(schoolIndex, clickedSchool.shortName, "#721c24", gameState.schools);

		// Highlight region dots as hint
		highlightRegionDots(currentSchool.hintRegion, gameState.schools);

		if (feedbackPanel) {
			feedbackPanel.textContent = "That is " + clickedSchool.shortName + ". Look in the " + currentSchool.hintRegion + ".";
		}

		// Remove wrong highlight after 800ms (keep region hint)
		setTimeout(function() {
			var g = document.querySelector(".school-dot-group[data-school-index='" + schoolIndex + "']");
			if (g) {
				g.classList.remove("dot-wrong");
			}
		}, 800);

	// === THIRD WRONG ATTEMPT (ALL MISSED) ===
	} else if (attemptsUsed === 3) {
		scoreAnswer();

		// Mark clicked dot wrong, correct dot answered
		markDotWrong(schoolIndex);
		if (correctIndex !== -1) {
			markDotAnswered(correctIndex, gameState.schools);
			showZoomCircle(correctIndex);
		}

		// Show both labels - wrong and correct
		showMapLabel(schoolIndex, clickedSchool.shortName, "#721c24", gameState.schools);
		if (correctIndex !== -1) {
			showMapLabel(correctIndex, currentSchool.shortName, "#155724", gameState.schools);
		}

		// Draw line from wrong to correct
		if (correctIndex !== -1) {
			showFeedbackLine(schoolIndex, correctIndex, gameState.schools);
		}

		if (feedbackPanel) {
			var scoreRecord = gameState.answers[gameState.answers.length - 1];
			feedbackPanel.textContent = currentSchool.shortName + " was here. +" + scoreRecord.score;
		}

		// Auto-advance after brief pause so player can see correct location
		setDotClicksEnabled(false);
		setTimeout(handleNextButton, 2000);
	}
}

//============================================
function handleNextButton() {
	// Clear temporary highlights (answered dots keep their color)
	clearHighlights();

	var result = advanceAfterReveal();

	if (result === null) {
		stopTimerUpdates();
		var finalResults = getResults();
		showResultsScreen(finalResults);
	} else {
		showNextQuestion();
	}
}

//============================================
function setDotClicksEnabled(enabled) {
	dotClicksEnabled = enabled;
}

//============================================
function startTimerUpdates() {
	if (updateScoreInterval) {
		clearInterval(updateScoreInterval);
	}
	updateScoreInterval = setInterval(function() {
		if (gameState.screen === "playing" || gameState.screen === "revealed") {
			updateScoreDisplay();
		}
	}, 200);
}

//============================================
function stopTimerUpdates() {
	if (updateScoreInterval) {
		clearInterval(updateScoreInterval);
		updateScoreInterval = null;
	}
}
