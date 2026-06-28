/**
 * Albers Equal-Area Conic projection for continental US.
 * Ports parts/map_projection.js: ALBERS_CONFIG + albersProjection.
 * testProjection and all console.log calls are intentionally omitted.
 */

// ---------------------------------------------------------------------------
// Projection configuration
// ---------------------------------------------------------------------------

/** Albers Equal-Area Conic projection parameters matching D3 Albers USA. */
const ALBERS_CONFIG = {
  /** First standard parallel in degrees. */
  phi1: 29.5,
  /** Second standard parallel in degrees. */
  phi2: 45.5,
  /** Center latitude in degrees. */
  phi0: 23.0,
  /** Center longitude in degrees. */
  lam0: -96.0,
  scale: 1070,
  translateX: 480,
  translateY: 593,
};

// ---------------------------------------------------------------------------
// Projection function
// ---------------------------------------------------------------------------

/**
 * Project a geographic coordinate to SVG pixel coordinates using the
 * Albers Equal-Area Conic projection (Snyder, Map Projections - A Working
 * Manual).  Matches the D3 Albers USA standard parameters.
 *
 * @param lat - Latitude in decimal degrees.
 * @param lon - Longitude in decimal degrees.
 * @returns [svgX, svgY] in the 960x600 viewBox coordinate space, or null if
 *   the projection denominator is zero (degenerate input).
 */
export function albersProjection(lat: number, lon: number): [number, number] | null {
  // Convert lat/lon from degrees to radians
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;

  // Reference parallels and center point in radians
  const phi1 = (ALBERS_CONFIG.phi1 * Math.PI) / 180;
  const phi2 = (ALBERS_CONFIG.phi2 * Math.PI) / 180;
  const phi0 = (ALBERS_CONFIG.phi0 * Math.PI) / 180;
  const lam0 = (ALBERS_CONFIG.lam0 * Math.PI) / 180;

  // Albers conic equal-area projection math (Snyder)
  const n = (Math.sin(phi1) + Math.sin(phi2)) / 2;
  const C = Math.cos(phi1) * Math.cos(phi1) + 2 * n * Math.sin(phi1);
  const rho0 = Math.sqrt(C - 2 * n * Math.sin(phi0)) / n;

  const rhoArg = C - 2 * n * Math.sin(phi);
  // Guard against negative radicand (degenerate coordinates)
  if (rhoArg < 0) {
    return null;
  }
  const rho = Math.sqrt(rhoArg) / n;
  const theta = n * (lambda - lam0);

  // Raw projection coordinates
  const x = rho * Math.sin(theta);
  const y = rho0 - rho * Math.cos(theta);

  // Apply scale and translate to fit the 960x600 viewBox
  // SVG y-axis points downward; Albers y increases northward, so negate y
  const svgX = ALBERS_CONFIG.translateX + x * ALBERS_CONFIG.scale;
  const svgY = ALBERS_CONFIG.translateY - y * ALBERS_CONFIG.scale;

  return [svgX, svgY];
}
