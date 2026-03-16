/**
 * Chemistry Trend Prediction — Pure TypeScript OLS Linear Regression
 *
 * Implements Ordinary Least Squares (OLS) linear regression for analyzing
 * chemistry reading trends over time. Used by the dosing engine to apply
 * history-aware adjustments when a parameter is consistently trending
 * toward out-of-range values.
 *
 * No external dependencies — pure math only.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrendResult {
  /** Slope of the regression line (positive = rising, negative = declining) */
  slope: number
  /** Y-intercept of the regression line */
  intercept: number
  /**
   * Coefficient of determination (R²).
   * 0 = no linear relationship, 1 = perfect linear fit.
   */
  rSquared: number
  /**
   * Projected next value based on the regression line.
   * Extrapolates one step beyond the last data point.
   */
  projectedNext: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum number of data points required to compute a meaningful trend */
const MIN_DATA_POINTS = 3

/**
 * Clamp bounds for input values.
 * Prevents extreme outliers from dominating the regression.
 * Chemistry readings should never exceed 10,000 ppm in normal operation.
 */
const CLAMP_MIN = 0
const CLAMP_MAX = 10_000

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Computes an OLS linear regression trend for a series of chemistry readings.
 *
 * Requires at least 3 data points. Returns null if the input has fewer points
 * or if the x-variance is zero (all identical x values, which prevents OLS).
 *
 * Input values are clamped to [0, 10000] before regression to reduce outlier
 * sensitivity (e.g., a data entry error of 9999 ppm won't skew the trend).
 *
 * The x-axis is treated as evenly-spaced time steps (0, 1, 2, ..., n-1),
 * representing the sequence of historical service visits.
 *
 * @param values - Array of chemistry readings in chronological order (oldest first)
 * @returns Trend result with slope, intercept, R², and projected next value; or null
 */
export function computeLinearTrend(values: number[]): TrendResult | null {
  if (values.length < MIN_DATA_POINTS) {
    return null
  }

  // Clamp values to [0, 10000] to reduce outlier sensitivity
  const y = values.map((v) => Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, v)))
  const n = y.length

  // X values are evenly-spaced indices: 0, 1, 2, ..., n-1
  const x = Array.from({ length: n }, (_, i) => i)

  // Compute means
  const xMean = x.reduce((sum, xi) => sum + xi, 0) / n
  const yMean = y.reduce((sum, yi) => sum + yi, 0) / n

  // Compute sums needed for OLS
  let ssXX = 0 // sum of (xi - xMean)^2
  let ssXY = 0 // sum of (xi - xMean)(yi - yMean)
  let ssYY = 0 // sum of (yi - yMean)^2

  for (let i = 0; i < n; i++) {
    const dx = x[i] - xMean
    const dy = y[i] - yMean
    ssXX += dx * dx
    ssXY += dx * dy
    ssYY += dy * dy
  }

  // Guard: if x-variance is zero, OLS is undefined (all x values identical)
  // This should not happen with evenly-spaced indices, but guard defensively.
  if (ssXX === 0) {
    return null
  }

  const slope = ssXY / ssXX
  const intercept = yMean - slope * xMean

  // R² = (ssXY)² / (ssXX * ssYY)
  // Special case: if ssYY = 0 (all y values identical), R² = 1 (perfect fit — flat line)
  const rSquared = ssYY === 0 ? 1 : (ssXY * ssXY) / (ssXX * ssYY)

  // Project the next value (x = n, one step beyond the last data point)
  const projectedNext = slope * n + intercept

  return {
    slope,
    intercept,
    rSquared,
    projectedNext,
  }
}
