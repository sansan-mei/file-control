import { onMounted, onUnmounted, readonly, ref } from 'vue'

export const useIsMobile = () => {
  const isMobile = ref(false)

  const handleResize = () => {
    isMobile.value = window.innerWidth < 768
  }

  onMounted(() => {
    handleResize() // 初始化检查
    window.addEventListener('resize', handleResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
  })

  return readonly(isMobile)
}
