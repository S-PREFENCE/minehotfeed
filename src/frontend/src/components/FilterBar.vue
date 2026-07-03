<script setup>
const props = defineProps({
  modelValue: { type: String, default: 'all' },
})

const emit = defineEmits(['update:modelValue'])

const categories = [
  { key: 'all', label: '全部', dot: null },
  { key: '科技', label: '科技', dot: 'var(--cat-tech)' },
  { key: 'tech', label: '科技', dot: 'var(--cat-tech)' },
  { key: '娱乐', label: '娱乐', dot: 'var(--cat-ent)' },
  { key: 'entertainment', label: '娱乐', dot: 'var(--cat-ent)' },
  { key: '财经', label: '财经', dot: 'var(--cat-finance)' },
  { key: 'finance', label: '财经', dot: 'var(--cat-finance)' },
  { key: '体育', label: '体育', dot: 'var(--cat-sports)' },
  { key: 'sports', label: '体育', dot: 'var(--cat-sports)' },
  { key: '社会', label: '社会', dot: 'var(--cat-society)' },
  { key: 'society', label: '社会', dot: 'var(--cat-society)' },
]

// 去重（中英文 key 可能重复）
const seen = new Set()
const uniqueCats = categories.filter(c => {
  if (seen.has(c.label)) return false
  seen.add(c.label)
  return true
})

function selectCat(key) {
  emit('update:modelValue', key)
}
</script>

<template>
  <nav class="sticky top-14 z-90 bg-[var(--surface)] border-b border-[var(--border-light)] transition-colors duration-300">
    <div class="max-w-[var(--max-width)] mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
      <button
        v-for="cat in uniqueCats"
        :key="cat.key"
        @click="selectCat(cat.key)"
        class="flex items-center gap-1.5 px-3.5 py-1.5 border rounded-[20px] text-sm font-medium whitespace-nowrap cursor-pointer select-none transition-all duration-200"
        :class="modelValue === cat.key
          ? 'bg-[var(--brand)] border-[var(--brand)] text-white'
          : 'bg-transparent border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)]'"
      >
        <span
          v-if="cat.dot"
          class="w-2 h-2 rounded-full flex-shrink-0"
          :style="{ background: cat.dot }"
        ></span>
        {{ cat.label }}
      </button>
    </div>
  </nav>
</template>

<style scoped>
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
</style>
