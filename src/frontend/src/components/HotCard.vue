<script setup>
import { computed } from 'vue'

const props = defineProps({
  item: { type: Object, required: true },
  index: { type: Number, default: 0 },
})

const emit = defineEmits(['click'])

const trendMap = { up: '↗', down: '↘', stable: '→', rising: '↗', falling: '↘' }
const trendClassMap = {
  up: 'text-[var(--red)]',
  down: 'text-[var(--brand)]',
  stable: 'text-[var(--text-muted)]',
  rising: 'text-[var(--red)]',
  falling: 'text-[var(--brand)]',
}

const tagClassMap = {
  '爆': 'bg-[var(--red-bg)] text-[var(--red)]',
  '热': 'bg-[var(--orange-bg)] text-[var(--orange)]',
  '新': 'bg-[var(--orange-bg)] text-[var(--orange)]',
  'Hot': 'bg-[var(--orange-bg)] text-[var(--orange)]',
  'Trending': 'bg-[var(--orange-bg)] text-[var(--orange)]',
  'New': 'bg-[var(--orange-bg)] text-[var(--orange)]',
}

// 平台 logo 映射
const platformLogoMap = {
  '微博': { color: 'var(--logo-weibo)', letter: '微' },
  '抖音': { color: 'var(--logo-douyin)', letter: 'D' },
  '百度': { color: 'var(--logo-baidu)', letter: '百' },
  '知乎': { color: 'var(--logo-zhihu)', letter: '知' },
  '头条': { color: 'var(--logo-toutiao)', letter: '头' },
  '今日头条': { color: 'var(--logo-toutiao)', letter: '头' },
  'B站': { color: 'var(--logo-bilibili)', letter: 'B' },
  '哔哩哔哩': { color: 'var(--logo-bilibili)', letter: 'B' },
  '快手': { color: 'var(--logo-kuaishou)', letter: 'K' },
  '小红书': { color: 'var(--logo-xiaohongshu)', letter: '小' },
  '腾讯新闻': { color: 'var(--logo-tencent)', letter: 'T' },
  '网易新闻': { color: 'var(--logo-netease)', letter: '网' },
  '虎扑': { color: 'var(--logo-hupu)', letter: '虎' },
  'Google News': { color: 'var(--logo-google)', letter: 'G' },
  'Google': { color: 'var(--logo-google)', letter: 'G' },
  'Reddit': { color: 'var(--logo-reddit)', letter: 'R' },
  'BBC': { color: 'var(--logo-bbc)', letter: 'B' },
  'CNN': { color: 'var(--logo-cnn)', letter: 'C' },
  'YouTube': { color: 'var(--logo-youtube)', letter: 'Y' },
}

const rank = computed(() => props.item.rank || props.index + 1)

const rankClass = computed(() => {
  if (rank.value === 1) return 'bg-[var(--brand)] text-white'
  if (rank.value === 2) return 'bg-[var(--brand-light)] text-[var(--brand-dark)]'
  if (rank.value === 3) return 'bg-[oklch(90%_0.04_255)] text-[var(--brand-dark)]'
  return 'bg-[var(--surface-hover)] text-[var(--text-tertiary)]'
})

const tags = computed(() => {
  const t = props.item.tags || []
  if (props.item.primary_source?.tags) {
    return [...t, ...props.item.primary_source.tags]
  }
  return t
})

// 格式化热度值
const heatDisplay = computed(() => {
  const raw = props.item.unified_heat || props.item.primary_source?.original_heat || 0
  if (typeof raw === 'string') return raw
  if (raw >= 100000000) return (raw / 100000000).toFixed(1) + '亿'
  if (raw >= 10000) return (raw / 10000).toFixed(1) + '万'
  return Math.round(raw).toString()
})

const platformName = computed(() => {
  return props.item.primary_source?.platform || '未知来源'
})

const platformLogo = computed(() => {
  return platformLogoMap[platformName.value] || { color: 'var(--text-muted)', letter: '?' }
})

const platforms = computed(() => {
  const sources = []
  if (props.item.primary_source?.platform) {
    sources.push(props.item.primary_source.platform)
  }
  if (props.item.secondary_sources) {
    props.item.secondary_sources.forEach(s => {
      if (s.platform && !sources.includes(s.platform)) {
        sources.push(s.platform)
      }
    })
  }
  return sources
})

