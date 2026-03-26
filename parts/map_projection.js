/* map_projection.js - Albers Equal-Area Conic projection for continental US */

// Single source of truth for projection parameters
// These match the standard D3 Albers USA projection
var ALBERS_CONFIG = {
	phi1: 29.5,    // first standard parallel (degrees)
	phi2: 45.5,    // second standard parallel (degrees)
	phi0: 23.0,    // center latitude (degrees)
	lam0: -96.0,   // center longitude (degrees)
	scale: 1070,
	translateX: 480,
	translateY: 593,
};

//============================================
function albersProjection(lat, lon) {
	// Convert lat/lon (decimal degrees) to SVG x,y coordinates
	// using Albers Equal-Area Conic projection
	// Returns [x, y] array, or null if projection fails

	// Convert degrees to radians
	var phi = lat * Math.PI / 180;
	var lambda = lon * Math.PI / 180;

	// Reference parallels and center point in radians
	var phi1 = ALBERS_CONFIG.phi1 * Math.PI / 180;
	var phi2 = ALBERS_CONFIG.phi2 * Math.PI / 180;
	var phi0 = ALBERS_CONFIG.phi0 * Math.PI / 180;
	var lam0 = ALBERS_CONFIG.lam0 * Math.PI / 180;

	// Albers conic equal-area projection math
	// Based on Snyder, Map Projections - A Working Manual

	var n = (Math.sin(phi1) + Math.sin(phi2)) / 2;
	var C = Math.cos(phi1) * Math.cos(phi1) + 2 * n * Math.sin(phi1);
	var rho0 = Math.sqrt(C - 2 * n * Math.sin(phi0)) / n;

	var rho = Math.sqrt(C - 2 * n * Math.sin(phi)) / n;
	var theta = n * (lambda - lam0);

	// Calculate raw projection coordinates
	var x = rho * Math.sin(theta);
	var y = rho0 - rho * Math.cos(theta);

	// Apply scale and translate to fit 960x600 viewBox
	var svgX = ALBERS_CONFIG.translateX + x * ALBERS_CONFIG.scale;
	// negate y because SVG y-axis points downward but Albers y increases northward
	var svgY = ALBERS_CONFIG.translateY - y * ALBERS_CONFIG.scale;

	return [svgX, svgY];
}

//============================================
function testProjection() {
	// Test with known US cities
	var los_angeles = albersProjection(34.05, -118.24);
	var new_york = albersProjection(40.71, -74.01);
	var miami = albersProjection(25.76, -80.19);

	console.log("Albers Projection Test:");
	console.log("Los Angeles (34.05, -118.24):", los_angeles);
	console.log("New York (40.71, -74.01):", new_york);
	console.log("Miami (25.76, -80.19):", miami);
}
