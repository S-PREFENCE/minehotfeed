<script setup>
import { computed, watch, nextTick } from 'vue'
import FeedSection from '../components/FeedSection.vue'
import { useHotspots } from '../composables/useHotspots.js'
import { useScrollReveal } from '../composables/useScrollReveal.js'

const props = defineProps({
  searchQuery: { type: String, default: '' },
  activeCategory: { type: String, default: 'all' },
})

const { domestic, international, meta, loading, error, updateRefreshDisplay, fetchData } = useHotspots()

const { observeElements } = useScrollReveal('.scroll-reveal')

function filterItems(items) {
  let result = items
  if (props.activeCategory !== 'all') {
    result = result.filter(item => item.category === props.activeCategory)
  }
  if (props.searchQuery) {
    const kw = props.searchQuery.toLowerCase()
    result = result.filter(item =>
      (item.title && item.title.toLowerCase().includes(kw)) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(kw))
    )
  }
  return result
}

const filteredDomestic = computed(() => filterItems(domestic.value))
const filteredInternational = computed(() => filterItems(international.value))

// Re-observe elements when filters change
watch([filteredDomestic, filteredInternational], async () => {
  await nextTick()
  observeElements()
})
</script>

<template>
  <main class="max-w-[var(--max-width)] mx-auto px-4 sm:px-6 py-6 pb-20">
    <!-- Error Banner -->
    <div v-if="error" class="mb-4 p-3 bg-[var(--red-bg)] text-[var(--red)] text-sm rounded-[var(--radius-md)] flex items-center gap-2">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
      </svg>
      <span>数据加载失败：{{ error }}，将使用缓存数据</span>
    </div>

    <!-- Feed Grid -->
    <div class="grid grid-cols-1 gap-8 md:grid-cols-2">
      <FeedSection
        title="国内头条"
        flag="🇨🇳"
        flag-class="bg-[var(--red-bg)]"
        section-class="domestic"
        :count="filteredDomestic.length"
        :items="filteredDomestic"
        :loading="loading"
        @retry="fetchData"
      />
      <FeedSection
        title="国际头条"
        flag="🌍"
        flag-class="bg-[var(--brand-light)]"
        section-class="international"
        :count="filteredInternational.length"
        :items="filteredInternational"
        :loading="loading"
        @retry="fetchData"
      />
    </div>
  </main>
</template>
