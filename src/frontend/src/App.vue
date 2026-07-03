<script setup>
import { ref, provide } from 'vue'
import AppHeader from './components/AppHeader.vue'
import FilterBar from './components/FilterBar.vue'
import MobileTabs from './components/MobileTabs.vue'
import HistoryView from './components/HistoryView.vue'
import { useTheme } from './composables/useTheme.js'
import { useHotspots } from './composables/useHotspots.js'

const { isDark, toggleTheme } = useTheme()
const { updateRefreshDisplay, fetchData } = useHotspots()

const searchQuery = ref('')
const activeCategory = ref('all')
const activeTab = ref('domestic')
const showHistory = ref(false)

provide('updateRefreshDisplay', updateRefreshDisplay)

function switchTab(tab) {
  activeTab.value = tab
  const sectionId = tab === 'domestic' ? 'domesticSection' : 'internationalSection'
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const refreshDisplay = ref('--')
setInterval(() => {
  refreshDisplay.value = updateRefreshDisplay()
}, 30000)

setTimeout(() => {
  refreshDisplay.value = updateRefreshDisplay()
}, 2000)
</script>

<template>
  <div class="min-h-screen">
    <AppHeader
      v-model:search-query="searchQuery"
      :is-dark="isDark"
      :last-refresh-text="refreshDisplay"
      @toggle-theme="toggleTheme"
      @show-history="showHistory = true"
    />

    <FilterBar v-model="activeCategory" />

    <router-view
      v-slot="{ Component }"
    >
      <component
        :is="Component"
        :search-query="searchQuery"
        :active-category="activeCategory"
        :key="$route.fullPath"
      />
    </router-view>

    <!-- Footer -->
    <footer class="border-t border-[var(--border-light)] py-6 text-center text-xs text-[var(--text-muted)]">
      <div class="max-w-[var(--max-width)] mx-auto px-4 flex flex-wrap justify-center gap-x-6 gap-y-1">
        <span>HotFeed © 2025</span>
        <span>数据来源：微博 · 抖音 · 百度 · 知乎 · 头条 · B站 · Reddit · BBC · CNN</span>
        <span>每 10 分钟更新 · 数据保留 5 天</span>
      </div>
    </footer>

    <MobileTabs :active-tab="activeTab" @switch-tab="switchTab" />

    <!-- History Modal -->
    <HistoryView v-if="showHistory" @close="showHistory = false" />
  </div>
</template>
