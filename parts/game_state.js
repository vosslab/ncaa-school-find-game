// game_state.js - Game state machine and scoring engine
// Manages the game state object and provides functions for the game loop.
// Does NOT touch the DOM - that's handled by game_ui.js and game_play.js

//============================================
// Game state object
var gameState = {
	screen: "setup",        // "setup" | "playing" | "revealed" | "results"
	schools: [],            // shuffled filtered school list (full cycle)
	remaining: [],          // shortNames not yet asked (sidebar display)
	currentIndex: 0,        // which question (0-based)
	totalQuestions: 0,      // schools.length
	currentSchool: null,    // school being asked about
	currentAttempt: 0,      // 1, 2, or 3 (current attempt number)
	clickedSchools: [],     // schools clicked this question (1-3 entries)
	distancesMiles: [],     // distance of each wrong guess in miles
	scores: [],             // score per question
	answers: [],            // full answer records
	conferences: [],        // selected conferences
	tierName: "",           // tier name for localStorage key
	startTime: 0,           // Date.now() when round started
	elapsedMs: 0,           // running elapsed time
	questionStartTime: 0,   // Date.now() when current question started
	streak: 0,              // consecutive first-attempt correct answers
	bestStreak: 0,          // best streak in this round
	timerPaused: false,     // true during feedback display
	timerInterval: null,    // setInterval reference
};

//============================================
// Initialize game with selected conferences
function startGame(conferences, tierName) {
	// Filter NCAA_SCHOOLS by selected conferences
	var filtered = NCAA_SCHOOLS.filter(function(school) {
		return conferences.indexOf(school.conference) !== -1;
	});

	// Shuffle the filtered list (Fisher-Yates)
	shuffleArray(filtered);

	// Initialize all state fields
	gameState.screen = "setup";
	gameState.schools = filtered;
	gameState.conferences = conferences;
	gameState.tierName = tierName || "";
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
	gameState.remaining = filtered.map(function(school) {
		return school.shortName;
	});

	// Start the elapsed timer (setInterval updating elapsedMs every 100ms)
	gameState.timerInterval = setInterval(function() {
		if (!gameState.timerPaused) {
			gameState.elapsedMs = Date.now() - gameState.startTime;
		}
	}, 100);

	// Set screen to "playing" and advance to first question
	gameState.screen = "playing";
	nextQuestion();

	return gameState;
}

//============================================
// Advance to next question
function nextQuestion() {
	// Advance currentIndex
	gameState.currentIndex += 1;

	// If game is over, return null
	if (gameState.currentIndex >= gameState.totalQuestions) {
		return null;
	}

	// Set currentSchool to schools[currentIndex]
	gameState.currentSchool = gameState.schools[gameState.currentIndex];

	// Reset currentAttempt to 1, clickedSchools to [], distancesMiles to []
	gameState.currentAttempt = 1;
	gameState.clickedSchools = [];
	gameState.distancesMiles = [];
	// Track when this question started for per-question timing
	gameState.questionStartTime = Date.now();

	// Remove currentSchool.shortName from remaining[]
	var idx = gameState.remaining.indexOf(gameState.currentSchool.shortName);
	if (idx !== -1) {
		gameState.remaining.splice(idx, 1);
	}

	return gameState.currentSchool;
}

//============================================
// Record an attempt for the current question
function recordAttempt(clickedSchool) {
	// Add clickedSchool to clickedSchools
	gameState.clickedSchools.push(clickedSchool);

	// If wrong: compute distance in miles using haversineDistance(), add to distancesMiles
	var correct = (clickedSchool.shortName === gameState.currentSchool.shortName);
	if (!correct) {
		var distance = haversineDistance(
			gameState.currentSchool.lat,
			gameState.currentSchool.lon,
			clickedSchool.lat,
			clickedSchool.lon
		);
		gameState.distancesMiles.push(distance);
	}

	// Increment currentAttempt
	gameState.currentAttempt += 1;

	return {
		correct: correct,
		attemptsUsed: gameState.clickedSchools.length
	};
}

