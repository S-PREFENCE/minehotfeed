import { onMounted, onUnmounted, nextTick } from 'vue'

export function useScrollReveal(selector = '.scroll-reveal', options = {}) {
  let observer = null

  const defaultOptions = {
    threshold: 0.05,
    rootMargin: '0px 0px -20px 0px',
  }

  function initObserver() {
    if (observer) observer.disconnect()

    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
          // 一旦可见就不再观察，减少持续监听的开销
          observer.unobserve(entry.target)
        }
      })
    }, { ...defaultOptions, ...options })
  }

  function observeElements() {
    nextTick(() => {
      if (!observer) initObserver()
      document.querySelectorAll(selector).forEach((el) => {
        observer.observe(el)
      })
    })
  }

  onMounted(() => {
    initObserver()
    observeElements()
  })

  onUnmounted(() => {
    if (observer) {
      observer.disconnect()
      observer = null
    }
  })

  return {
    observeElements,
  }
}
