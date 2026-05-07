/**
 * Formate une taille en octets en chaîne lisible (Ko, Mo, Go).
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 o'
  const k = 1024
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / Math.pow(k, i)
  return `${value.toFixed(1).replace('.', ',')} ${units[i]}`
}
