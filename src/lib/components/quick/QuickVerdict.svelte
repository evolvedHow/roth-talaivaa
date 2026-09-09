<script lang="ts">
  import { comparisonStore } from '../../stores/comparison';
  import { sweepStore } from '../../stores/sweep';
  import { scenarioStore } from '../../stores/scenario';

  function fmt(n: number): string {
    const a = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
    if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(0)}k`;
    return `${sign}$${a.toFixed(0)}`;
  }

  $: c = $comparisonStore;
  $: sw = $sweepStore;
  $: planAge = $scenarioStore.planUntilAge;
  $: paysMore = c != null && c.delta.lifetimeTaxNPV > 0;
  $: gainsNW = c != null && c.delta.endingTotalBalanceReal > 0;

  function useSuggested() {
    if (!sw) return;
    scenarioStore.update(s => {
      if (s.strategy.mode === 'fixed-annual') (s.strategy as unknown as { amount: number }).amount = sw.optimumByNW.amount;
      return s;
    });
  }
</script>

{#if c}
  <div class="verdict-wrap">
    <div class="verdict-banner" class:good={c.delta.endingTotalBalanceReal > 0} class:neutral={!gainsNW && !paysMore}>
      {#if gainsNW && paysMore}
        <div class="badge good">✓ Worth it</div>
        <p>You pay <strong>{fmt(c.delta.lifetimeTaxNPV)} more</strong> in total tax now, but end up
        <strong>{fmt(c.delta.endingTotalBalanceReal)} wealthier</strong> at {planAge} — that's the textbook sign a conversion is working.</p>
      {:else if gainsNW && !paysMore}
        <div class="badge good">✓ Clear win</div>
        <p><strong>Less total tax AND more money</strong> left at {planAge}.</p>
      {:else if !gainsNW && paysMore}
        <div class="badge bad">✗ Not worth it</div>
        <p>You'd pay <strong>more tax and end up with less</strong> — try converting less, or check if conversions make sense for you at all.</p>
      {:else if c}
        <div class="badge neutral">~ Your call</div>
        <p>Converting <strong>cuts your total tax bill</strong> but leaves you slightly less wealth at {planAge}. That's a trade only you can make.</p>
      {/if}
    </div>

    <div class="cards">
      <div class="card">
        <div class="title">Money left at {planAge}</div>
        <div class="rows">
          <div class="r"><span>With conversions</span><span class="val">{fmt(c.withStrategy.endingTotalBalanceReal)}</span></div>
          <div class="r"><span>Doing nothing</span><span class="val">{fmt(c.withoutStrategy.endingTotalBalanceReal)}</span></div>
          <div class="r delta {c.delta.endingTotalBalanceReal >= 0 ? 'good' : 'bad'}">
            <span>You end up</span><span class="val">{c.delta.endingTotalBalanceReal >= 0 ? '+' : ''}{fmt(c.delta.endingTotalBalanceReal)}</span>
          </div>
        </div>
        <div class="footer">In today's dollars. Higher is better.</div>
      </div>

      <div class="card">
        <div class="title">Total tax you'll pay</div>
        <div class="rows">
          <div class="r"><span>With conversions</span><span class="val">{fmt(c.withStrategy.lifetimeTaxNPV)}</span></div>
          <div class="r"><span>Doing nothing</span><span class="val">{fmt(c.withoutStrategy.lifetimeTaxNPV)}</span></div>
          <div class="r delta {c.delta.lifetimeTaxNPV <= 0 ? 'good' : 'bad'}">
            <span>Difference</span><span class="val">{c.delta.lifetimeTaxNPV >= 0 ? '+' : ''}{fmt(c.delta.lifetimeTaxNPV)}</span>
          </div>
        </div>
        <div class="footer">Federal + state + Medicare surcharges, in today's dollars.</div>
      </div>

      <div class="card">
        <div class="title">Medicare surcharges (IRMAA)</div>
        <div class="rows">
          <div class="r"><span>With conversions</span><span class="val">{fmt(c.withStrategy.lifetimeIRMAA)}</span></div>
          <div class="r"><span>Doing nothing</span><span class="val">{fmt(c.withoutStrategy.lifetimeIRMAA)}</span></div>
          <div class="r delta {c.delta.lifetimeIRMAA <= 0 ? 'good' : 'bad'}">
            <span>Difference</span><span class="val">{c.delta.lifetimeIRMAA >= 0 ? '+' : ''}{fmt(c.delta.lifetimeIRMAA)}</span>
          </div>
        </div>
        <div class="footer">Extra Part B + D premiums from high income. Your conversion plan aims to keep this at $0.</div>
      </div>
    </div>

    {#if sw && $scenarioStore.strategy.mode === 'fixed-annual' && sw.optimumByNW}
      <div class="suggest">
        <span>
          💡 Converting about <strong>{fmt(sw.optimumByNW.amount)}/yr</strong> (the green zone on the chart
          below, {fmt(sw.goodBandNW.lo)}–{fmt(sw.goodBandNW.hi)}) maximizes your wealth at {planAge}.
        </span>
        <button on:click={useSuggested}>Use this amount</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .verdict-wrap { margin-bottom: 12px; }
  .verdict-banner {
    background: #f8fafc; border-left: 4px solid #cbd5e1;
    border-radius: 6px; padding: 12px 14px; margin-bottom: 12px;
    display: flex; align-items: center; gap: 12px;
  }
  .verdict-banner.good { border-left-color: #16a34a; background: #f0fdf4; }
  .verdict-banner.neutral { border-left-color: #d97706; }
  .verdict-banner p { margin: 0; font-size: 13px; color: #1f2937; line-height: 1.5; }
  .verdict-banner p strong { color: #111827; }
  .badge {
    flex-shrink: 0; padding: 5px 12px; border-radius: 20px;
    font-size: 12px; font-weight: 700; white-space: nowrap;
  }
  .badge.good { background: #16a34a; color: white; }
  .badge.bad { background: #dc2626; color: white; }
  .badge.neutral { background: #d97706; color: white; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-bottom: 12px; }
  .card { background: white; border-radius: 6px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .title { font-size: 12px; color: #1e3a8a; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px; }
  .rows { display: flex; flex-direction: column; gap: 4px; }
  .r { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; }
  .r span { color: #555; }
  .r .val { font-family: monospace; font-weight: 600; color: #1f2937; }
  .r.delta { border-top: 1px solid #e5e7eb; padding-top: 6px; margin-top: 4px; font-weight: 700; }
  .r.delta.good .val { color: #047857; }
  .r.delta.bad .val { color: #b91c1c; }
  .footer { font-size: 11px; color: #6b7280; margin-top: 8px; font-style: italic; }
  .suggest {
    background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px;
    padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
    font-size: 13px; color: #78350f;
  }
  .suggest strong { color: #92400e; }
  .suggest button {
    flex-shrink: 0; padding: 6px 12px; background: #d97706; color: white;
    border: none; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .suggest button:hover { background: #b45309; }
</style>