// ============================================
// NCAA School Find Game - UI Rendering Logic
// ============================================
// Handles screen transitions, map rendering, dot states,
// zoom circle animation, and map labels.

// Track which school indices have been correctly answered
var correctlyAnsweredIndices = {};

// Store projected coordinates for each school (computed once in renderMap)
var projectedCoords = [];

//============================================
//============================================
function getSchoolColors(school) {
	// Return both school colors for half-and-half dots
	// colorSwap is pre-computed by _compute_color_swaps.py to ensure
	// neighboring schools have visually distinct dot patterns
	if (school.colorSwap) {
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
function getDotColor(school) {
	// Legacy single-color accessor for sidebar dots
	return school.colorPrimary;
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
			if (name === screenName) {
				el.style.display = "flex";
				// Trigger fade-in animation
				el.classList.remove("animate-in");
				void el.offsetWidth;
				el.classList.add("animate-in");
			} else {
				el.style.display = "none";
				el.classList.remove("animate-in");
			}
		}
	});
}

//============================================
function showSetupScreen() {
	showScreen("setup");
	// Reset tier radio to first option (Power Conferences)
	var radios = document.querySelectorAll(".tier-radio");
	if (radios.length > 0) {
		radios[0].checked = true;
	}
	// Hide any setup error
	var errorEl = document.getElementById("setup-error");
	if (errorEl) {
		errorEl.style.display = "none";
	}
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

	// Render state outlines with region-based color tints
	if (statesGroup && US_STATE_PATHS) {
		US_STATE_PATHS.forEach(function(state) {
			var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", state.d);
			// Add region class for subtle color tinting
			var regionClass = state.region ? "region-" + state.region.toLowerCase() : "";
			path.setAttribute("class", "state-path " + regionClass);
			statesGroup.appendChild(path);
		});
	}

	// Project all school coordinates and detect overlaps
	var coordsList = [];
	schools.forEach(function(school) {
		var coords = albersProjection(school.lat, school.lon);
		coordsList.push({ x: coords[0], y: coords[1] });
	});

	// Save original positions so we can cap displacement
	var origCoords = [];
	for (var oc = 0; oc < coordsList.length; oc++) {
		origCoords.push({ x: coordsList[oc].x, y: coordsList[oc].y });
	}

	// Jitter overlapping dots - multiple passes to separate clusters
	// minSpacing just larger than dot diameter so dots don't visually overlap
	// maxDrift caps how far a dot can move from its true location (accuracy)
	// Allow partial overlap -- just prevent complete stacking
	var minSpacing = 10;
	var maxDrift = 12;
	var maxPasses = 10;
	for (var pass = 0; pass < maxPasses; pass++) {
		var moved = false;
		for (var i = 0; i < coordsList.length; i++) {
			for (var j = i + 1; j < coordsList.length; j++) {
				var dx = coordsList[j].x - coordsList[i].x;
				var dy = coordsList[j].y - coordsList[i].y;
				var dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < minSpacing) {
					var angle = (dist > 0.1)
						? Math.atan2(dy, dx)
						: (Math.random() * Math.PI * 2);
					var push = (minSpacing - dist) / 2 + 1;
					coordsList[i].x -= Math.cos(angle) * push;
					coordsList[i].y -= Math.sin(angle) * push;
					coordsList[j].x += Math.cos(angle) * push;
					coordsList[j].y += Math.sin(angle) * push;
					moved = true;
				}
			}
		}
		// Clamp all dots to maxDrift from original position
		for (var c = 0; c < coordsList.length; c++) {
			var cdx = coordsList[c].x - origCoords[c].x;
			var cdy = coordsList[c].y - origCoords[c].y;
			var cdist = Math.sqrt(cdx * cdx + cdy * cdy);
			if (cdist > maxDrift) {
				var scale = maxDrift / cdist;
				coordsList[c].x = origCoords[c].x + cdx * scale;
				coordsList[c].y = origCoords[c].y + cdy * scale;
			}
		}
		if (!moved) {
			break;
		}
	}

	// Store projected coords for later use
	projectedCoords = coordsList;

	// Detect touch device for larger hit targets
	var isTouch = ("ontouchstart" in window);
	var baseDotRadius = isTouch ? 7 : 6;
	var baseHitRadius = isTouch ? 18 : 12;

	// Compute per-dot density: count neighbors within 40px
	// Dense regions get smaller dots so they don't pile up
	var densityRadius = 40;
	var dotRadii = [];
	var hitRadii = [];
	for (var di = 0; di < coordsList.length; di++) {
		var neighborCount = 0;
		for (var dj = 0; dj < coordsList.length; dj++) {
			if (di === dj) {
				continue;
			}
			var ddx = coordsList[dj].x - coordsList[di].x;
			var ddy = coordsList[dj].y - coordsList[di].y;
			var ddist = Math.sqrt(ddx * ddx + ddy * ddy);
			if (ddist < densityRadius) {
				neighborCount++;
			}
		}
		// Scale down: 0-1 neighbors = full size, 5+ neighbors = 70% size
		var densityScale = Math.max(0.7, 1.0 - neighborCount * 0.06);
		dotRadii.push(Math.round(baseDotRadius * densityScale * 10) / 10);
		hitRadii.push(Math.round(baseHitRadius * densityScale * 10) / 10);
	}

	// Render dots - all start as gray (unanswered)
	if (dotsGroup) {
		schools.forEach(function(school, idx) {
			var x = coordsList[idx].x;
			var y = coordsList[idx].y;
			var dotRadius = dotRadii[idx];
			var hitRadius = hitRadii[idx];

			var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
			group.setAttribute("class", "school-dot-group");
			group.setAttribute("data-school-index", idx);
			group.setAttribute("role", "button");
			group.setAttribute("aria-label", school.shortName);
			group.setAttribute("tabindex", "0");

			// Hit-area circle (larger invisible target)
			var hitCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			hitCircle.setAttribute("cx", x);
			hitCircle.setAttribute("cy", y);
			hitCircle.setAttribute("r", hitRadius);
			hitCircle.setAttribute("class", "hit-area");

			// Visible dot - starts with theme-aware unanswered color
			var dotColor = getComputedStyle(document.documentElement).getPropertyValue("--dot-unanswered").trim() || "#888";
			var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			dot.setAttribute("cx", x);
			dot.setAttribute("cy", y);
			dot.setAttribute("r", dotRadius);
			dot.setAttribute("class", "visible-dot");
			dot.setAttribute("fill", dotColor);

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
	// Mark a dot as correctly answered - replace gray circle with half-and-half dot
	correctlyAnsweredIndices[schoolIndex] = true;
	var group = document.querySelector(".school-dot-group[data-school-index='" + schoolIndex + "']");
	if (group) {
		var dot = group.querySelector(".visible-dot");
		if (!dot || !projectedCoords[schoolIndex]) {
			return;
		}
		var x = projectedCoords[schoolIndex].x;
		var y = projectedCoords[schoolIndex].y;
		var r = 7;
		var colors = getSchoolColors(schools[schoolIndex]);

		// Hide the original circle
		dot.setAttribute("r", "0");

		// Create half-and-half semicircle paths
		var ns = "http://www.w3.org/2000/svg";

		// Left half = primary color
		var leftPath = document.createElementNS(ns, "path");
		var leftD = "M " + x + "," + (y - r) + " A " + r + "," + r + " 0 0,0 " + x + "," + (y + r) + " Z";
		leftPath.setAttribute("d", leftD);
		leftPath.setAttribute("fill", colors.fill);
		leftPath.setAttribute("class", "half-dot");

		// Right half = secondary color
		var rightPath = document.createElementNS(ns, "path");
		var rightD = "M " + x + "," + (y - r) + " A " + r + "," + r + " 0 0,1 " + x + "," + (y + r) + " Z";
		rightPath.setAttribute("d", rightD);
		rightPath.setAttribute("fill", colors.stroke);
		rightPath.setAttribute("class", "half-dot");

		// Thin outline for definition
		var outline = document.createElementNS(ns, "circle");
		outline.setAttribute("cx", x);
		outline.setAttribute("cy", y);
		outline.setAttribute("r", r);
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
		var parent = group.parentNode;
		if (parent && parent.firstChild !== group) {
			parent.insertBefore(group, parent.firstChild);
		}
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

	// Progress: "3 of 16"
	var progressDisplay = document.getElementById("progress-display");
	if (progressDisplay) {
		var answered = gameState.answers.length;
		var totalQ = gameState.totalQuestions;
		progressDisplay.textContent = answered + " of " + totalQ;
	}

	// Streak indicator (show when streak >= 3)
	var streakDisplay = document.getElementById("streak-display");
	if (streakDisplay) {
		if (gameState.streak >= 3) {
			streakDisplay.textContent = gameState.streak + "x streak";
		} else {
			streakDisplay.textContent = "";
		}
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

	// Update heading based on performance
	var maxScore = results.totalQuestions * 1000;
	var pct = maxScore > 0 ? Math.round((results.totalScore / maxScore) * 100) : 0;
	var headingEl = document.querySelector(".results-card h1");
	if (headingEl) {
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
	var totalScoreEl = document.getElementById("results-total-score");
	if (totalScoreEl) {
		totalScoreEl.textContent = results.totalScore + " / " + maxScore;
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

	// Best streak
	var streakEl = document.getElementById("results-streak");
	if (streakEl) {
		streakEl.textContent = results.bestStreak || 0;
	}

	// Save best score and show "New Best!" if applicable
	if (results.tierName) {
		var isNewBest = saveBestScore(results.tierName, results.totalScore, results.totalQuestions);
		var bestScoreEl = document.getElementById("results-best-score");
		if (bestScoreEl) {
			var bestPct = loadBestScore(results.tierName);
			if (isNewBest) {
				bestScoreEl.textContent = "New Best! " + bestPct + "%";
				bestScoreEl.style.color = "var(--success-color)";
			} else if (bestPct !== null) {
				bestScoreEl.textContent = "Best: " + bestPct + "%";
				bestScoreEl.style.color = "";
			}
		}
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
			// Format question time as seconds with one decimal
			var timeSec = answer.questionTimeMs ? (answer.questionTimeMs / 1000).toFixed(1) : "-";
			timeCell.textContent = timeSec + "s";
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

	// Build the list HTML for both sidebar and mobile drawer
	var listEls = [
		document.getElementById("remaining-list"),
		document.getElementById("mobile-remaining-list"),
	];

	for (var k = 0; k < listEls.length; k++) {
		var listEl = listEls[k];
		if (!listEl) {
			continue;
		}
		listEl.innerHTML = "";
		// Use a prefix to distinguish sidebar vs mobile list item IDs
		var prefix = listEl.id === "remaining-list" ? "sidebar-item-" : "mobile-item-";

		for (var j = 0; j < sidebarSortedIndices.length; j++) {
			var idx = sidebarSortedIndices[j];
			var school = schools[idx];
			var li = document.createElement("li");
			li.setAttribute("data-school-index", idx);
			li.setAttribute("id", prefix + idx);
			li.textContent = school.shortName;
			listEl.appendChild(li);
		}
	}
}

//============================================
function updateRemainingList(remaining, schools) {
	// Update sidebar to reflect current game state
	if (!schools || schools.length === 0) {
		return;
	}

	var currentName = gameState.currentSchool ? gameState.currentSchool.shortName : "";

	// Update both sidebar and mobile list
	var prefixes = ["sidebar-item-", "mobile-item-"];
	for (var p = 0; p < prefixes.length; p++) {
		var prefix = prefixes[p];
		for (var i = 0; i < schools.length; i++) {
			var li = document.getElementById(prefix + i);
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
				// Only add colored dot in sidebar, not mobile (saves space)
				if (prefix === "sidebar-item-") {
					var dot = document.createElement("span");
					dot.className = "sidebar-dot";
					dot.style.backgroundColor = getDotColor(school);
					li.appendChild(dot);
				}
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
	}

	// Scroll current item into view (sidebar only)
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

// ============================================
// State Abbreviation Labels (toggle, default OFF)
// ============================================

// Track whether state labels are currently shown
var stateLabelsVisible = false;

//============================================
function renderStateLabels() {
	// Add 2-letter state abbreviation labels at centroid positions
	var svg = document.getElementById("game-map");
	if (!svg) {
		return;
	}

	// Remove any existing state label group
	var existing = document.getElementById("state-labels");
	if (existing) {
		existing.remove();
	}

	// Create a new group for state labels
	var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
	g.setAttribute("id", "state-labels");
	g.setAttribute("pointer-events", "none");

	// Read theme color for labels
	var labelColor = getComputedStyle(document.documentElement).getPropertyValue("--state-stroke").trim() || "#bbb";

	for (var i = 0; i < US_STATE_PATHS.length; i++) {
		var state = US_STATE_PATHS[i];
		if (!state.labelX || !state.labelY) {
			continue;
		}

		var text = document.createElementNS("http://www.w3.org/2000/svg", "text");
		text.setAttribute("x", state.labelX);
		text.setAttribute("y", state.labelY);
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
	var dotsGroup = document.getElementById("school-dots");
	if (dotsGroup) {
		svg.insertBefore(g, dotsGroup);
	} else {
		svg.appendChild(g);
	}
}

//============================================
function removeStateLabels() {
	var existing = document.getElementById("state-labels");
	if (existing) {
		existing.remove();
	}
}

//============================================
function toggleStateLabels(show) {
	stateLabelsVisible = show;
	if (show) {
		renderStateLabels();
	} else {
		removeStateLabels();
	}
	// Save preference
	localStorage.setItem("ncaa-show-state-labels", show ? "1" : "0");
}

// ============================================
// Share Results (Wordle-style)
// ============================================

//============================================
function generateShareText(results) {
	// Build a shareable text summary with emoji grid
	var maxScore = results.totalQuestions * 1000;
	var pct = maxScore > 0 ? Math.round((results.totalScore / maxScore) * 100) : 0;
	var tierLabel = results.tierName || "NCAA";

	// Header line
	var text = "NCAA School Find - " + tierLabel + "\n";
	text += "Score: " + pct + "% (" + results.totalScore + "/" + maxScore + ")\n";

	// Emoji grid: each answer gets a colored square
	var grid = "";
	for (var i = 0; i < results.answers.length; i++) {
		var answer = results.answers[i];
		var attempts = answer.clickedSchools ? answer.clickedSchools.length : 0;
		if (answer.correct && attempts === 1) {
			grid += String.fromCodePoint(0x1F7E9);
		} else if (answer.correct && attempts === 2) {
			grid += String.fromCodePoint(0x1F7E8);
		} else if (answer.correct && attempts === 3) {
			grid += String.fromCodePoint(0x1F7E7);
		} else {
			grid += String.fromCodePoint(0x1F7E5);
		}
		// Line break every 10 schools
		if ((i + 1) % 10 === 0) {
			grid += "\n";
		}
	}
	text += grid.trim() + "\n";

	return text;
}

//============================================
function copyShareResults(results) {
	var text = generateShareText(results);

	// Try modern clipboard API
	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(text);
		return true;
	}
	return false;
}
