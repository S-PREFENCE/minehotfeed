<script setup>
import { ref, onMounted, computed } from 'vue'

const emit = defineEmits(['close'])

const historyData = ref(null)
const loading = ref(true)
const selectedDate = ref('')
const selectedRegion = ref('domestic')

async function fetchHistory() {
  loading.value = true
  try {
    const apiBase = 'https://hotfeed-backend.2628944969.workers.dev/api'
    const res = await fetch(`${apiBase}/v1/history?days=3`)
    const json = await res.json()
    if (json.code === 0) {
      historyData.value = json.data
      const dates = json.data.dates || []
      if (dates.length > 0) selectedDate.value = dates[0]
    }
  } catch (e) {
    console.error('获取历史热搜失败:', e)
  } finally {
    loading.value = false
  }
}

onMounted(fetchHistory)

const currentList = computed(() => {
  if (!historyData.value || !selectedDate.value) return []
  const regionData = historyData.value[selectedRegion.value] || {}
  return regionData[selectedDate.value] || []
})

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

const platformLogoMap = {
  '微博': { color: 'var(--logo-weibo)', letter: '微' },
  '抖音': { color: 'var(--logo-douyin)', letter: 'D' },
  '百度': { color: 'var(--logo-baidu)', letter: '百' },
  '知乎': { color: 'var(--logo-zhihu)', letter: '知' },
  '头条': { color: 'var(--logo-toutiao)', letter: '头' },
  '今日头条': { color: 'var(--logo-toutiao)', letter: '头' },
  'B站': { color: 'var(--logo-bilibili)', letter: 'B' },
  '快手': { color: 'var(--logo-kuaishou)', letter: 'K' },
  '小红书': { color: 'var(--logo-xiaohongshu)', letter: '小' },
  '人民日报': { color: 'var(--logo-tencent)', letter: '人' },
  '腾讯新闻': { color: 'var(--logo-tencent)', letter: 'T' },
  '网易新闻': { color: 'var(--logo-netease)', letter: '网' },
  '虎扑': { color: 'var(--logo-hupu)', letter: '虎' },
  'Google News': { color: 'var(--logo-google)', letter: 'G' },
  'Reddit': { color: 'var(--logo-reddit)', letter: 'R' },
  'BBC': { color: 'var(--logo-bbc)', letter: 'B' },
  'CNN': { color: 'var(--logo-cnn)', letter: 'C' },
}
</script>

<template>
  <div class="fixed inset-0 z-[200] bg-black/30 backdrop-blur-sm flex items-start justify-center pt-16 px-4" @click.self="emit('close')">
    <div class="bg-[var(--surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--border-light)]">
        <div class="flex items-center gap-3">
          <span class="text-xl">📅</span>
          <div>
            <h2 class="text-lg font-semibold text-[var(--text-primary)]">三天热榜 TOP15</h2>
            <p class="text-xs text-[var(--text-tertiary)]">近 3 天每日前 15 条热搜回顾</p>
          </div>
        </div>
        <button @click="emit('close')" class="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div v-if="loading" class="flex-1 flex items-center justify-center py-20">
        <div class="text-sm text-[var(--text-muted)]">加载中…</div>
      </div>

      <div v-else-if="historyData" class="flex-1 overflow-y-auto">
        <!-- Date Tabs -->
        <div class="flex gap-2 px-6 pt-4 pb-3 border-b border-[var(--border-light)]">
          <button
            v-for="date in historyData.dates"
            :key="date"
            @click="selectedDate = date"
            class="px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200"
            :class="selectedDate === date
              ? 'bg-[var(--brand)] text-white'
              : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--brand)]'"
          >
            {{ formatDate(date) }}
          </button>
        </div>

        <!-- Region Tabs -->
        <div class="flex gap-2 px-6 py-3">
          <button
            @click="selectedRegion = 'domestic'"
            class="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
            :class="selectedRegion === 'domestic'
              ? 'bg-[var(--red)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--red)]'"
          >
            🇨🇳 国内
          </button>
          <button
            @click="selectedRegion = 'international'"
            class="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
            :class="selectedRegion === 'international'
              ? 'bg-[var(--brand)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--brand)]'"
          >
            🌍 国际
          </button>
        </div>

        <!-- Top 15 List -->
        <div class="px-6 pb-6 space-y-2">
          <div
            v-for="(item, idx) in currentList"
            :key="idx"
            class="flex items-start gap-3 p-3 bg-[var(--surface-alt)] border border-[var(--border-light)] rounded-[var(--radius-md)] hover:border-[var(--border)] hover:shadow-[var(--shadow-sm)] transition-all duration-200 cursor-pointer"
            @click="item.primary_url && window.open(item.primary_url, '_blank', 'noopener')"
          >
            <div
              class="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-xs font-bold flex-shrink-0"
              :class="item.rank <= 3 ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-hover)] text-[var(--text-tertiary)]'"
            >{{ item.rank }}</div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-[var(--text-primary)] line-clamp-2">{{ item.title }}</div>
              <div class="flex items-center gap-1.5 mt-1.5">
                <span
                  v-if="platformLogoMap[item.primary_platform]"
                  class="platform-logo"
                  :style="{ background: platformLogoMap[item.primary_platform].color }"
                >{{ platformLogoMap[item.primary_platform].letter }}</span>
                <span class="text-xs text-[var(--text-tertiary)]">{{ item.primary_platform }}</span>
                <span class="text-xs text-[var(--text-muted)]">·</span>
                <span class="text-xs text-[var(--text-tertiary)]">{{ item.unified_heat?.toFixed(1) || '--' }} 热度</span>
              </div>
            </div>
          </div>
          <div v-if="currentList.length === 0" class="text-center py-10 text-sm text-[var(--text-muted)]">
            该日期暂无历史数据
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
