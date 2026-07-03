<script setup>
defineEmits(['retry'])
</script>

<template>
  <div class="text-center py-12 px-4 text-[var(--text-tertiary)]">
    <div class="text-[2rem] mb-3">📭</div>
    <div class="text-sm mb-4">暂无数据</div>
    <button
      @click="$emit('retry')"
      class="inline-flex items-center gap-1.5 px-5 py-2 border border-[var(--border)] rounded-[20px] bg-[var(--surface-alt)] text-[var(--brand)] text-sm cursor-pointer font-medium transition-all duration-150 font-[var(--font-family)] hover:bg-[var(--brand-light)] hover:border-[var(--brand)]"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
      </svg>
      重新加载
    </button>
  </div>
</template>
