export function scrollToId(id: string) {
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (id === 'top') {
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
    return
  }
  document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
}
