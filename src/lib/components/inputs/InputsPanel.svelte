<script lang="ts">
  import { scenarioStore, resetScenario } from '../../stores/scenario';
  import { rulesStore } from '../../stores/rules';
  import { blendedInflationRate } from '../../sim/inflation';
  import { inflationDefaultsStore } from '../../stores/inflationDefaults';
  import NumberInput from './NumberInput.svelte';
  import SelectInput from './SelectInput.svelte';
  import PerYearConversionEditor from './PerYearConversionEditor.svelte';

  const filingOptions = [
    { value: 'single', label: 'Single' },
    { value: 'married_filing_jointly', label: 'Married filing jointly' },
    { value: 'head_of_household', label: 'Head of household' },
    { value: 'married_filing_separately', label: 'Married filing separately' },
  ];

  $: stateOptions = (() => {
    if (!$rulesStore) return [{ value: 'none', label: 'None' }];
    const codes = Object.keys($rulesStore.states ?? {});
    return [{ value: 'none', label: 'None / no state tax' }, ...codes.map(c => ({ value: c, label: c }))];
  })();

  const lawModeOptions = [
    { value: 'freeze-current', label: 'Freeze current brackets (inflate forward)' },
    { value: 'tcja-sunset', label: 'Model TCJA sunset in 2026' },
  ];

  let showAdvanced = false;

  function onStrategyMode(e: Event) {
    const mode = (e.target as HTMLSelectElement).value;
    scenarioStore.update(s => {
      if (mode === 'none') s.strategy = { mode: 'none' };
      else if (mode === 'fill-bracket') s.strategy = { mode: 'fill-bracket', targetMarginalRate: 0.24, startAge: s.retireAge, endAge: 75, annualCap: 0, avoidIRMAA: true };
      else if (mode === 'fixed-annual') s.strategy = { mode: 'fixed-annual', amount: 50000, startAge: s.retireAge, endAge: 75, perAgeOverride: {} };
      else if (mode === 'custom') s.strategy = { mode: 'custom', perAge: {} };
      return s;
    });
  }

  function onTargetRate(e: Event) {
    const v = Number((e.target as HTMLSelectElement).value);
    scenarioStore.update(s => {
      if (s.strategy.mode === 'fill-bracket') s.strategy.targetMarginalRate = v;
      return s;
    });
  }

  // "Everything else" always makes up the remainder: 100% − the four named buckets.
  $: otherWeight = Math.max(0, 1 - (
    $scenarioStore.inflation.housing.weight +
    $scenarioStore.inflation.healthcare.weight +
    $scenarioStore.inflation.food.weight +
    $scenarioStore.inflation.transportation.weight
  ));
  $: otherWeightPct = (otherWeight * 100).toFixed(1);
  $: blendedPct = (blendedInflationRate($scenarioStore.inflation) * 100).toFixed(2);
</script>

