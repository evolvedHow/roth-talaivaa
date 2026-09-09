import type { TaxRules, ScenarioInputs as TaxInputs } from '../tax-core/types/taxRules';
import { interpret } from '../tax-core/interpreter';
import type { ScenarioInputs, AccountType } from '../types/scenario';
import type { YearState, AccountBalances, WithdrawalBreakdown } from '../types/yearState';
import { calcRMD } from './rmd';
import { annualSSForYear, taxableSSPortion } from './socialSecurity';
import { projectRules } from './projectRules';
import { resolveConversion, bracketCeilingFor } from './conversionStrategy';
import { irmaaSurcharge, irmaaNoSurchargeCeiling } from './irmaa';

interface SimContext {
  baseRules: TaxRules;
  baseYear: number;          // calendar year of the rules' tax_year (e.g. 2025)
  startYear: number;         // calendar year of scenario.currentAge (e.g. 2026)
}

export interface YearReturns {
  taxDeferred: number;
  taxFree: number;
  taxable: number;
}

const ZERO_WD: WithdrawalBreakdown = { taxDeferred: 0, taxFree: 0, taxable: 0 };

// Build the interpreter scenario for this year. All ordinary income lands in wages_income.
function buildTaxInputs(
  scenario: ScenarioInputs,
  ordinaryIncome: number,
  realizedGains: number,
  state: string,
  age: number,
  spouseAge: number | null,
): TaxInputs {
  return {
    filing_status: scenario.filingStatus,
    age,
    spouse_age: spouseAge ?? 0,
    wages_income: ordinaryIncome,
    capital_gains: realizedGains,
    state,
  };
}

// Withdraw `amount` from one account, returning actual withdrawn and updated balance/basis.
function drawFrom(
  account: AccountType,
  amount: number,
  bal: AccountBalances,
): { drawn: number; realized: number; newBal: AccountBalances } {
  if (amount <= 0) return { drawn: 0, realized: 0, newBal: bal };
  let drawn = 0;
  let realized = 0;
  const newBal = { ...bal };
  if (account === 'taxable') {
    drawn = Math.min(amount, newBal.taxable);
    if (newBal.taxable > 0) {
      // FIFO is overkill — use proportional basis.
      const basisFraction = newBal.basis / newBal.taxable;
      realized = drawn * (1 - basisFraction);
      newBal.basis = Math.max(0, newBal.basis - drawn * basisFraction);
    }
    newBal.taxable -= drawn;
  } else if (account === 'taxDeferred') {
    drawn = Math.min(amount, newBal.taxDeferred);
    newBal.taxDeferred -= drawn;
  } else {
    drawn = Math.min(amount, newBal.taxFree);
    newBal.taxFree -= drawn;
  }
  return { drawn, realized, newBal };
}

