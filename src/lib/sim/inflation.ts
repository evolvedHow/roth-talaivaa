import type { InflationBreakdown } from '../types/scenario';

export interface ResolvedCategory {
  weight: number; // share of total spending, 0–1
  rate: number;   // annual growth, e.g. 0.031
}

export interface ResolvedInflation {
  housing: ResolvedCategory;
  healthcare: ResolvedCategory;
  food: ResolvedCategory;
  transportation: ResolvedCategory;
  other: ResolvedCategory; // weight always derived, rate user-set
}

// Materialize the basket. The "everything else" weight is always computed as
// 100% minus the four named categories (clamped at zero).
export function resolveInflation(infl: InflationBreakdown): ResolvedInflation {
  const otherWeight = Math.max(
    0,
    1 - (infl.housing.weight + infl.healthcare.weight + infl.food.weight + infl.transportation.weight),
  );
  return {
    housing: { weight: infl.housing.weight, rate: infl.housing.rate },
    healthcare: { weight: infl.healthcare.weight, rate: infl.healthcare.rate },
    food: { weight: infl.food.weight, rate: infl.food.rate },
    transportation: { weight: infl.transportation.weight, rate: infl.transportation.rate },
    other: { weight: otherWeight, rate: infl.otherRate },
  };
}

// Single blended rate: the category-weighted average of the growth rates.
// This is the number used to index tax brackets / IRMAA thresholds (the IRS
// indexes to a single all-items CPI, so a blended single rate is the analog).
export function blendedInflationRate(infl: InflationBreakdown): number {
  const r = resolveInflation(infl);
  return (
    r.housing.weight * r.housing.rate +
    r.healthcare.weight * r.healthcare.rate +
    r.food.weight * r.food.rate +
    r.transportation.weight * r.transportation.rate +
    r.other.weight * r.other.rate
  );
}

// Cumulative price index after `years`, compounding each category at its own
// rate and summing by weight — a true weighted (Laspeyres-style) CPI factor.
// Use this to inflate spending, wages, pensions, and for real-dollar display.
export function expenseInflationFactor(infl: InflationBreakdown, years: number): number {
  const r = resolveInflation(infl);
  return (
    r.housing.weight * Math.pow(1 + r.housing.rate, years) +
    r.healthcare.weight * Math.pow(1 + r.healthcare.rate, years) +
    r.food.weight * Math.pow(1 + r.food.rate, years) +
    r.transportation.weight * Math.pow(1 + r.transportation.rate, years) +
    r.other.weight * Math.pow(1 + r.other.rate, years)
  );
}