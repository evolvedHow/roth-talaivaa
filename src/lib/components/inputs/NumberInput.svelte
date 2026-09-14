<script lang="ts">
  export let label: string;
  export let value: number;
  export let min: number | undefined = undefined;
  export let max: number | undefined = undefined;
  export let step = 1;
  export let prefix = '';
  export let suffix = '';
  export let help = '';
  // When true, the input shows value*100 (e.g. 30 for 0.30) and writes back /100.
  // min/max/step are then interpreted in the *displayed* percent domain.
  export let percent = false;
  // Free mode: plain text input with inputmode="decimal". No spin buttons, no
  // step rounding. Accepts any decimal precision.
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
  <label for={id} title={help || undefined}>
    <span class="label-text">{label}</span>
    {#if help}<span class="help">?</span>{/if}
  </label>
  <div class="controls">
    {#if prefix}<span class="prefix">{prefix}</span>{/if}
    {#if free}
      <input
        {id}
        type="text"
        inputmode="decimal"
        value={display}
        on:input={onInput}
        class="free"
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
  .row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-bottom: 5px;
  }
  label {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px;
    font-size: 12px; color: #444; font-weight: 500;
  }
  .label-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .help {
    display: inline-flex; align-items: center; justify-content: center;
    width: 13px; height: 13px; border-radius: 50%;
    background: #ddd; color: #555; font-size: 9px; cursor: help; flex-shrink: 0;
  }
  .controls { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .num, .free {
    width: 74px; padding: 3px 6px; border: 1px solid #ccc; border-radius: 4px;
    font-size: 12px; font-family: monospace; text-align: right;
    -moz-appearance: textfield; appearance: textfield;
  }
  .num:focus, .free:focus { outline: 1px solid #2a4d8f; border-color: #2a4d8f; }
  .num::-webkit-outer-spin-button,
  .num::-webkit-inner-spin-button,
  .free::-webkit-outer-spin-button,
  .free::-webkit-inner-spin-button {
    -webkit-appearance: none; margin: 0;
  }
  .prefix, .suffix { font-size: 11px; color: #777; white-space: nowrap; }
</style>