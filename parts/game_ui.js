// ============================================
// NCAA School Find Game - UI Rendering Logic
// ============================================
// Handles screen transitions, map rendering, dot states,
// zoom circle animation, and map labels.

// Track which school indices have been correctly answered
var correctlyAnsweredIndices = {};

// Store projected coordinates for each school (computed once in renderMap)
var projectedCoords = [];

// ============================================
// Color Accessibility
// ============================================

//============================================
function hexToRgb(hex) {
	// Parse "#RRGGBB" to [r, g, b] in 0-255
	var result = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
	if (!result) {
		return [0, 0, 0];
	}
	return [
		parseInt(result[1], 16),
		parseInt(result[2], 16),
		parseInt(result[3], 16)
	];
}

//============================================
function getRelativeLuminance(hex) {
	// WCAG 2.0 relative luminance
	var rgb = hexToRgb(hex);
	var channels = rgb.map(function(c) {
		var srgb = c / 255;
		if (srgb <= 0.04045) {
			return srgb / 12.92;
		}
		return Math.pow((srgb + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

//============================================
function getContrastRatio(hex1, hex2) {
	var l1 = getRelativeLuminance(hex1);
	var l2 = getRelativeLuminance(hex2);
	var lighter = Math.max(l1, l2);
	var darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

//============================================
function getDotColor(school) {
	// Pick the school color that has better contrast on the map background (#d4dae0)
	var mapBg = "#d4dae0";
	var primaryContrast = getContrastRatio(school.colorPrimary, mapBg);
	var secondaryContrast = getContrastRatio(school.colorSecondary, mapBg);
	// Need at least 3:1 for graphical elements per WCAG
	if (primaryContrast >= 3.0) {
		return school.colorPrimary;
	}
	if (secondaryContrast >= 3.0) {
		return school.colorSecondary;
	}
	// Fallback: darken by returning black
	return "#333333";
}

// ============================================
// Screen Management
// ============================================

//============================================
function showScreen(screenName) {
	var screens = ["setup", "game", "results"];
	screens.forEach(function(name) {
		var el = document.getElementById(name + "-screen");
		if (el) {
			el.style.display = (name === screenName) ? "flex" : "none";
		}
	});
}

//============================================
function showSetupScreen() {
	showScreen("setup");
	// Reset checkboxes to checked
	var checkboxes = document.querySelectorAll(".conference-checkbox");
	checkboxes.forEach(function(cb) {
		cb.checked = true;
	});
	// Reset answered tracking
	correctlyAnsweredIndices = {};
	projectedCoords = [];
}

// ============================================
// Map Rendering
// ============================================

//============================================
function renderMap(schools) {
	var statesGroup = document.getElementById("states");
	var dotsGroup = document.getElementById("school-dots");
	var labelsGroup = document.getElementById("map-labels");

	// Clear everything
	if (statesGroup) {
		statesGroup.innerHTML = "";
	}
	if (dotsGroup) {
		dotsGroup.innerHTML = "";
	}
	if (labelsGroup) {
		labelsGroup.innerHTML = "";
	}

	// Reset tracking
	correctlyAnsweredIndices = {};
	projectedCoords = [];

	// Render state outlines
	if (statesGroup && US_STATE_PATHS) {
		US_STATE_PATHS.forEach(function(state) {
			var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", state.d);
			path.setAttribute("class", "state-path");
			statesGroup.appendChild(path);
		});
	}

	// Project all school coordinates and detect overlaps
	var coordsList = [];
	schools.forEach(function(school) {
		var coords = albersProjection(school.lat, school.lon);
		coordsList.push({ x: coords[0], y: coords[1] });
	});

	// Jitter overlapping dots (schools within 8px of each other)
	for (var i = 0; i < coordsList.length; i++) {
		for (var j = i + 1; j < coordsList.length; j++) {
			var dx = coordsList[j].x - coordsList[i].x;
			var dy = coordsList[j].y - coordsList[i].y;
			var dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < 8) {
				// Push them apart along the line between them
				var angle = Math.atan2(dy, dx);
				var push = (8 - dist) / 2 + 2;
				coordsList[i].x -= Math.cos(angle) * push;
				coordsList[i].y -= Math.sin(angle) * push;
				coordsList[j].x += Math.cos(angle) * push;
				coordsList[j].y += Math.sin(angle) * push;
			}
		}
	}

	// Store projected coords for later use
	projectedCoords = coordsList;

	// Render dots - all start as gray (unanswered)
	if (dotsGroup) {
		schools.forEach(function(school, idx) {
			var x = coordsList[idx].x;
			var y = coordsList[idx].y;

			var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
			group.setAttribute("class", "school-dot-group");
			group.setAttribute("data-school-index", idx);

			// Hit-area circle (larger invisible target)
			var hitCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			hitCircle.setAttribute("cx", x);
			hitCircle.setAttribute("cy", y);
			hitCircle.setAttribute("r", "12");
			hitCircle.setAttribute("class", "hit-area");

			// Visible dot - starts gray
			var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			dot.setAttribute("cx", x);
			dot.setAttribute("cy", y);
			dot.setAttribute("r", "5");
			dot.setAttribute("class", "visible-dot");
			dot.setAttribute("fill", "#999");

			group.appendChild(hitCircle);
			group.appendChild(dot);
			dotsGroup.appendChild(group);
		});
	}
}

// ============================================
// Dot State Updates
// ============================================

//============================================
function markDotAnswered(schoolIndex, schools) {
	// Mark a dot as correctly answered - change to school color
	correctlyAnsweredIndices[schoolIndex] = true;
	var group = document.querySelector(".school-dot-group[data-school-index='" + schoolIndex + "']");
	if (group) {
		var dot = group.querySelector(".visible-dot");
		if (dot) {
			var color = getDotColor(schools[schoolIndex]);
			dot.setAttribute("fill", color);
			dot.setAttribute("r", "6");
		}
		// Disable hover/click styling for answered dots
		group.classList.add("dot-answered");
	}
}

//============================================
function markDotCorrect(schoolIndex) {
	var group = document.querySelector(".school-dot-group[data-school-index='" + schoolIndex + "']");
	if (group) {
		group.classList.add("dot-correct");
	}
}

//============================================
function markDotWrong(schoolIndex) {
	var group = document.querySelector(".school-dot-group[data-school-index='" + schoolIndex + "']");
	if (group) {
		group.classList.add("dot-wrong");
	}
}

//============================================
function clearHighlights() {
	// Remove temporary highlight classes (not dot-answered which is permanent)
	var groups = document.querySelectorAll(".school-dot-group");
	groups.forEach(function(group) {
		group.classList.remove("dot-wrong");
		group.classList.remove("dot-correct");
		group.classList.remove("dot-region-hint");
	});
	// Hide feedback line
	var feedbackLine = document.getElementById("feedback-line");
	if (feedbackLine) {
		feedbackLine.style.display = "none";
	}
	// Clear map labels
	var labelsGroup = document.getElementById("map-labels");
	if (labelsGroup) {
		labelsGroup.innerHTML = "";
	}
	// Hide zoom circle
	var zoomCircle = document.getElementById("zoom-circle");
	if (zoomCircle) {
		zoomCircle.classList.remove("animate");
		zoomCircle.setAttribute("opacity", "0");
	}
}

// ============================================
// Zoom Circle Animation (Seterra-style)
// ============================================

//============================================
function showZoomCircle(schoolIndex) {
	// Animated expanding ring on the correct dot location
	if (!projectedCoords[schoolIndex]) {
		return;
	}
	var x = projectedCoords[schoolIndex].x;
	var y = projectedCoords[schoolIndex].y;
	var zoomCircle = document.getElementById("zoom-circle");
	if (zoomCircle) {
		zoomCircle.setAttribute("cx", x);
		zoomCircle.setAttribute("cy", y);
		zoomCircle.setAttribute("r", "6");
		zoomCircle.setAttribute("opacity", "1");
		// Trigger animation by removing and re-adding class
		zoomCircle.classList.remove("animate");
		// Force reflow
		void zoomCircle.offsetWidth;
		zoomCircle.classList.add("animate");
	}
}

// ============================================
// Map Labels (show school name near dot)
// ============================================

//============================================
function showMapLabel(schoolIndex, text, color, schools) {
	// Add a text label near a dot on the map
	var labelsGroup = document.getElementById("map-labels");
	if (!labelsGroup || !projectedCoords[schoolIndex]) {
		return;
	}
	var x = projectedCoords[schoolIndex].x;
	var y = projectedCoords[schoolIndex].y;

	// Background rect + text for readability
	var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
	g.setAttribute("class", "map-label-group");

	// Create text first to measure it
	var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
	label.setAttribute("x", x + 10);
	label.setAttribute("y", y - 8);
	label.setAttribute("class", "map-label");
	label.setAttribute("fill", color);
	label.textContent = text;

	// White background behind text
	var bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
	bg.setAttribute("x", x + 7);
	bg.setAttribute("y", y - 20);
	bg.setAttribute("width", text.length * 7 + 6);
	bg.setAttribute("height", "16");
	bg.setAttribute("rx", "2");
	bg.setAttribute("fill", "white");
	bg.setAttribute("opacity", "0.85");

	g.appendChild(bg);
	g.appendChild(label);
	labelsGroup.appendChild(g);
}

// ============================================
// Feedback Line
// ============================================

//============================================
function showFeedbackLine(fromSchoolIndex, toSchoolIndex, schools) {
	if (!projectedCoords[fromSchoolIndex] || !projectedCoords[toSchoolIndex]) {
		return;
	}
	var feedbackLine = document.getElementById("feedback-line");
	if (feedbackLine) {
		feedbackLine.setAttribute("x1", projectedCoords[fromSchoolIndex].x);
		feedbackLine.setAttribute("y1", projectedCoords[fromSchoolIndex].y);
		feedbackLine.setAttribute("x2", projectedCoords[toSchoolIndex].x);
		feedbackLine.setAttribute("y2", projectedCoords[toSchoolIndex].y);
		feedbackLine.style.display = "block";
	}
}

// ============================================
// Region Hints
// ============================================

//============================================
function highlightRegionDots(hintRegion, schools) {
	var regionStates = SUBREGIONS[hintRegion] || [];
	var regionStatesSet = {};
	regionStates.forEach(function(state) {
		regionStatesSet[state] = true;
	});

	var groups = document.querySelectorAll(".school-dot-group");
	groups.forEach(function(group) {
		var idx = parseInt(group.getAttribute("data-school-index"), 10);
		var school = schools[idx];
		// Only highlight unanswered dots in the region
		if (school && regionStatesSet[school.state] && !correctlyAnsweredIndices[idx]) {
			group.classList.add("dot-region-hint");
		}
	});
}

// ============================================
// School Color Theming (minimal - topbar is fixed dark)
// ============================================

//============================================
function applySchoolColors(school) {
	// Topbar is fixed dark gray - no theming needed there
	// Just update the school name pill background with accessible color
	var nameEl = document.getElementById("question-text");
	if (nameEl) {
		nameEl.textContent = school.name;
	}
}

// ============================================
// Score and Progress Display
// ============================================

//============================================
function updateScoreDisplay() {
	// Score as percentage
	var scoreDisplay = document.getElementById("score-display");
	if (scoreDisplay && gameState.totalQuestions > 0) {
		var total = 0;
		for (var i = 0; i < gameState.scores.length; i++) {
			total += gameState.scores[i];
		}
		var maxPossible = gameState.answers.length * 1000;
		var pct = maxPossible > 0 ? Math.round((total / maxPossible) * 100) : 0;
		scoreDisplay.textContent = pct + "%";
	}

	// Progress: "3/16"
	var progressDisplay = document.getElementById("progress-display");
	if (progressDisplay) {
		var answered = gameState.answers.length;
		var totalQ = gameState.totalQuestions;
		progressDisplay.textContent = answered + "/" + totalQ;
	}

	// Timer
	var timerDisplay = document.getElementById("timer-display");
	if (timerDisplay) {
		timerDisplay.textContent = getElapsedFormatted();
	}
}

// ============================================
// Results Screen
// ============================================

//============================================
function showResultsScreen(results) {
	showScreen("results");

	var totalScoreEl = document.getElementById("results-total-score");
	if (totalScoreEl) {
		totalScoreEl.textContent = results.totalScore;
	}

	var timeEl = document.getElementById("results-time");
	if (timeEl) {
		var totalSec = Math.floor(results.elapsedMs / 1000);
		var min = Math.floor(totalSec / 60);
		var sec = totalSec % 60;
		timeEl.textContent = min + ":" + (sec < 10 ? "0" : "") + sec;
	}

	var countEl = document.getElementById("results-count");
	if (countEl) {
		var correct = 0;
		for (var i = 0; i < results.answers.length; i++) {
			if (results.answers[i].correct) {
				correct++;
			}
		}
		countEl.textContent = correct + "/" + results.totalQuestions;
	}

	// Build results table body
	var tableBody = document.querySelector("#results-table tbody");
	if (tableBody) {
		tableBody.innerHTML = "";
		results.answers.forEach(function(answer) {
			var row = document.createElement("tr");
			// Color-code by attempt count
			var attempts = answer.clickedSchools ? answer.clickedSchools.length : 0;
			if (answer.correct && attempts === 1) {
				row.className = "result-attempt-1";
			} else if (answer.correct && attempts === 2) {
				row.className = "result-attempt-2";
			} else if (answer.correct && attempts === 3) {
				row.className = "result-attempt-3";
			} else {
				row.className = "result-missed";
			}

			var nameCell = document.createElement("td");
			nameCell.textContent = answer.school.shortName;
			row.appendChild(nameCell);

			var attemptsCell = document.createElement("td");
			attemptsCell.textContent = answer.correct ? attempts : "missed";
			row.appendChild(attemptsCell);

			var timeCell = document.createElement("td");
			timeCell.textContent = "-";
			row.appendChild(timeCell);

			var scoreCell = document.createElement("td");
			scoreCell.textContent = answer.score;
			row.appendChild(scoreCell);

			tableBody.appendChild(row);
		});
	}
}

// ============================================
// Hover Tooltip (shows school name on dot hover)
// ============================================

//============================================
function updateCursorLabel(svgX, svgY) {
	// Move the current question label to follow the mouse on the map
	var currentSchool = gameState.currentSchool;
	if (!currentSchool) {
		return;
	}

	var tooltipGroup = document.getElementById("hover-tooltip");
	var tooltipText = document.getElementById("hover-tooltip-text");
	var tooltipBg = document.getElementById("hover-tooltip-bg");
	if (!tooltipGroup || !tooltipText || !tooltipBg) {
		return;
	}

	var labelText = currentSchool.shortName;
	var textWidth = labelText.length * 7.2 + 10;

	// Position label offset below-right of cursor
	var textX = svgX + 16;
	var textY = svgY + 20;

	// Clamp to stay within the 960x600 viewBox
	if (textX + textWidth > 955) {
		textX = svgX - textWidth - 6;
	}
	if (textY > 590) {
		textY = svgY - 10;
	}

	// Update text content and position
	tooltipText.textContent = labelText;
	tooltipText.setAttribute("x", textX + 5);
	tooltipText.setAttribute("y", textY);

	// Update background rectangle
	tooltipBg.setAttribute("x", textX);
	tooltipBg.setAttribute("y", textY - 13);
	tooltipBg.setAttribute("width", textWidth);
	tooltipBg.setAttribute("height", 18);

	// Show the tooltip group
	tooltipGroup.style.display = "block";
}

//============================================
function hideCursorLabel() {
	// Hide the cursor-following label
	var tooltipGroup = document.getElementById("hover-tooltip");
	if (tooltipGroup) {
		tooltipGroup.style.display = "none";
	}
}

// ============================================
// School List Sidebar
// ============================================

// Store sorted index mapping for sidebar (computed once per game)
var sidebarSortedIndices = [];

//============================================
function initSidebar(schools) {
	// Build alphabetically sorted index list and populate sidebar
	sidebarSortedIndices = [];
	for (var i = 0; i < schools.length; i++) {
		sidebarSortedIndices.push(i);
	}
	// Sort by shortName alphabetically
	sidebarSortedIndices.sort(function(a, b) {
		var nameA = schools[a].shortName.toLowerCase();
		var nameB = schools[b].shortName.toLowerCase();
		if (nameA < nameB) {
			return -1;
		}
		if (nameA > nameB) {
			return 1;
		}
		return 0;
	});

	// Build the list HTML
	var listEl = document.getElementById("remaining-list");
	if (!listEl) {
		return;
	}
	listEl.innerHTML = "";

	for (var j = 0; j < sidebarSortedIndices.length; j++) {
		var idx = sidebarSortedIndices[j];
		var school = schools[idx];
		var li = document.createElement("li");
		li.setAttribute("data-school-index", idx);
		li.setAttribute("id", "sidebar-item-" + idx);
		li.textContent = school.shortName;
		listEl.appendChild(li);
	}
}

//============================================
function updateRemainingList(remaining, schools) {
	// Update sidebar to reflect current game state
	if (!schools || schools.length === 0) {
		return;
	}

	var currentName = gameState.currentSchool ? gameState.currentSchool.shortName : "";

	for (var i = 0; i < schools.length; i++) {
		var li = document.getElementById("sidebar-item-" + i);
		if (!li) {
			continue;
		}

		// Clear previous state classes
		li.classList.remove("sidebar-current", "sidebar-answered");
		li.innerHTML = "";

		var school = schools[i];

		if (correctlyAnsweredIndices[i]) {
			// Answered: strikethrough + school color dot
			li.classList.add("sidebar-answered");
			var dot = document.createElement("span");
			dot.className = "sidebar-dot";
			dot.style.backgroundColor = getDotColor(school);
			li.appendChild(dot);
			var text = document.createTextNode(school.shortName);
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

	// Scroll current item into view
	if (gameState.currentSchool) {
		var currentIndex = -1;
		for (var k = 0; k < schools.length; k++) {
			if (schools[k].shortName === gameState.currentSchool.shortName) {
				currentIndex = k;
				break;
			}
		}
		if (currentIndex !== -1) {
			var currentLi = document.getElementById("sidebar-item-" + currentIndex);
			if (currentLi) {
				currentLi.scrollIntoView({ block: "nearest", behavior: "smooth" });
			}
		}
	}
}