//============================================
// Score the answer after correct or 3 misses
function scoreAnswer() {
	var score = 0;

	// Determine if correct answer was clicked
	var correct = false;
	for (var i = 0; i < gameState.clickedSchools.length; i++) {
		if (gameState.clickedSchools[i].shortName === gameState.currentSchool.shortName) {
			correct = true;
			break;
		}
	}

	// Compute score based on attempt number
	if (correct) {
		// Find which attempt was correct by matching shortName
		var attemptNum = gameState.clickedSchools.length;
		if (attemptNum === 1) {
			score = 1000;
		} else if (attemptNum === 2) {
			score = 667;
		} else if (attemptNum === 3) {
			score = 333;
		}
	} else {
		// All 3 wrong - compute partial credit
		var minDistance = Math.min.apply(null, gameState.distancesMiles);
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
	var questionTimeMs = Date.now() - gameState.questionStartTime;

	// Build answer record and push to answers[]
	var answerRecord = {
		school: gameState.currentSchool,
		attempts: gameState.clickedSchools.length,
		clickedSchools: gameState.clickedSchools.slice(),
		distancesMiles: gameState.distancesMiles.slice(),
		score: score,
		correct: correct,
		questionTimeMs: questionTimeMs,
	};
	gameState.answers.push(answerRecord);

	// Push score to scores[]
	gameState.scores.push(score);

	// Pause timer
	pauseTimer();

	// Set screen to "revealed"
	gameState.screen = "revealed";

	return answerRecord;
}

//============================================
// Resume timer and advance to next question or results
function advanceAfterReveal() {
	// Resume timer (if not last question)
	if (!isGameOver()) {
		resumeTimer();
	}

	// If isGameOver(): set screen to "results", stop timer, return null
	if (isGameOver()) {
		gameState.screen = "results";
		stopTimer();
		return null;
	}

	// Otherwise: set screen to "playing", call nextQuestion(), return currentSchool
	gameState.screen = "playing";
	return nextQuestion();
}

//============================================
// Check if game is over
function isGameOver() {
	// Game is over when we have answered all questions
	return gameState.answers.length >= gameState.totalQuestions;
}

//============================================
// Get final results
function getResults() {
	var totalScore = 0;
	for (var i = 0; i < gameState.scores.length; i++) {
		totalScore += gameState.scores[i];
	}

	return {
		scores: gameState.scores,
		answers: gameState.answers,
		totalScore: totalScore,
		totalQuestions: gameState.totalQuestions,
		elapsedMs: gameState.elapsedMs,
		conferences: gameState.conferences,
		tierName: gameState.tierName,
		bestStreak: gameState.bestStreak,
	};
}

//============================================
// Compute partial credit for all wrong answers
function missPartialCredit(minDistanceMiles) {
	// If minDistanceMiles >= 200: return 0
	if (minDistanceMiles >= 200) {
		return 0;
	}
	// Otherwise: return rounded credit based on distance
	return Math.round(200 * (1 - minDistanceMiles / 200));
}

//============================================
// Haversine distance formula
function haversineDistance(lat1, lon1, lat2, lon2) {
	// Convert to radians
	var toRad = Math.PI / 180;
	var lat1Rad = lat1 * toRad;
	var lon1Rad = lon1 * toRad;
	var lat2Rad = lat2 * toRad;
	var lon2Rad = lon2 * toRad;

	// Differences
	var dLat = lat2Rad - lat1Rad;
	var dLon = lon2Rad - lon1Rad;

	// Haversine formula
	var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(lat1Rad) * Math.cos(lat2Rad) *
			Math.sin(dLon / 2) * Math.sin(dLon / 2);
	var c = 2 * Math.asin(Math.sqrt(a));

	// Earth radius in miles = 3959
	var R = 3959;
	var distance = R * c;

	return distance;
}

//============================================
// Fisher-Yates shuffle
function shuffleArray(arr) {
	for (var i = arr.length - 1; i > 0; i--) {
		// Random index from 0 to i
		var j = Math.floor(Math.random() * (i + 1));

		// Swap arr[i] and arr[j]
		var temp = arr[i];
		arr[i] = arr[j];
		arr[j] = temp;
	}
	return arr;
}

//============================================
// Timer helper functions
function pauseTimer() {
	gameState.timerPaused = true;
}

function resumeTimer() {
	gameState.timerPaused = false;
}

function stopTimer() {
	if (gameState.timerInterval) {
		clearInterval(gameState.timerInterval);
		gameState.timerInterval = null;
	}
	gameState.elapsedMs = Date.now() - gameState.startTime;
}

//============================================
// Format elapsed time as "M:SS"
function getElapsedFormatted() {
	var totalSeconds = Math.floor(gameState.elapsedMs / 1000);
	var minutes = Math.floor(totalSeconds / 60);
	var seconds = totalSeconds % 60;

	// Pad seconds with leading zero if needed
	var secondsStr = seconds < 10 ? "0" + seconds : String(seconds);

	return minutes + ":" + secondsStr;
}

//============================================
//============================================
// Best score persistence via localStorage
function getBestScoreKey(tierName) {
	// Build a localStorage key from the tier name
	var key = "ncaa-best-" + tierName.replace(/\s+/g, "-").toLowerCase();
	return key;
}

//============================================
function saveBestScore(tierName, totalScore, totalQuestions) {
	var key = getBestScoreKey(tierName);
	var maxScore = totalQuestions * 1000;
	var pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
	var existing = localStorage.getItem(key);
	var existingPct = existing ? parseInt(existing, 10) : 0;
	if (pct > existingPct) {
		localStorage.setItem(key, String(pct));
		return true;
	}
	return false;
}

//============================================
function loadBestScore(tierName) {
	var key = getBestScoreKey(tierName);
	var stored = localStorage.getItem(key);
	if (stored) {
		return parseInt(stored, 10);
	}
	return null;
}

// Simple assertion tests
var _testCredit = missPartialCredit(0);
console.assert(_testCredit === 200, "missPartialCredit(0) should be 200, got " + _testCredit);
var _testCredit2 = missPartialCredit(100);
console.assert(_testCredit2 === 100, "missPartialCredit(100) should be 100, got " + _testCredit2);
var _testCredit3 = missPartialCredit(200);
console.assert(_testCredit3 === 0, "missPartialCredit(200) should be 0, got " + _testCredit3);
var _testCredit4 = missPartialCredit(300);
console.assert(_testCredit4 === 0, "missPartialCredit(300) should be 0, got " + _testCredit4);
