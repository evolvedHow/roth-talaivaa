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

  type InflationCat = 'housing' | 'healthcare' | 'food' | 'transportation';
  const inflCats: Array<[string, InflationCat]> = [
    ['Housing', 'housing'],
    ['Healthcare', 'healthcare'],
    ['Food', 'food'],
    ['Transport', 'transportation'],
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

  // Plain-input handlers: display as % (e.g. 3.1), store as decimal (0.031).
  function inflPct(value: number): string {
    return String(+(value * 100).toPrecision(4));
  }
  function onWeight(cat: InflationCat, e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v) || v < 0 || v > 100) return;
    scenarioStore.update(s => { s.inflation[cat].weight = v / 100; return s; });
  }
  function onRate(cat: InflationCat, e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v) || v < 0 || v > 100) return;
    scenarioStore.update(s => { s.inflation[cat].rate = v / 100; return s; });
  }
  function onOtherRate(e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v) || v < 0 || v > 100) return;
    scenarioStore.update(s => { s.inflation.otherRate = v / 100; return s; });
  }
</script>

<aside class="panel">
  <header>
    <h2>Inputs</h2>
    <button on:click={resetScenario}>Reset</button>
  </header>

  <section>
    <h3>Today's portfolio</h3>
    <NumberInput label="Tax-deferred (Trad IRA/401k)" prefix="$" bind:value={$scenarioStore.taxDeferred} min={0} max={5000000} step={10000}
      help="Pre-tax balance. This is what generates RMDs at 73." />
    <NumberInput label="Tax-free (Roth)" prefix="$" bind:value={$scenarioStore.taxFree} min={0} max={5000000} step={10000}
      help="Roth IRA / Roth 401(k). Where conversions land. No RMDs." />
    <NumberInput label="Taxable (brokerage)" prefix="$" bind:value={$scenarioStore.taxable} min={0} max={5000000} step={10000}
      help="After-tax brokerage. Usually the first bucket to draw from when paying conversion taxes." />
    <NumberInput label="Taxable cost basis" prefix="$" bind:value={$scenarioStore.taxableBasis} min={0} max={5000000} step={10000} />
  </section>

  <section>
    <h3>Household</h3>
    <NumberInput label="Your age" bind:value={$scenarioStore.currentAge} min={30} max={90} step={1} />
    <NumberInput label="Spouse age (0 = none)" bind:value={$scenarioStore.spouseAge} min={0} max={90} step={1} />
    <SelectInput label="Filing status" bind:value={$scenarioStore.filingStatus} options={filingOptions} />
    <SelectInput label="Retirement state" bind:value={$scenarioStore.retirementState} options={stateOptions} />
  </section>

  <section>
    <h3>Income & Social Security</h3>
    <NumberInput label="Retire at age" bind:value={$scenarioStore.retireAge} min={40} max={80} step={1}
      help="Wages stop after this age. The conversion window typically starts here." />
    <NumberInput label="SS at FRA — you (monthly)" prefix="$" bind:value={$scenarioStore.ssMonthlyAtFRA} min={0} max={5000} step={50} />
    <NumberInput label="SS claim age — you" bind:value={$scenarioStore.ssClaimAge} min={62} max={70} step={1} />
    <NumberInput label="SS at FRA — spouse (monthly)" prefix="$" bind:value={$scenarioStore.spouseSSMonthlyAtFRA} min={0} max={5000} step={50} />
    <NumberInput label="SS claim age — spouse" bind:value={$scenarioStore.spouseSSClaimAge} min={62} max={70} step={1} />
    <NumberInput label="Pension (annual)" prefix="$" bind:value={$scenarioStore.pensionAnnual} min={0} max={200000} step={1000} />
    <NumberInput label="Pension start age" bind:value={$scenarioStore.pensionStartAge} min={50} max={80} step={1} />
    <p class="ref">US avg monthly SS benefit ≈ $1,927 (2024).</p>
  </section>

  <section>
    <h3>Conversion strategy</h3>
    <div class="inline-select">
      <label for="strategy-mode">Mode</label>
      <select id="strategy-mode" value={$scenarioStore.strategy.mode} on:change={onStrategyMode}>
        <option value="none">None (baseline)</option>
        <option value="fixed-annual">Fixed amount / yr</option>
        <option value="fill-bracket">Fill to bracket top</option>
        <option value="custom">Custom per-age</option>
      </select>
    </div>

    {#if $scenarioStore.strategy.mode === 'fixed-annual'}
      <div class="headline-lever">
        <NumberInput label="Conversion $ per year" prefix="$" bind:value={$scenarioStore.strategy.amount} min={0} max={300000} step={2500}
          help="Base amount converted each year in the window. Per-year overrides below take precedence." />
      </div>
      <NumberInput label="Window start age" bind:value={$scenarioStore.strategy.startAge} min={50} max={80} step={1} />
      <NumberInput label="Window end age" bind:value={$scenarioStore.strategy.endAge} min={50} max={80} step={1} />
      <PerYearConversionEditor />
    {:else if $scenarioStore.strategy.mode === 'fill-bracket'}
      <div class="inline-select">
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
        <NumberInput label="Cap conversion $ per year" prefix="$" bind:value={$scenarioStore.strategy.annualCap} min={0} max={300000} step={2500}
          help="Limit on the auto-fill amount. 0 = no cap (fills to the bracket top). Drag to constrain — e.g. cap at $80k to see effect of converting less." />
      </div>
      <NumberInput label="Window start age" bind:value={$scenarioStore.strategy.startAge} min={50} max={80} step={1} />
      <NumberInput label="Window end age" bind:value={$scenarioStore.strategy.endAge} min={50} max={80} step={1} />
    {/if}
  </section>

  <section>
    <h3>Spending & inflation</h3>
    <NumberInput label="Annual spending (today's $)" prefix="$" bind:value={$scenarioStore.annualSpending} min={0} max={500000} step={2500}
      help="Total yearly spending, in today's dollars. Inflates by the basket below." />

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
        {#each inflCats as [label, cat]}
          <tr>
            <td class="cat-name">{label}</td>
            <td><input class="infl-input" type="text" inputmode="decimal"
                  value={inflPct($scenarioStore.inflation[cat].weight)}
                  on:change={e => onWeight(cat, e)} /></td>
            <td><input class="infl-input" type="text" inputmode="decimal"
                  value={inflPct($scenarioStore.inflation[cat].rate)}
                  on:change={e => onRate(cat, e)} /></td>
            <td class="nat">{$inflationDefaultsStore[cat].weight}% · {$inflationDefaultsStore[cat].growth}%</td>
          </tr>
        {/each}
        <tr class="computed-row">
          <td class="cat-name other">Other</td>
          <td class="auto-val">{otherWeightPct}%</td>
          <td><input class="infl-input" type="text" inputmode="decimal"
                value={inflPct($scenarioStore.inflation.otherRate)}
                on:change={onOtherRate} /></td>
          <td class="nat">{$inflationDefaultsStore.other.weight}% · {$inflationDefaultsStore.other.growth}%</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section>
    <h3>Expected returns</h3>
    <NumberInput label="Tax-deferred" bind:value={$scenarioStore.returnTaxDeferred} min={-0.05} max={0.12} step={0.0025} percent />
    <NumberInput label="Tax-free" bind:value={$scenarioStore.returnTaxFree} min={-0.05} max={0.12} step={0.0025} percent />
    <NumberInput label="Taxable" bind:value={$scenarioStore.returnTaxable} min={-0.05} max={0.12} step={0.0025} percent />
    <p class="ref">US long-run nominal avg: stocks ≈ 10.4% · bonds ≈ 4.8%.</p>
  </section>

  <section>
    <h3>IRMAA & taxes</h3>
    <div class="checkbox-row">
      <input id="include-irmaa" type="checkbox" bind:checked={$scenarioStore.includeIRMAA} />
      <label for="include-irmaa">Model IRMAA (Medicare surcharge)</label>
    </div>
    <SelectInput label="Tax law projection" bind:value={$scenarioStore.taxLawMode} options={lawModeOptions} />
  </section>

  <section class="advanced">
    <button class="disclosure" on:click={() => showAdvanced = !showAdvanced}>
      {showAdvanced ? '▼' : '▶'} Advanced
    </button>
    {#if showAdvanced}
      <NumberInput label="Current wages (pre-retire)" prefix="$" bind:value={$scenarioStore.currentWages} min={0} max={500000} step={2500}
        help="Only used if currentAge < retireAge." />
      <SelectInput label="Current state (pre-retire)" bind:value={$scenarioStore.currentState} options={stateOptions} />
      <NumberInput label="SS COLA" bind:value={$scenarioStore.ssCOLA} min={0} max={0.08} step={0.0025} percent />
      <NumberInput label="Plan until age" bind:value={$scenarioStore.planUntilAge} min={70} max={110} step={1} />
      <NumberInput label="NPV discount rate" bind:value={$scenarioStore.discountRate} min={0} max={0.08} step={0.005} percent
        help="Real discount rate for lifetime-tax NPV. 3% is conventional." />
    {/if}
  </section>
</aside>

<style>
  .panel {
    background: white;
    padding: 12px 14px;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    /* Don't pin to 100% height — let the panel size to its content so that
       siblings in the left column (e.g. MCControls on Stress test) remain
       reachable via the outer column's scroll. */
  }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  h2 { font-size: 15px; font-weight: 700; }
  h3 { font-size: 11.5px; font-weight: 700; color: #2a4d8f; margin: 12px 0 5px; text-transform: uppercase; letter-spacing: 0.5px; }
  section { padding-bottom: 6px; border-bottom: 1px solid #eee; }
  section:last-child { border-bottom: none; }
  section.advanced { border-bottom: none; }
  button {
    padding: 3px 9px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px;
    font-size: 11px; cursor: pointer;
  }
  button:hover { background: #e6e6e6; }
  button.disclosure {
    background: none; border: none; padding: 6px 0; font-size: 11.5px; font-weight: 700;
    color: #2a4d8f; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer;
    text-align: left; width: 100%;
  }
  button.disclosure:hover { background: none; color: #1e3a8a; }
  .checkbox-row { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
  .checkbox-row label { font-size: 12px; color: #444; cursor: pointer; }
  .checkbox-row input { accent-color: #2a4d8f; }
  /* Visually emphasized lever — the "how much to convert" */
  .headline-lever {
    background: #eff6ff;
    border-left: 3px solid #2a4d8f;
    border-radius: 3px;
    padding: 6px 8px 2px;
    margin: 3px 0 6px;
  }
  .headline-lever :global(.row:last-child) { margin-bottom: 4px; }
  .inline-select {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-bottom: 5px;
  }
  .inline-select label { flex: 1; font-size: 12px; color: #444; font-weight: 500; }
  .inline-select select {
    max-width: 60%; padding: 3px 5px; border: 1px solid #ccc; border-radius: 4px;
    font-size: 12px; background: white; color: #333;
  }
  .inline-select select:focus { outline: 1px solid #2a4d8f; border-color: #2a4d8f; }
  .blend {
    display: flex; align-items: baseline; gap: 8px;
    background: #eff6ff;
    border-left: 3px solid #2a4d8f;
    border-radius: 3px;
    padding: 5px 9px;
    margin: 3px 0 7px;
    cursor: help;
  }
  .blend-value { font-size: 16px; font-weight: 700; color: #1e3a8a; font-variant-numeric: tabular-nums; }
  .blend-label { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.4px; }
  .ref { font-size: 10px; color: #94a3b8; margin: 4px 0 0; line-height: 1.3; }
  .infl-table {
    width: 100%; border-collapse: collapse; font-size: 12px; margin: 4px 0 0;
  }
  .infl-table th {
    font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase;
    letter-spacing: 0.4px; text-align: left; padding: 0 2px 3px;
  }
  .infl-table th.nat { text-align: right; }
  .infl-table td { padding: 1px 2px; vertical-align: middle; }
  .infl-table .cat-name {
    font-size: 12px; font-weight: 600; color: #1e3a8a; white-space: nowrap;
    padding-right: 6px;
  }
  .infl-table .cat-name.other { color: #92400e; }
  .infl-table .nat {
    font-size: 10px; color: #94a3b8; text-align: right; white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .infl-table .auto-val {
    font-size: 12px; font-weight: 600; color: #92400e;
    font-variant-numeric: tabular-nums; padding: 0 4px;
  }
  .infl-input {
    width: 62px; padding: 2px 4px; border: 1px solid #ccc; border-radius: 3px;
    font-size: 12px; font-family: monospace; text-align: right;
  }
  .infl-input:focus { outline: 1px solid #2a4d8f; border-color: #2a4d8f; }
  .computed-row { opacity: 0.85; }
</style>