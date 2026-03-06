import { describe, it, expect } from "vitest"
import { calcDose, generateDosingRecommendations } from "../dosing"
import type { ChemicalProduct, DosingInput } from "../dosing"

describe("calcDose", () => {
  const liquidChlorine12pct: ChemicalProduct = {
    id: "lc-12",
    name: "Liquid Chlorine 12%",
    chemical: "sodiumHypochlorite_12pct",
    concentrationPct: 12,
  }

  const liquidChlorine10pct: ChemicalProduct = {
    id: "lc-10",
    name: "Liquid Chlorine 10%",
    chemical: "sodiumHypochlorite_12pct",
    concentrationPct: 10,
  }

  const calHypo67pct: ChemicalProduct = {
    id: "ch-67",
    name: "Cal-Hypo 67%",
    chemical: "calciumHypochlorite_67pct",
    concentrationPct: 67,
  }

  const sodiumBicarb: ChemicalProduct = {
    id: "bicarb",
    name: "Baking Soda",
    chemical: "sodiumBicarbonate",
    concentrationPct: 100,
  }

  it("calculates correct dose for reference concentration at 10k gallons", () => {
    // 1 ppm of sodium hypochlorite 12% at 10k gallons = 10.7 floz
    const result = calcDose(1, 10000, liquidChlorine12pct)
    expect(result.amount).toBeCloseTo(10.7, 1)
    expect(result.unit).toBe("floz")
  })

  it("scales linearly with volume — 20k gallons is 2x the dose", () => {
    const dose10k = calcDose(1, 10000, liquidChlorine12pct)
    const dose20k = calcDose(1, 20000, liquidChlorine12pct)
    expect(dose20k.amount).toBeCloseTo(dose10k.amount * 2, 1)
  })

  it("scales linearly with delta ppm — 2 ppm is 2x the dose", () => {
    const dose1ppm = calcDose(1, 10000, liquidChlorine12pct)
    const dose2ppm = calcDose(2, 10000, liquidChlorine12pct)
    expect(dose2ppm.amount).toBeCloseTo(dose1ppm.amount * 2, 1)
  })

  it("adjusts dose upward for weaker product (10% vs 12%)", () => {
    // 10% is weaker, needs more to achieve same effect
    const dose12pct = calcDose(2, 15000, liquidChlorine12pct)
    const dose10pct = calcDose(2, 15000, liquidChlorine10pct)
    expect(dose10pct.amount).toBeGreaterThan(dose12pct.amount)
    // Ratio should be 12/10 = 1.2
    expect(dose10pct.amount / dose12pct.amount).toBeCloseTo(1.2, 1)
  })

  it("returns oz unit for cal-hypo granular", () => {
    const result = calcDose(1, 10000, calHypo67pct)
    expect(result.unit).toBe("oz")
    expect(result.amount).toBeCloseTo(2.0, 1)
  })

  it("returns lbs unit for sodium bicarbonate", () => {
    const result = calcDose(10, 10000, sodiumBicarb)
    expect(result.unit).toBe("lbs")
    expect(result.amount).toBeCloseTo(1.4, 1)
  })

  it("rounds amount to 1 decimal place", () => {
    const result = calcDose(3, 12500, liquidChlorine12pct)
    // amount should have at most 1 decimal place
    const decimalPart = (result.amount * 10) % 1
    expect(decimalPart).toBeCloseTo(0, 5)
  })
})

describe("generateDosingRecommendations", () => {
  const chlorinePool: DosingInput = {
    readings: {
      freeChlorine: 1.0,  // LOW (target 2-4)
      pH: 7.5,            // OK
      totalAlkalinity: 100, // OK
      calciumHardness: 300, // OK
      cya: 40,            // OK
      bromine: null,
      tds: null,
      phosphates: null,
      salt: null,
    },
    pool: {
      volumeGallons: 15000,
      sanitizerType: "chlorine",
    },
    products: [
      {
        id: "lc-12",
        name: "Liquid Chlorine 12%",
        chemical: "sodiumHypochlorite_12pct",
        concentrationPct: 12,
      },
    ],
  }

  const highPHPool: DosingInput = {
    readings: {
      freeChlorine: 3.0,  // OK
      pH: 7.9,            // HIGH (target 7.2-7.8)
      totalAlkalinity: 100, // OK
      calciumHardness: 300, // OK
      cya: 40,            // OK
      bromine: null,
      tds: null,
      phosphates: null,
      salt: null,
    },
    pool: {
      volumeGallons: 15000,
      sanitizerType: "chlorine",
    },
    products: [
      {
        id: "mur-31",
        name: "Muriatic Acid 31%",
        chemical: "muriatic_31pct",
        concentrationPct: 31,
      },
    ],
  }

  const allInRangePool: DosingInput = {
    readings: {
      freeChlorine: 3.0,  // OK
      pH: 7.5,            // OK
      totalAlkalinity: 100, // OK
      calciumHardness: 300, // OK
      cya: 40,            // OK
      bromine: null,
      tds: null,
      phosphates: null,
      salt: null,
    },
    pool: {
      volumeGallons: 15000,
      sanitizerType: "chlorine",
    },
    products: [
      {
        id: "lc-12",
        name: "Liquid Chlorine 12%",
        chemical: "sodiumHypochlorite_12pct",
        concentrationPct: 12,
      },
    ],
  }

  it("returns recommendations for low chlorine", () => {
    const recommendations = generateDosingRecommendations(chlorinePool)
    expect(recommendations.length).toBeGreaterThan(0)
    const chlorineRec = recommendations.find((r) => r.chemical === "sodiumHypochlorite_12pct")
    expect(chlorineRec).toBeDefined()
    expect(chlorineRec!.amount).toBeGreaterThan(0)
    expect(chlorineRec!.unit).toBe("floz")
    expect(chlorineRec!.action).toBe("add")
  })

  it("returns recommendations for high pH", () => {
    const recommendations = generateDosingRecommendations(highPHPool)
    expect(recommendations.length).toBeGreaterThan(0)
    const pHRec = recommendations.find((r) => r.chemical === "muriatic_31pct")
    expect(pHRec).toBeDefined()
    expect(pHRec!.amount).toBeGreaterThan(0)
    expect(pHRec!.unit).toBe("floz")
    expect(pHRec!.action).toBe("add")
  })

  it("returns empty array when all readings are in range", () => {
    const recommendations = generateDosingRecommendations(allInRangePool)
    expect(recommendations).toHaveLength(0)
  })

  it("recommendation includes chemical, product, amount, unit, action, and reason", () => {
    const recommendations = generateDosingRecommendations(chlorinePool)
    expect(recommendations.length).toBeGreaterThan(0)
    const rec = recommendations[0]
    expect(rec).toHaveProperty("chemical")
    expect(rec).toHaveProperty("product")
    expect(rec).toHaveProperty("amount")
    expect(rec).toHaveProperty("unit")
    expect(rec).toHaveProperty("action")
    expect(rec).toHaveProperty("reason")
  })
})
