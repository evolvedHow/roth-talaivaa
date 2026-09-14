<script lang="ts">
  export let label: string;
  export let value: string;
  export let options: { value: string; label: string }[];

  let nextId = 0;
  const id = `si-${(nextId++)}-${Math.random().toString(36).slice(2, 7)}`;
</script>

<div class="row">
  <label for={id}>{label}</label>
  <select {id} bind:value>
    {#each options as opt}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>
</div>

<style>
  .row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-bottom: 5px;
  }
  label { flex: 1; font-size: 12px; color: #444; font-weight: 500; }
  select {
    max-width: 60%; padding: 3px 5px; border: 1px solid #ccc; border-radius: 4px;
    font-size: 12px; background: white; color: #333;
  }
  select:focus { outline: 1px solid #2a4d8f; border-color: #2a4d8f; }
</style>