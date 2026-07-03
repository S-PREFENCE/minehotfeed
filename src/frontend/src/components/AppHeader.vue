<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  isDark: Boolean,
  lastRefreshText: String,
})

const emit = defineEmits(['toggle-theme', 'show-history'])

const searchQuery = defineModel('searchQuery', { default: '' })
const showHistoryDropdown = ref(false)
const historyData = ref(null)
const loadingHistory = ref(false)

async function fetchHistory() {
  if (historyData.value) return
  loadingHistory.value = true
  try {
    const apiBase = import.meta.env.VITE_API_BASE || '/api'
    const res = await fetch(`${apiBase}/v1/history?days=3`)
    const json = await res.json()
    if (json.code === 0) {
      historyData.value = json.data
    }
  } catch (e) {
    console.error('获取历史热搜失败:', e)
  } finally {
    loadingHistory.value = false
  }
}

function onSearchFocus() {
  showHistoryDropdown.value = true
  fetchHistory()
}

function onSearchBlur() {
  // 延迟关闭，让点击事件先触发
  setTimeout(() => {
    showHistoryDropdown.value = false
  }, 200)
}

function showHistoryView() {
  showHistoryDropdown.value = false
  emit('show-history')
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today - d) / (1000 * 60 * 60 * 24))
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff === 2) return '前天'
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<template>
  <header class="sticky top-0 z-100 header-glass border-b border-[var(--border-light)]">
    <div class="max-w-[var(--max-width)] mx-auto px-4 sm:px-6 flex items-center justify-between h-14 gap-4">
      <!-- Logo -->
      <div class="flex items-center gap-3 flex-shrink-0">
        <div class="w-8 h-8 bg-[var(--brand)] rounded-lg flex items-center justify-center font-bold text-[13px] text-white tracking-[-0.5px]">
          H
        </div>
        <div>
          <div class="font-semibold text-lg text-[var(--text-primary)] tracking-[-0.3px] leading-tight">HotFeed</div>
          <div class="text-xs text-[var(--text-tertiary)] font-normal leading-tight hidden sm:block">全球热点，一站掌握</div>
        </div>
      </div>

      <!-- Search with History Dropdown -->
      <div class="flex-1 max-w-[400px] relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索热点关键词…"
          @focus="onSearchFocus"
          @blur="onSearchBlur"
          class="w-full h-9 pl-9 pr-4 bg-[var(--surface-hover)] border border-transparent rounded-[18px] text-sm font-[var(--font-family)] text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[var(--text-muted)] focus:bg-[var(--surface-alt)] focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]"
        />

        <!-- History Dropdown -->
        <div
          v-if="showHistoryDropdown"
          class="absolute top-full left-0 right-0 mt-2 bg-[var(--surface-alt)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] overflow-hidden z-50 max-h-[400px] overflow-y-auto"
        >
          <!-- Quick Entry: 三天热榜 TOP15 -->
          <button
            @click="showHistoryView"
            class="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors duration-150 text-left border-b border-[var(--border-light)]"
          >
            <span class="text-lg">📅</span>
            <div class="flex-1">
              <div class="text-sm font-medium text-[var(--text-primary)]">三天热榜 TOP15</div>
              <div class="text-xs text-[var(--text-tertiary)]">查看近 3 天每日前 15 条热搜</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[var(--text-muted)]">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </button>

          <!-- Preview: 今天的 Top 5 -->
          <div v-if="historyData && historyData.domestic" class="px-4 py-2">
            <div class="text-xs font-medium text-[var(--text-muted)] mb-2">今天 · 国内 TOP 5</div>
            <div
              v-for="(item, idx) in (historyData.domestic[Object.keys(historyData.domestic)[0]] || []).slice(0, 5)"
              :key="idx"
              class="flex items-center gap-2 py-1.5 text-xs"
            >
              <span class="w-5 h-5 rounded flex items-center justify-center font-bold flex-shrink-0"
                :class="idx < 3 ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-hover)] text-[var(--text-tertiary)]'"
              >{{ idx + 1 }}</span>
              <span class="text-[var(--text-secondary)] line-clamp-1 flex-1">{{ item.title }}</span>
            </div>
          </div>

          <div v-if="loadingHistory" class="px-4 py-3 text-xs text-[var(--text-muted)] text-center">
            加载中…
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="flex items-center gap-1.5 text-xs text-[var(--text-muted)] whitespace-nowrap">
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--green)] flex-shrink-0"></span>
          {{ lastRefreshText || '--' }}
        </span>
        <button
          @click="$emit('toggle-theme')"
          class="flex items-center justify-center w-[34px] h-[34px] border-none rounded-[var(--radius-sm)] bg-transparent text-[var(--text-secondary)] cursor-pointer transition-all duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          :title="isDark ? '切换浅色模式' : '切换深色模式'"
        >
          <svg v-if="isDark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>