<aside class="panel">
  <header>
    <h2>Inputs</h2>
    <button on:click={resetScenario}>Reset</button>
  </header>

  <section>
    <h3>Today's portfolio</h3>
    <NumberInput label="Tax-deferred (Trad IRA/401k)" prefix="$" bind:value={$scenarioStore.taxDeferred} min={0} max={5000000} step={10000} withSlider
      help="Pre-tax balance. This is what generates RMDs at 73." />
    <NumberInput label="Tax-free (Roth)" prefix="$" bind:value={$scenarioStore.taxFree} min={0} max={5000000} step={10000} withSlider
      help="Roth IRA / Roth 401(k). Where conversions land. No RMDs." />
    <NumberInput label="Taxable (brokerage)" prefix="$" bind:value={$scenarioStore.taxable} min={0} max={5000000} step={10000} withSlider
      help="After-tax brokerage. Usually the first bucket to draw from when paying conversion taxes." />
    <NumberInput label="Taxable cost basis" prefix="$" bind:value={$scenarioStore.taxableBasis} min={0} max={5000000} step={10000} withSlider />
  </section>

  <section>
    <h3>Household</h3>
    <NumberInput label="Your age" bind:value={$scenarioStore.currentAge} min={30} max={90} withSlider />
    <NumberInput label="Spouse age (0 = none)" bind:value={$scenarioStore.spouseAge} min={0} max={90} withSlider />
    <SelectInput label="Filing status" bind:value={$scenarioStore.filingStatus} options={filingOptions} />
    <SelectInput label="Retirement state" bind:value={$scenarioStore.retirementState} options={stateOptions} />
  </section>

  <section>
    <h3>Income & Social Security</h3>
    <NumberInput label="Retire at age" bind:value={$scenarioStore.retireAge} min={40} max={80} withSlider
      help="Wages stop after this age. The conversion window typically starts here." />
    <NumberInput label="SS at FRA (monthly, you)" prefix="$" bind:value={$scenarioStore.ssMonthlyAtFRA} min={0} max={5000} step={50} withSlider />
    <NumberInput label="SS claim age (you)" bind:value={$scenarioStore.ssClaimAge} min={62} max={70} withSlider />
    <NumberInput label="SS at FRA (spouse)" prefix="$" bind:value={$scenarioStore.spouseSSMonthlyAtFRA} min={0} max={5000} step={50} withSlider />
    <NumberInput label="SS claim age (spouse)" bind:value={$scenarioStore.spouseSSClaimAge} min={62} max={70} withSlider />
    <NumberInput label="Pension (annual)" prefix="$" bind:value={$scenarioStore.pensionAnnual} min={0} max={200000} step={1000} withSlider />
    <NumberInput label="Pension start age" bind:value={$scenarioStore.pensionStartAge} min={50} max={80} withSlider />
  </section>

  <section>
    <h3>Conversion strategy</h3>
    <div class="row">
      <label for="strategy-mode">Mode</label>
      <select id="strategy-mode" value={$scenarioStore.strategy.mode} on:change={onStrategyMode}>
        <option value="none">None (baseline — no conversion)</option>
        <option value="fixed-annual">Fixed amount per year (with per-year tuning)</option>
        <option value="fill-bracket">Fill to bracket top (auto-size)</option>
        <option value="custom">Custom per-age (advanced)</option>
      </select>
    </div>

    {#if $scenarioStore.strategy.mode === 'fixed-annual'}
      <div class="headline-lever">
        <NumberInput label="Conversion $ per year" prefix="$" bind:value={$scenarioStore.strategy.amount} min={0} max={300000} step={2500} withSlider
          help="Base amount converted each year in the window. Per-year overrides below take precedence." />
      </div>
      <NumberInput label="Window start age" bind:value={$scenarioStore.strategy.startAge} min={50} max={80} withSlider />
      <NumberInput label="Window end age" bind:value={$scenarioStore.strategy.endAge} min={50} max={80} withSlider />
      <PerYearConversionEditor />
    {:else if $scenarioStore.strategy.mode === 'fill-bracket'}
      <div class="row">
        <label for="target-rate">Fill to top of bracket</label>
        <select id="target-rate" value={String($scenarioStore.strategy.targetMarginalRate)} on:change={onTargetRate}>
          <option value="0.10">10%</option>
          <option value="0.12">12%</option>
          <option value="0.22">22%</option>
          <option value="0.24">24%</option>
          <option value="0.32">32%</option>
          <option value="0.35">35%</option>
        </select>
      </div>
      <div class="headline-lever">
        <NumberInput label="Cap conversion $ per year" prefix="$" bind:value={$scenarioStore.strategy.annualCap} min={0} max={300000} step={2500} withSlider
          help="Limit on the auto-fill amount. 0 = no cap (fills to the bracket top). Drag to constrain — e.g. cap at $80k to see effect of converting less." />
      </div>
      <NumberInput label="Window start age" bind:value={$scenarioStore.strategy.startAge} min={50} max={80} withSlider />
      <NumberInput label="Window end age" bind:value={$scenarioStore.strategy.endAge} min={50} max={80} withSlider />
    {/if}
  </section>

  <section>
    <h3>Spending & inflation</h3>
    <NumberInput label="Annual spending (today's $)" prefix="$" bind:value={$scenarioStore.annualSpending} min={0} max={500000} step={2500} withSlider />

    <div class="blend" title="Weighted average of each category's growth rate. The basket also compounds category-by-category for every simulated year.">
      <div class="blend-value">{blendedPct}%</div>
      <div class="blend-label">blended inflation rate</div>
    </div>

    <table class="infl-table">
      <thead>
        <tr>
          <th></th>
          <th>Share</th>
          <th>Growth</th>
          <th class="nat">Nat'l avg</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="cat-name">Housing</td>
          <td><NumberInput label="" bind:value={$scenarioStore.inflation.housing.weight} min={0} max={100} step={0.1} percent free /></td>
          <td><NumberInput label="" bind:value={$scenarioStore.inflation.housing.rate} min={0} max={100} step={0.001} percent free /></td>
          <td class="nat">{$inflationDefaultsStore.housing.weight}% · {$inflationDefaultsStore.housing.growth}%</td>
        </tr>
        <tr>
          <td class="cat-name">Healthcare</td>
          <td><NumberInput label="" bind:value={$scenarioStore.inflation.healthcare.weight} min={0} max={100} step={0.1} percent free /></td>
          <td><NumberInput label="" bind:value={$scenarioStore.inflation.healthcare.rate} min={0} max={100} step={0.001} percent free /></td>
          <td class="nat">{$inflationDefaultsStore.healthcare.weight}% · {$inflationDefaultsStore.healthcare.growth}%</td>
        </tr>
        <tr>
          <td class="cat-name">Food</td>
          <td><NumberInput label="" bind:value={$scenarioStore.inflation.food.weight} min={0} max={100} step={0.1} percent free /></td>
          <td><NumberInput label="" bind:value={$scenarioStore.inflation.food.rate} min={0} max={100} step={0.001} percent free /></td>
          <td class="nat">{$inflationDefaultsStore.food.weight}% · {$inflationDefaultsStore.food.growth}%</td>
        </tr>
        <tr>
          <td class="cat-name">Transport</td>
          <td><NumberInput label="" bind:value={$scenarioStore.inflation.transportation.weight} min={0} max={100} step={0.1} percent free /></td>
          <td><NumberInput label="" bind:value={$scenarioStore.inflation.transportation.rate} min={0} max={100} step={0.001} percent free /></td>
          <td class="nat">{$inflationDefaultsStore.transportation.weight}% · {$inflationDefaultsStore.transportation.growth}%</td>
        </tr>
        <tr class="computed-row">
          <td class="cat-name other">Other</td>
          <td class="auto-val">{otherWeightPct}%</td>
          <td><NumberInput label="" bind:value={$scenarioStore.inflation.otherRate} min={0} max={100} step={0.001} percent free /></td>
          <td class="nat">{$inflationDefaultsStore.other.weight}% · {$inflationDefaultsStore.other.growth}%</td>
        </tr>
      </tbody>
    </table>
    <p class="infl-hint">Defaults are 20-yr CPI averages (2005–2025). Nat'l avg = BLS reference, not your basket.</p>
  </section>

  <section>
    <h3>Expected returns</h3>
    <NumberInput label="Tax-deferred" bind:value={$scenarioStore.returnTaxDeferred} min={-0.05} max={0.12} step={0.0025} withSlider />
    <NumberInput label="Tax-free" bind:value={$scenarioStore.returnTaxFree} min={-0.05} max={0.12} step={0.0025} withSlider />
    <NumberInput label="Taxable" bind:value={$scenarioStore.returnTaxable} min={-0.05} max={0.12} step={0.0025} withSlider />
  </section>

  <section>
    <h3>IRMAA & taxes</h3>
    <div class="checkbox-row">
      <input id="include-irmaa" type="checkbox" bind:checked={$scenarioStore.includeIRMAA} />
      <label for="include-irmaa">Model IRMAA (Medicare surcharge, 2-yr MAGI lookback)</label>
    </div>
    <SelectInput label="Tax law projection" bind:value={$scenarioStore.taxLawMode} options={lawModeOptions} />
  </section>

  <section class="advanced">
    <button class="disclosure" on:click={() => showAdvanced = !showAdvanced}>
      {showAdvanced ? '▼' : '▶'} Advanced
    </button>
    {#if showAdvanced}
      <NumberInput label="Current wages (pre-retire)" prefix="$" bind:value={$scenarioStore.currentWages} min={0} max={500000} step={2500} withSlider
        help="Only used if currentAge < retireAge." />
      <SelectInput label="Current state (pre-retire)" bind:value={$scenarioStore.currentState} options={stateOptions} />
      <NumberInput label="SS COLA" bind:value={$scenarioStore.ssCOLA} min={0} max={0.08} step={0.0025} withSlider />
      <NumberInput label="Plan until age" bind:value={$scenarioStore.planUntilAge} min={70} max={110} withSlider />
      <NumberInput label="NPV discount rate" bind:value={$scenarioStore.discountRate} min={0} max={0.08} step={0.005} withSlider
        help="Real discount rate for lifetime-tax NPV. 3% is conventional." />
    {/if}
  </section>
</aside>

<style>
  .panel {
    background: white;
    padding: 14px;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    /* Don't pin to 100% height — let the panel size to its content so that
       siblings in the left column (e.g. MCControls on Stress test) remain
       reachable via the outer column's scroll. */
  }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  h2 { font-size: 16px; font-weight: 700; }
  h3 { font-size: 13px; font-weight: 700; color: #2a4d8f; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  section { padding-bottom: 8px; border-bottom: 1px solid #eee; }
  section:last-child { border-bottom: none; }
  section.advanced { border-bottom: none; }
  button {
    padding: 4px 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px;
    font-size: 12px; cursor: pointer;
  }
  button:hover { background: #e6e6e6; }
  button.disclosure {
    background: none; border: none; padding: 8px 0; font-size: 13px; font-weight: 700;
    color: #2a4d8f; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer;
    text-align: left; width: 100%;
  }
  button.disclosure:hover { background: none; color: #1e3a8a; }
  .row { margin-bottom: 10px; }
  .row label { display: block; font-size: 13px; color: #444; font-weight: 500; margin-bottom: 2px; }
  .row select {
    width: 100%; padding: 5px 6px; border: 1px solid #ccc; border-radius: 4px;
    font-size: 13px; background: white;
  }
  .checkbox-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .checkbox-row label { font-size: 13px; color: #444; cursor: pointer; }
  /* Visually emphasized lever — the "how much to convert" slider */
  .headline-lever {
    background: #eff6ff;
    border-left: 3px solid #2a4d8f;
    padding: 8px 10px 2px;
    border-radius: 3px;
    margin: 4px 0 10px;
  }
  .blend {
    display: flex; align-items: baseline; gap: 8px;
    background: #eff6ff;
    border-left: 3px solid #2a4d8f;
    border-radius: 3px;
    padding: 6px 10px;
    margin: 4px 0 10px;
    cursor: help;
  }
  .blend-value { font-size: 18px; font-weight: 700; color: #1e3a8a; font-variant-numeric: tabular-nums; }
  .blend-label { font-size: 11px; color: #475569; text-transform: uppercase; letter-spacing: 0.4px; }
  .infl-hint { font-size: 10.5px; color: #6b7280; line-height: 1.3; margin: 6px 0 0; }
  .infl-table {
    width: 100%; border-collapse: collapse; font-size: 12px; margin: 6px 0 0;
  }
  .infl-table th {
    font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase;
    letter-spacing: 0.4px; text-align: left; padding: 0 2px 3px;
  }
  .infl-table th.nat { text-align: right; }
  .infl-table td { padding: 2px 2px; vertical-align: middle; }
  .infl-table .cat-name {
    font-size: 12px; font-weight: 600; color: #1e3a8a; white-space: nowrap;
    padding-right: 6px;
  }
  .infl-table .cat-name.other { color: #92400e; }
  .infl-table .nat {
    font-size: 10.5px; color: #94a3b8; text-align: right; white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .infl-table .auto-val {
    font-size: 12px; font-weight: 600; color: #92400e;
    font-variant-numeric: tabular-nums; padding: 0 4px;
  }
  .infl-table :global(.row) { margin-bottom: 0; }
  .infl-table :global(.num) { width: 64px; font-size: 12px; padding: 2px 4px; }
  .infl-table :global(.num.free) { width: 64px; }
  .infl-table :global(.row-head),
  .infl-table :global(.suffix) { display: none; }
  .infl-table :global(.row-controls) { gap: 2px; }
  .computed-row { opacity: 0.85; }
</style>
