<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { scenarioStore } from '../../stores/scenario';
  import NumberInput from '../inputs/NumberInput.svelte';
  import SelectInput from '../inputs/SelectInput.svelte';

  const filingOptions = [
    { value: 'single', label: 'Single' },
    { value: 'married_filing_jointly', label: 'Married filing jointly' },
    { value: 'head_of_household', label: 'Head of household' },
    { value: 'married_filing_separately', label: 'Married filing separately' },
  ];

  let mode: 'auto' | 'manual' = 'manual';

  function setMode(m: 'auto' | 'manual') {
    mode = m;
    scenarioStore.update(s => {
      const end = Math.min(72, s.planUntilAge - 1);
      if (m === 'auto') {
        s.strategy = { mode: 'fill-bracket', targetMarginalRate: 0.24, startAge: s.retireAge, endAge: end, annualCap: 0, avoidIRMAA: true };
      } else {
        const current = s.strategy.mode === 'fixed-annual'
          ? (s.strategy as unknown as { amount: number }).amount
          : 0;
        s.strategy = { mode: 'fixed-annual', amount: current > 0 ? current : 50000, startAge: s.retireAge, endAge: end, perAgeOverride: {} };
      }
      return s;
    });
  }

  onMount(() => {
    mode = get(scenarioStore).strategy.mode === 'fill-bracket' ? 'auto' : 'manual';
    setMode(mode);
  });

  // Keep the conversion window glued to your chosen retirement age.
  $: stratMode = $scenarioStore.strategy.mode;
  $: if (stratMode === 'fixed-annual' || stratMode === 'fill-bracket') {
    const st = $scenarioStore.strategy as unknown as { startAge: number; endAge: number };
    const end = Math.min(72, $scenarioStore.planUntilAge - 1);
    if (st.startAge !== $scenarioStore.retireAge || st.endAge !== end) {
      scenarioStore.update(s => {
        const end2 = Math.min(72, s.planUntilAge - 1);
        if (s.strategy.mode === 'fixed-annual') {
          s.strategy = { ...(s.strategy as object), startAge: s.retireAge, endAge: end2 } as never;
        } else if (s.strategy.mode === 'fill-bracket') {
          s.strategy = { ...(s.strategy as object), startAge: s.retireAge, endAge: end2 } as never;
        }
        return s;
      });
    }
  }

  $: manualAmt = stratMode === 'fixed-annual'
    ? (($scenarioStore.strategy as unknown as { amount: number }).amount ?? 0)
    : 0;
  let amtModel = 0;
  $: amtModel = manualAmt;
  $: if (stratMode === 'fixed-annual' && amtModel !== manualAmt) {
    scenarioStore.update(s => {
      if (s.strategy.mode === 'fixed-annual') (s.strategy as unknown as { amount: number }).amount = amtModel;
      return s;
    });
  }

  $: windowStart = stratMode === 'fixed-annual' || stratMode === 'fill-bracket'
    ? (($scenarioStore.strategy as unknown as { startAge: number }).startAge ?? $scenarioStore.retireAge)
    : $scenarioStore.retireAge;
  $: windowEnd = stratMode === 'fixed-annual' || stratMode === 'fill-bracket'
    ? (($scenarioStore.strategy as unknown as { endAge: number }).endAge ?? Math.min(72, $scenarioStore.planUntilAge - 1))
    : Math.min(72, $scenarioStore.planUntilAge - 1);
</script>

