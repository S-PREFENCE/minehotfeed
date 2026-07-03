<script setup>
import HotCard from './HotCard.vue'
import SkeletonCard from './SkeletonCard.vue'
import EmptyState from './EmptyState.vue'

const props = defineProps({
  title: { type: String, required: true },
  flag: { type: String, default: '🇨🇳' },
  count: { type: Number, default: 0 },
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  flagClass: { type: String, default: '' },
  sectionClass: { type: String, default: '' },
})

defineEmits(['retry'])
</script>

<template>
  <section class="feed-section min-w-0">
    <!-- Section Header with 装饰条 -->
    <div
      class="section-header flex items-center gap-2.5 mb-4 pb-3 border-b-2 border-[var(--border-light)] relative"
      :class="sectionClass"
    >
      <div
        class="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-[1.3rem] leading-none flex-shrink-0"
        :class="flagClass || 'bg-[var(--red-bg)]'"
      >
        {{ flag }}
      </div>
      <h2 class="text-[17px] font-semibold text-[var(--text-primary)] tracking-[-0.2px]">{{ title }}</h2>
      <span class="text-[11px] font-medium text-[var(--text-muted)] bg-[var(--surface-hover)] px-2.5 py-0.5 rounded-[10px]">
        {{ count }} 条
      </span>
    </div>

    <!-- Loading: Skeleton -->
    <div v-if="loading" class="flex flex-col gap-2">
      <SkeletonCard v-for="n in 5" :key="n" />
    </div>

    <!-- Empty -->
    <EmptyState v-else-if="items.length === 0" @retry="$emit('retry')" />

    <!-- Cards -->
    <div v-else class="flex flex-col gap-2">
      <HotCard
        v-for="(item, idx) in items"
        :key="item.id || idx"
        :item="item"
        :index="idx"
      />
    </div>
  </section>
</template>

<style scoped>
/* 区域装饰条 */
.section-header::before {
  content: '';
  position: absolute;
  left: -24px;
  top: 0;
  bottom: 12px;
  width: 3px;
  border-radius: 0 2px 2px 0;
}
.section-header.domestic::before { background: var(--red); }
.section-header.international::before { background: var(--brand); }
</style>
