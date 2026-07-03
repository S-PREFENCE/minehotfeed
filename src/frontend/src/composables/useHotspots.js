import { ref, onMounted, onUnmounted } from 'vue'

const POLL_INTERVAL = 10 * 60 * 1000 // 10 minutes

// API 地址：同域部署，使用相对路径
const API_BASE = '/api'

export function useHotspots() {
  const domestic = ref([])
  const international = ref([])
  const meta = ref({})
  const loading = ref(true)
  const error = ref(null)
  const lastRefresh = ref(null)

  let pollTimer = null
  let refreshTimer = null

  async function fetchData() {
    try {
      const res = await fetch(`${API_BASE}/v1/hotspots?region=all&limit=50`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.code === 0) {
        domestic.value = json.data.domestic || []
        international.value = json.data.international || []
        meta.value = json.data.meta || {}
        lastRefresh.value = new Date()
        error.value = null
      } else {
        throw new Error('API returned error code')
      }
    } catch (e) {
      console.error('获取热点数据失败:', e)
      error.value = e.message || '网络请求失败'
      // Keep last successful data
    } finally {
      loading.value = false
    }
  }

  function startPolling() {
    stopPolling()
    pollTimer = setInterval(fetchData, POLL_INTERVAL)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function updateRefreshDisplay() {
    if (!lastRefresh.value) return '--'
    const diff = Math.floor((Date.now() - lastRefresh.value.getTime()) / 60000)
    if (diff < 1) return '刚刚更新'
    if (diff < 60) return `${diff} 分钟前更新`
    const hours = Math.floor(diff / 60)
    return `${hours} 小时前更新`
  }

  onMounted(() => {
    fetchData()
    startPolling()
  })

  onUnmounted(() => {
    stopPolling()
  })

  return {
    domestic,
    international,
    meta,
    loading,
    error,
    lastRefresh,
    updateRefreshDisplay,
    fetchData,
  }
}
