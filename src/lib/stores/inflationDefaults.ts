import { readable } from 'svelte/store';
import yaml from 'js-yaml';

export interface InflationDefaults {
  housing: { weight: number; growth: number };
  healthcare: { weight: number; growth: number };
  food: { weight: number; growth: number };
  transportation: { weight: number; growth: number };
  other: { weight: number; growth: number };
}

const fallback: InflationDefaults = {
  housing:   { weight: 33, growth: 3.8 },
  healthcare:{ weight: 8,  growth: 2.7 },
  food:      { weight: 13, growth: 3.4 },
  transportation: { weight: 16, growth: 3.1 },
  other:     { weight: 30, growth: 2.8 },
};

async function load(): Promise<InflationDefaults> {
  try {
    const res = await fetch('tax-configs/inflation-defaults.yml');
    if (!res.ok) return fallback;
    const text = await res.text();
    const raw = yaml.load(text) as Record<string, { weight: number; growth: number }>;
    return {
      housing:        { weight: raw.housing?.weight ?? fallback.housing.weight,         growth: raw.housing?.growth ?? fallback.housing.growth },
      healthcare:     { weight: raw.healthcare?.weight ?? fallback.healthcare.weight,   growth: raw.healthcare?.growth ?? fallback.healthcare.growth },
      food:           { weight: raw.food?.weight ?? fallback.food.weight,               growth: raw.food?.growth ?? fallback.food.growth },
      transportation: { weight: raw.transportation?.weight ?? fallback.transportation.weight, growth: raw.transportation?.growth ?? fallback.transportation.growth },
      other:          { weight: raw.other?.weight ?? fallback.other.weight,             growth: raw.other?.growth ?? fallback.other.growth },
    };
  } catch {
    return fallback;
  }
}

export const inflationDefaultsStore = readable<InflationDefaults>(fallback, (set) => {
  load().then(set);
});