const showSpark = computed(() => rank.value <= 3)

const categoryClass = computed(() => {
  const catMap = {
    '科技': 'cat-tech',
    '娱乐': 'cat-ent',
    '财经': 'cat-finance',
    '体育': 'cat-sports',
    '社会': 'cat-society',
    'tech': 'cat-tech',
    'entertainment': 'cat-ent',
    'finance': 'cat-finance',
    'sports': 'cat-sports',
    'society': 'cat-society',
  }
  return catMap[props.item.category] || ''
})

function handleClick() {
  const url = props.item.primary_source?.url
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  emit('click', props.item)
}
</script>

<template>
  <div
    @click="handleClick"
    class="hot-card scroll-reveal flex items-start gap-3 p-3 sm:p-4 bg-[var(--surface-alt)] border border-[var(--border-light)] rounded-[var(--radius-md)] cursor-pointer transition-all duration-200 relative group hover:border-[var(--border)] hover:shadow-[var(--shadow-md)] hover:-translate-y-px active:scale-[0.995]"
    :class="categoryClass"
    :style="{ animationDelay: `${index * 0.03}s`, animation: 'cardIn 0.4s var(--ease-out-expo) both' }"
  >
    <!-- Rank -->
    <div
      class="w-[26px] h-[26px] rounded-[var(--radius-sm)] flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all duration-200"
      :class="rankClass"
    >
      {{ rank }}
    </div>

    <!-- Body -->
    <div class="flex-1 min-w-0">
      <!-- Meta: trend + tags -->
      <div class="flex items-center gap-1.5 mb-0.5">
        <span class="text-xs font-semibold" :class="trendClassMap[item.trend] || 'text-[var(--text-muted)]'">
          {{ trendMap[item.trend] || '→' }}
        </span>
        <span v-if="tags.length" class="flex gap-1">
          <span
            v-for="tag in tags"
            :key="tag"
            class="text-[10px] font-semibold px-1.5 py-px rounded tracking-[0.3px]"
            :class="tagClassMap[tag] || 'bg-[var(--orange-bg)] text-[var(--orange)]'"
          >
            {{ tag }}
          </span>
        </span>
      </div>

      <!-- Title -->
      <div class="text-sm font-semibold text-[var(--text-primary)] leading-[1.5] line-clamp-2 mb-0.5 tracking-[-0.1px]">
        {{ item.title }}
      </div>

      <!-- Subtitle -->
      <div v-if="item.subtitle" class="text-xs text-[var(--text-tertiary)] leading-[1.5] line-clamp-1 mb-2">
        {{ item.subtitle }}
      </div>

      <!-- Footer: logo + platform + heat + time -->
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)]">
          <span
            class="platform-logo"
            :style="{ background: platformLogo.color }"
          >{{ platformLogo.letter }}</span>
          {{ platformName }}
        </span>
        <span class="text-[var(--text-muted)] text-[11px]">·</span>
        <span class="text-xs text-[var(--text-tertiary)] flex items-center gap-0.5">
          <span class="inline-flex items-center" :class="{ 'animate-flicker': showSpark }">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="color: var(--orange)">
              <path d="M13 2L10.5 8.5H4L9 13L6.5 19.5L13 15L19.5 19.5L17 13L22 8.5H15.5L13 2Z"/>
            </svg>
          </span>
          {{ heatDisplay }} 热度
        </span>
        <span v-if="platforms.length > 1" class="text-[11px] text-[var(--brand)] flex items-center gap-0.5 font-medium">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          等 {{ platforms.length }} 平台
        </span>
      </div>
    </div>

    <!-- Arrow -->
    <svg class="flex-shrink-0 text-[var(--text-muted)] opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 mt-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  </div>
</template>

<style scoped>
/* 分类色条 — hover 时显示 */
.hot-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 2px;
  border-radius: 0 1px 1px 0;
  opacity: 0;
  transition: opacity 0.2s var(--ease-out-expo);
}
.hot-card:hover::before { opacity: 1; }

.cat-tech::before { background: var(--cat-tech); }
.cat-ent::before { background: var(--cat-ent); }
.cat-finance::before { background: var(--cat-finance); }
.cat-sports::before { background: var(--cat-sports); }
.cat-society::before { background: var(--cat-society); }

.animate-flicker svg {
  animation: flicker 1.2s ease-in-out infinite;
}
</style>