<aside class="panel">
  <header>
    <h2>Quick plan</h2>
  </header>

  <section>
    <h3>About you</h3>
    <NumberInput label="Your age" bind:value={$scenarioStore.currentAge} min={45} max={85} help="The plan runs from here to your plan horizon." />
    <NumberInput label="Plan until age" bind:value={$scenarioStore.planUntilAge} min={70} max={110} help="How long to simulate. Money left at this age is your terminal net worth." />
    <NumberInput label="Spouse age (0 = single)" bind:value={$scenarioStore.spouseAge} min={0} max={90} />
    <SelectInput label="Filing status" bind:value={$scenarioStore.filingStatus} options={filingOptions} />
  </section>

  <section>
    <h3>Your money today</h3>
    <NumberInput label="401(k) / Traditional IRA balance" prefix="$" bind:value={$scenarioStore.taxDeferred} min={0} max={5000000} step={10000}
      help="This is the pre-tax pile you're deciding whether to convert. The bigger it is, the more it pays to convert early." />
    <NumberInput label="Roth balance" prefix="$" bind:value={$scenarioStore.taxFree} min={0} max={5000000} step={10000}
      help="Already tax-free. Conversions land here." />
    <NumberInput label="After-tax (brokerage) balance" prefix="$" bind:value={$scenarioStore.taxable} min={0} max={5000000} step={10000}
      help="Usually used first to pay the tax on conversions." />
  </section>

  <section>
    <h3>Your future income & spending</h3>
    <NumberInput label="Monthly Social Security at 67 (you)" prefix="$" bind:value={$scenarioStore.ssMonthlyAtFRA} min={0} max={5000} step={50} />
    <NumberInput label="Monthly Social Security at 67 (spouse)" prefix="$" bind:value={$scenarioStore.spouseSSMonthlyAtFRA} min={0} max={5000} step={50} />
    <NumberInput label="Money you'll spend each year (today's $)" prefix="$" bind:value={$scenarioStore.annualSpending} min={0} max={500000} step={2500} />
    <NumberInput label="Retire at age" bind:value={$scenarioStore.retireAge} min={45} max={80}
      help="Conversions happen in the quiet years after you stop working." />
  </section>

  <section>
    <h3>Roth conversions</h3>
    <div class="pill-row">
      <button class="pill" class:active={mode === 'auto'} on:click={() => setMode('auto')}>Auto — keep it simple</button>
      <button class="pill" class:active={mode === 'manual'} on:click={() => setMode('manual')}>I'll pick the amount</button>
    </div>

    {#if mode === 'auto'}
      <p class="mode-note">
        Auto converts each year up to the <strong>24% tax bracket</strong>, and stops at the line
        where <strong>Medicare surcharges (IRMAA) kick in</strong> — usually the smartest default.
      </p>
    {:else}
      <div class="big-lever">
        <NumberInput label="Convert per year" prefix="$" bind:value={amtModel} min={0} max={250000} step={5000}
          help="Base annual conversion amount in the window. See the green chart below for the effect of each amount." />
        <p class="mode-note">
          We'll convert about <strong>${amtModel.toLocaleString()}/yr</strong> from age {windowStart}
          to {windowEnd}. Click the green chart below to see what each amount does.
        </p>
      </div>
    {/if}
  </section>
</aside>

<style>
  .panel {
    background: white;
    padding: 12px 14px;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  h2 { font-size: 15px; font-weight: 700; }
  h3 { font-size: 11.5px; font-weight: 700; color: #2a4d8f; margin: 12px 0 5px; text-transform: uppercase; letter-spacing: 0.5px; }
  section { padding-bottom: 6px; border-bottom: 1px solid #eee; }
  section:last-child { border-bottom: none; }
  .pill-row { display: flex; gap: 6px; margin: 4px 0 10px; }
  .pill {
    flex: 1; padding: 8px 6px; border: 1px solid #cbd5e1; border-radius: 6px;
    background: #f8fafc; color: #334155; font-size: 12px; font-weight: 600;
    cursor: pointer;
  }
  .pill.active { background: #2a4d8f; color: white; border-color: #1e3a8a; }
  .mode-note { font-size: 11px; color: #475569; line-height: 1.4; margin: 5px 0 0; }
  .mode-note strong { color: #1e3a8a; }
  .big-lever {
    background: #eff6ff;
    border-left: 3px solid #2a4d8f;
    padding: 6px 9px;
    border-radius: 4px;
    margin-top: 3px;
  }
  .big-lever :global(.row:last-child) { margin-bottom: 0; }
</style>