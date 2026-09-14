<script lang="ts">
  export let label: string;
  export let value: number;
  export let min: number | undefined = undefined;
  export let max: number | undefined = undefined;
  export let step = 1;
  export let prefix = '';
  export let suffix = '';
  export let withSlider = false;
  export let help = '';
  // When true, the input shows value*100 (e.g. 30 for 0.30) and writes back /100.
  // min/max/step are then interpreted in the *displayed* percent domain.
  export let percent = false;
  // Free mode: plain text input with inputmode="decimal". No spin buttons, no
  // step rounding. Accepts any decimal precision. Useful for inflation rates
  // where users may want e.g. 3.174%.
  export let free = false;

  // Unique id per instance for label `for` association.
  let nextId = 0;
  const id = `ni-${(nextId++)}-${Math.random().toString(36).slice(2, 7)}`;

  const factor = percent ? 100 : 1;
  let display = free ? String(value * factor) : value * factor;

  function onInput(e: Event) {
    if (free) {
      const raw = (e.currentTarget as HTMLInputElement).value;
      display = raw;
      const v = Number(raw);
      value = Number.isFinite(v) ? v / factor : value;
    } else {
      const v = Number((e.currentTarget as HTMLInputElement).value);
      display = v;
      value = v / factor;
    }
  }

  // Keep the display in sync when the underlying value changes externally.
  $: {
    const next = free ? String(value * factor) : value * factor;
    if (next !== display) display = next;
  }
</script>

<div class="row">
  <div class="row-head">
    <label for={id}>{label}</label>
    {#if help}<span class="help" title={help}>?</span>{/if}
  </div>
  <div class="row-controls">
    {#if withSlider}
      <input
        type="range"
        {min}
        {max}
        {step}
        value={display}
        on:input={onInput}
        class="slider"
        aria-label="{label} slider"
      />
    {/if}
    <span class="prefix">{prefix}</span>
    {#if free}
      <input
        {id}
        type="text"
        inputmode="decimal"
        value={display}
        on:input={onInput}
        class="num free"
      />
    {:else}
      <input
        {id}
        type="number"
        {min}
        {max}
        {step}
        value={display}
        on:input={onInput}
        class="num"
      />
    {/if}
    <span class="suffix">{percent ? '%' : suffix}</span>
  </div>
</div>

<style>
  .row { margin-bottom: 10px; }
  .row-head { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
  label { font-size: 13px; color: #444; font-weight: 500; }
  .help {
    display: inline-flex; align-items: center; justify-content: center;
    width: 14px; height: 14px; border-radius: 50%;
    background: #ddd; color: #555; font-size: 10px; cursor: help;
  }
  .row-controls { display: flex; align-items: center; gap: 6px; }
  .slider { flex: 1; min-width: 80px; }
  .num {
    width: 90px; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px;
    font-size: 13px; font-family: monospace; text-align: right;
  }
  .num.free {
    appearance: textfield;
    -moz-appearance: textfield;
    width: 80px;
  }
  .num.free::-webkit-outer-spin-button,
  .num.free::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .prefix, .suffix { font-size: 12px; color: #777; }
</style>