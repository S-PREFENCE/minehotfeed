<script setup>
defineProps({
  activeTab: { type: String, default: 'domestic' },
})

defineEmits(['switch-tab'])
</script>

<template>
  <nav class="hidden max-[899px]:flex fixed bottom-0 left-0 right-0 bg-[oklch(98%_0.005_250_/_0.9)] backdrop-blur-[16px] saturate-[180%] border-t border-[var(--border-light)] z-100 py-1.5 safe-area-bottom dark:bg-[oklch(16%_0.008_250_/_0.9)]">
    <button
      @click="$emit('switch-tab', 'domestic')"
      class="flex-1 flex flex-col items-center gap-0.5 py-1.5 border-none bg-transparent cursor-pointer text-[var(--text-muted)] font-[var(--font-family)] text-[10px] font-medium transition-colors duration-150"
      :class="{ '!text-[var(--brand)]': activeTab === 'domestic' }"
    >
      <span class="text-[1.2rem] leading-none">🇨🇳</span>
      国内头条
    </button>
    <button
      @click="$emit('switch-tab', 'international')"
      class="flex-1 flex flex-col items-center gap-0.5 py-1.5 border-none bg-transparent cursor-pointer text-[var(--text-muted)] font-[var(--font-family)] text-[10px] font-medium transition-colors duration-150"
      :class="{ '!text-[var(--brand)]': activeTab === 'international' }"
    >
      <span class="text-[1.2rem] leading-none">🌍</span>
      国际头条
    </button>
  </nav>
</template>

<style scoped>
.safe-area-bottom {
  padding-bottom: max(6px, env(safe-area-inset-bottom));
}
</style>
