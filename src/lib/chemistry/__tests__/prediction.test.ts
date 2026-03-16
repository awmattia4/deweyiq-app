import { describe, it, expect } from "vitest"
import { computeLinearTrend } from "../prediction"

describe("computeLinearTrend", () => {
  it("returns null for fewer than 3 data points", () => {
    expect(computeLinearTrend([])).toBeNull()
    expect(computeLinearTrend([5])).toBeNull()
    expect(computeLinearTrend([5, 7])).toBeNull()
  })

  it("computes correct slope and intercept for known linear data (slope=2, intercept=10)", () => {
    // y = 2x + 10 at x = 0, 1, 2, 3, 4 → [10, 12, 14, 16, 18]
    const values = [10, 12, 14, 16, 18]
    const result = computeLinearTrend(values)
    expect(result).not.toBeNull()
    expect(result!.slope).toBeCloseTo(2, 5)
    expect(result!.intercept).toBeCloseTo(10, 5)
    expect(result!.rSquared).toBeCloseTo(1, 5)
    // projectedNext: at x=5, y = 2*5 + 10 = 20
    expect(result!.projectedNext).toBeCloseTo(20, 5)
  })

  it("returns R²=1 for constant values (slope=0, perfect flat fit)", () => {
    const values = [7.5, 7.5, 7.5, 7.5]
    const result = computeLinearTrend(values)
    expect(result).not.toBeNull()
    expect(result!.slope).toBeCloseTo(0, 5)
    expect(result!.rSquared).toBeCloseTo(1, 5)
    expect(result!.projectedNext).toBeCloseTo(7.5, 5)
  })

  it("returns R² between 0 and 1 for noisy data", () => {
    // Generally rising but noisy — not a perfect fit
    const values = [10, 11.5, 11, 13.5, 14, 12.5, 16]
    const result = computeLinearTrend(values)
    expect(result).not.toBeNull()
    // Slope should be positive (overall rising trend)
    expect(result!.slope).toBeGreaterThan(0)
    // R² should be positive but less than 1
    expect(result!.rSquared).toBeGreaterThan(0)
    expect(result!.rSquared).toBeLessThan(1)
  })

  it("correctly handles exactly 3 data points (minimum required)", () => {
    const values = [5, 7, 9] // slope=2, intercept=5, R²=1
    const result = computeLinearTrend(values)
    expect(result).not.toBeNull()
    expect(result!.slope).toBeCloseTo(2, 5)
    expect(result!.rSquared).toBeCloseTo(1, 5)
    // projectedNext: at x=3, y = 2*3 + 5 = 11
    expect(result!.projectedNext).toBeCloseTo(11, 5)
  })

  it("clamps outlier values to [0, 10000] before regression", () => {
    // Data with extreme outliers that should be clamped
    // Normal trend: 100, 110, 120, 130 — but with a wild outlier at index 2
    // Without clamping, 99999 would dominate. With clamping → 10000.
    const valuesWithOutlier = [100, 110, 99999, 130]
    const resultWithOutlier = computeLinearTrend(valuesWithOutlier)

    // Same data but manually clamped to [0, 10000]
    const valuesClamped = [100, 110, 10000, 130]
    const resultClamped = computeLinearTrend(valuesClamped)

    expect(resultWithOutlier).not.toBeNull()
    expect(resultClamped).not.toBeNull()
    // Slope should match the clamped version exactly
    expect(resultWithOutlier!.slope).toBeCloseTo(resultClamped!.slope, 5)
    expect(resultWithOutlier!.intercept).toBeCloseTo(resultClamped!.intercept, 5)
  })

  it("clamps negative values to 0", () => {
    // Negative readings are impossible for chemistry params — clamp to 0
    const values = [-50, -10, 30]
    const resultWithNegatives = computeLinearTrend(values)

    const valuesClamped = [0, 0, 30]
    const resultClamped = computeLinearTrend(valuesClamped)

    expect(resultWithNegatives).not.toBeNull()
    expect(resultClamped).not.toBeNull()
    expect(resultWithNegatives!.slope).toBeCloseTo(resultClamped!.slope, 5)
  })

  it("projectedNext extrapolates one step beyond the last value", () => {
    // For values [0, 2, 4] (slope=2, intercept=0):
    // Last index is 2, projectedNext should be at index 3: 2*3 + 0 = 6
    const values = [0, 2, 4]
    const result = computeLinearTrend(values)
    expect(result).not.toBeNull()
    expect(result!.projectedNext).toBeCloseTo(6, 5)
  })

  it("handles declining trend with negative slope", () => {
    // Chlorine declining: 4.0, 3.0, 2.0, 1.0
    const values = [4.0, 3.0, 2.0, 1.0]
    const result = computeLinearTrend(values)
    expect(result).not.toBeNull()
    expect(result!.slope).toBeCloseTo(-1, 5)
    expect(result!.rSquared).toBeCloseTo(1, 5)
    // projectedNext: at x=4, y = -1*4 + 4 = 0
    expect(result!.projectedNext).toBeCloseTo(0, 5)
  })
})
