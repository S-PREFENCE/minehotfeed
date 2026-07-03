import { ref, watchEffect } from 'vue'

const STORAGE_KEY = 'hotfeed-theme'

const isDark = ref(false)

export function useTheme() {
  function applyTheme(dark) {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
    isDark.value = dark
  }

  function initTheme() {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark') {
      applyTheme(true)
    } else if (stored === 'light') {
      applyTheme(false)
    } else {
      // Follow system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      applyTheme(prefersDark)
    }
  }

  function toggleTheme() {
    applyTheme(!isDark.value)
  }

  // Listen for system preference changes
  watchEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        applyTheme(e.matches)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  })

  // Initialize on first call
  initTheme()

  return {
    isDark,
    toggleTheme,
    applyTheme,
  }
}
