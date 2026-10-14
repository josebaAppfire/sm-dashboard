import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type SprintRecord, type PlanningResult } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_PATH = resolve(__dirname, '../data/sprints.json')

function readStore(): SprintRecord[] {
  try {
    return JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as SprintRecord[]
  } catch {
    return []
  }
}

function writeStore(sprints: SprintRecord[]): void {
  writeFileSync(DATA_PATH, JSON.stringify(sprints, null, 2) + '\n', 'utf-8')
}

export function getAllSprints(): SprintRecord[] {
  return readStore()
}

export function addSprint(sprint: SprintRecord): SprintRecord {
  const sprints = readStore()
  if (sprints.find((s) => s.id === sprint.id)) {
    throw new Error(`Sprint "${sprint.id}" already exists. Use PATCH to update.`)
  }
  sprints.push(sprint)
  writeStore(sprints)
  return sprint
}

export function updateSprint(id: string, patch: Partial<SprintRecord>): SprintRecord {
  const sprints = readStore()
  const idx = sprints.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`Sprint "${id}" not found.`)
  sprints[idx] = { ...sprints[idx], ...patch, id }
  writeStore(sprints)
  return sprints[idx]
}

export function deleteSprint(id: string): void {
  const sprints = readStore()
  const idx = sprints.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`Sprint "${id}" not found.`)
  sprints.splice(idx, 1)
  writeStore(sprints)
}

// -----------------------------------------------------------------------
// Planning calculator
// -----------------------------------------------------------------------

export function calculatePlanning(
  devDays: number,
  referenceId: string
): PlanningResult {
  const sprints = readStore()
  const ref = sprints.find((s) => s.id === referenceId)
  if (!ref) throw new Error(`Reference sprint "${referenceId}" not found.`)
  if (!ref.delivered) throw new Error(`Reference sprint "${referenceId}" has no delivered SP.`)
  if (!ref.devDays) throw new Error(`Reference sprint "${referenceId}" has no devDays recorded.`)

  const capacityPct = devDays / ref.devDays
  const ceiling = Math.round(ref.delivered * capacityPct)
  const conservative = Math.round(ceiling * 0.92) // ~8% buffer
  const bucketB = Math.round(ceiling * 0.55)
  const bucketA = ceiling - bucketB

  return {
    referenceSprintId: ref.id,
    referenceDelivered: ref.delivered,
    referenceDevDays: ref.devDays,
    inputDevDays: devDays,
    capacityPct,
    ceiling,
    conservative,
    bucketB,
    bucketA,
  }
}

// -----------------------------------------------------------------------
// Export to velocity-history.md
// -----------------------------------------------------------------------

export function exportToMarkdown(): string {
  const sprints = readStore()

  const rows = sprints
    .map((s) => {
      const delivered = s.delivered != null ? String(s.delivered) : '—'
      const committed = s.committed != null ? String(s.committed) : '—'
      const ctx = s.context || ''
      const jira = s.jiraSprintId ? ` Jira ${s.jiraSprintId}.` : ''
      return `| ${s.id} | ${delivered} | ${committed} |${jira} ${ctx} |`
    })
    .join('\n')

  // Rolling 3-sprint average (only sprints with delivered SP)
  const withSp = sprints.filter((s) => s.delivered != null)
  let rolling = '—'
  if (withSp.length >= 3) {
    const last3 = withSp.slice(-3)
    const avg = Math.round(last3.reduce((s, x) => s + (x.delivered ?? 0), 0) / 3)
    rolling = `${avg} SP (últimos 3: ${last3.map((x) => x.id).join(', ')})`
  }

  return `# Histórico de velocidad del equipo

## Definición de "entregado"

Una issue cuenta como **terminada y entregada** (y entra en la velocidad) cuando está en:

- **Done**, o
- **Waiting for Release**

> Generado automáticamente por \`sm-dashboard\`. Editar los datos en \`sm-dashboard/data/sprints.json\`.

## Tabla de sprints

| Sprint | SP entregados | SP planificados | Contexto |
|---|---|---|---|
${rows}

## Media móvil (últimos 3 sprints)

${rolling}
`
}
