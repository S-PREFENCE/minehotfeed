<script setup>
</script>

<template>
  <div class="flex gap-3 p-3 sm:p-4 bg-[var(--surface-alt)] border border-[var(--border-light)] rounded-[var(--radius-md)]">
    <div class="w-7 h-7 rounded-[var(--radius-sm)] skeleton"></div>
    <div class="flex-1 flex flex-col gap-2">
      <div class="h-3.5 w-[85%] skeleton rounded"></div>
      <div class="h-3 w-[60%] skeleton rounded"></div>
      <div class="h-2.5 w-[40%] skeleton rounded"></div>
    </div>
  </div>
</template>

<style scoped>
.skeleton {
  background: linear-gradient(90deg, var(--surface-hover) 25%, var(--border-light) 50%, var(--surface-hover) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
</style>