export function simulateYear(
  prev: YearState | null,
  scenario: ScenarioInputs,
  ctx: SimContext,
  overrideReturns?: YearReturns,
  magiLookback?: number, // MAGI from 2 years prior, used for IRMAA tier lookup
): YearState {
  const age = prev == null ? scenario.currentAge : prev.age + 1;
  const spouseAge = scenario.spouseAge > 0 ? scenario.spouseAge + (age - scenario.currentAge) : null;
  const year = ctx.startYear + (age - scenario.currentAge);
  const yearsSinceBase = age - scenario.currentAge;
  const inflationFactor = Math.pow(1 + scenario.inflationRate, yearsSinceBase);

  const open: AccountBalances = prev == null
    ? { taxDeferred: scenario.taxDeferred, taxFree: scenario.taxFree, taxable: scenario.taxable, basis: scenario.taxableBasis }
    : { ...prev.close };

  // Project the tax rules to this calendar year (handles TCJA sunset + inflation of brackets)
  const rules = projectRules(ctx.baseRules, year, scenario.inflationRate, scenario.taxLawMode);
  const fs = scenario.filingStatus;
  const isWorking = age < scenario.retireAge;
  const state = isWorking ? scenario.currentState : scenario.retirementState;

  // ── Mandatory inflows ─────────────────────────────────────────────────────
  const wages = isWorking ? scenario.currentWages * inflationFactor : 0;
  const pension = age >= scenario.pensionStartAge ? scenario.pensionAnnual * inflationFactor : 0;
  const ssPrimary = annualSSForYear(scenario.ssMonthlyAtFRA, scenario.ssClaimAge, age, yearsSinceBase, scenario.ssCOLA);
  const ssSpouse = spouseAge != null
    ? annualSSForYear(scenario.spouseSSMonthlyAtFRA, scenario.spouseSSClaimAge, spouseAge, yearsSinceBase, scenario.ssCOLA)
    : 0;
  const ssGross = ssPrimary + ssSpouse;
  const rmd = calcRMD(open.taxDeferred, age);

  // ── Conversion (depends on ordinary income BEFORE conversion) ─────────────
  const initialSSTaxable = taxableSSPortion(ssGross, wages + pension + rmd, 0, fs);
  const stdDed = rules.federal.standard_deduction[fs] ?? 0;
  const ordinaryBeforeConversion = wages + pension + initialSSTaxable + rmd;
  const taxableIncomeBeforeConversion = Math.max(0, ordinaryBeforeConversion - stdDed);
  let conversion = resolveConversion(
    scenario.strategy,
    age,
    ordinaryBeforeConversion,
    taxableIncomeBeforeConversion,
    rules,
    fs,
    Math.max(0, open.taxDeferred - rmd),
  );

  // ── Full-year solver for a given conversion amount ─────────────────────────
  // Recomputable so the fill-bracket strategy can correct itself if the
  // conversion (plus the ordinary withdrawals that fund spending + tax) would
  // spill into a higher bracket or trip an IRMAA tier.
  function computeYear(conv: number) {
    const spendingNeeded = scenario.annualSpending * inflationFactor;

    let ssTaxable = taxableSSPortion(ssGross, wages + pension + rmd, 0, fs);
    let ordinary = wages + pension + ssTaxable + rmd + conv;
    let realized = 0;
    let workingBal: AccountBalances = { ...open };
    // Apply conversion to balances now (it doesn't generate cash)
    workingBal.taxDeferred -= conv;
    workingBal.taxFree += conv;
    // Apply RMD to balances (cash leaves taxDeferred)
    workingBal.taxDeferred -= rmd;

    let taxInputs = buildTaxInputs(scenario, ordinary, realized, state, age, spouseAge);
    let taxResult = interpret(rules, taxInputs);

    // ── IRMAA (Medicare surcharge) — based on MAGI from 2 years prior ─────────
    const irmaa = (scenario.includeIRMAA && magiLookback != null && magiLookback >= 0)
      ? irmaaSurcharge(magiLookback, fs, year, scenario.inflationRate, age, spouseAge)
      : { tier: 0, tierLabel: scenario.includeIRMAA ? 'Pre-Medicare' : 'IRMAA off', partBAnnual: 0, partDAnnual: 0, totalAnnual: 0, payers: 0, magiUsed: magiLookback ?? 0 };

    let cashIn = wages + pension + ssGross + rmd;
    let needed = spendingNeeded + taxResult.totalTax + irmaa.totalAnnual - cashIn;

    // Discretionary withdrawals per scenario.withdrawalOrder — loop until
    // cash need is satisfied (or all accounts are dry) so the gross-up
    // converges instead of mis-reporting a shortfall.
    const wd: WithdrawalBreakdown = { ...ZERO_WD };
    let shortfall = 0;

    if (needed > 0) {
      for (let pass = 0; pass < 8 && needed > 0; pass++) {
        let progressed = false;
        for (const acc of scenario.withdrawalOrder) {
          if (needed <= 0) break;
          // Gross up estimate based on marginal rate at this point
          let grossNeeded: number;
          if (acc === 'taxDeferred') {
            const mr = taxResult.marginalRate || 0.22;
            grossNeeded = needed / Math.max(0.01, 1 - mr);
          } else if (acc === 'taxable') {
            const basisFrac = workingBal.taxable > 0 ? workingBal.basis / workingBal.taxable : 1;
            const effCG = 0.15 * (1 - basisFrac); // approximate cap-gains rate on the gain portion
            grossNeeded = needed / Math.max(0.5, 1 - effCG);
          } else {
            grossNeeded = needed;
          }
          const { drawn, realized: rg, newBal } = drawFrom(acc, grossNeeded, workingBal);
          if (drawn <= 0) continue;
          workingBal = newBal;
          wd[acc] += drawn;
          realized += rg;
          if (acc === 'taxDeferred') ordinary += drawn;
          // Recompute tax with updated income
          taxInputs = buildTaxInputs(scenario, ordinary, realized, state, age, spouseAge);
          taxResult = interpret(rules, taxInputs);
          cashIn = wages + pension + ssGross + rmd + wd.taxable + wd.taxDeferred + wd.taxFree;
          needed = spendingNeeded + taxResult.totalTax + irmaa.totalAnnual - cashIn;
          progressed = true;
        }
        if (!progressed) break;
      }
      if (needed > 0) shortfall = needed;
    }

    // Re-iterate SS taxable in case discretionary tax-deferred wd changed provisional income
    const newSSTaxable = taxableSSPortion(ssGross, wages + pension + rmd + wd.taxDeferred, 0, fs);
    if (Math.abs(newSSTaxable - ssTaxable) > 1) {
      ssTaxable = newSSTaxable;
      ordinary = wages + pension + ssTaxable + rmd + conv + wd.taxDeferred;
      taxInputs = buildTaxInputs(scenario, ordinary, realized, state, age, spouseAge);
      taxResult = interpret(rules, taxInputs);
    }

    // ── Apply growth at year-end ──────────────────────────────────────────────
    const r = overrideReturns ?? {
      taxDeferred: scenario.returnTaxDeferred,
      taxFree: scenario.returnTaxFree,
      taxable: scenario.returnTaxable,
    };
    const close: AccountBalances = {
      taxDeferred: workingBal.taxDeferred * (1 + r.taxDeferred),
      taxFree: workingBal.taxFree * (1 + r.taxFree),
      taxable: workingBal.taxable * (1 + r.taxable),
      basis: workingBal.basis, // simplification: don't grow basis (reinvested gains become unrealized)
    };

    const ys: YearState = {
      year,
      age,
      spouseAge,
      open,
      wages,
      pension,
      ssGross,
      ssTaxable,
      rmd,
      conversion: conv,
      withdrawal: wd,
      realizedGains: realized,
      agi: taxResult.grossIncome, // proxy — interpreter doesn't return AGI separately
      magi: taxResult.magi,
      taxableIncome: taxResult.taxableIncome,
      federalTax: taxResult.federalTax + (taxResult.surtaxes['niit'] ?? 0),
      stateTax: taxResult.stateTax + taxResult.subJurisdictionTax,
      irmaaPartB: irmaa.partBAnnual,
      irmaaPartD: irmaa.partDAnnual,
      irmaaTier: irmaa.tier,
      irmaaTierLabel: irmaa.tierLabel,
      irmaaMagiUsed: irmaa.magiUsed,
      totalTax: taxResult.totalTax + irmaa.totalAnnual,
      marginalRate: taxResult.marginalRate,
      effectiveRate: taxResult.effectiveTotalRate,
      spendingNeeded,
      spendingShortfall: shortfall,
      close,
      inflationFactor,
    };

    return { ys, marginalRate: taxResult.marginalRate, taxableIncome: taxResult.taxableIncome, magi: taxResult.magi };
  }

  let result = computeYear(conversion);

  // ── Fill-bracket self-correction ───────────────────────────────────────────
  // The resolver sizes the conversion against pre-conversion income only, but
  // spending + the conversion's own tax are often funded by additional taxable
  // withdrawals. If those push taxable income past the target bracket (or past
  // the no-IRMAA tier), pull the conversion back so the marginal rate stays
  // where the strategy promised it would.
  if (scenario.strategy.mode === 'fill-bracket') {
    const target = scenario.strategy.targetMarginalRate;
    const ceiling = bracketCeilingFor(rules, fs, target);
    if (ceiling != null && result.marginalRate > target + 1e-9 && conversion > 0) {
      const spill = result.taxableIncome - ceiling;
      if (spill > 0) {
        conversion = Math.max(0, conversion - spill);
        result = computeYear(conversion);
      }
    }
    const avoidIRMAA = (scenario.strategy as { avoidIRMAA?: boolean }).avoidIRMAA !== false;
    if (avoidIRMAA && scenario.includeIRMAA && conversion > 0) {
      const medicareWithin2Years = age + 2 >= 65 || (spouseAge != null && spouseAge + 2 >= 65);
      if (medicareWithin2Years) {
        const tier0Ceiling = irmaaNoSurchargeCeiling(fs, year + 2, scenario.inflationRate);
        if (tier0Ceiling != null && result.magi > tier0Ceiling) {
          conversion = Math.max(0, conversion - (result.magi - tier0Ceiling));
          result = computeYear(conversion);
        }
      }
    }
  }

  return result.ys;
}