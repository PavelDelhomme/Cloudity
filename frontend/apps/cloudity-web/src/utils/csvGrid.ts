/**
 * Parse / sérialise CSV pour l’éditeur tableur (grille type Excel).
 */

export function parseCsvToGrid(text: string): string[][] {
  const lines = text.split(/\r?\n/)
  const grid: string[][] = []
  for (const line of lines) {
    const row: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if ((ch === ',' || ch === ';') && !inQuotes) {
        row.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
    row.push(cur)
    grid.push(row)
  }
  if (grid.length === 0) grid.push([''])
  return grid
}

export function gridToCsv(grid: string[][], sep = ','): string {
  return grid
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '')
          if (s.includes(sep) || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"'
          }
          return s
        })
        .join(sep)
    )
    .join('\n')
}
