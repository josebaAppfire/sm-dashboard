import { readFileSync } from 'node:fs'
import { getConfig } from '../server/jira-client.ts'
import { fetchAutoVelocity } from '../server/velocity-auto.ts'

async function main() {
  const config = getConfig()
  const data = await fetchAutoVelocity(config, { boardId: 4886, teamId: 'Doom', limit: 8 })
  const manual = JSON.parse(readFileSync('data/sprints.json', 'utf-8')) as Array<{
    jiraSprintId: number | null
    committed: number | null
    delivered: number | null
    scope: number | null
    id: string
  }>
  const byJira = new Map(manual.filter((s) => s.jiraSprintId).map((s) => [s.jiraSprintId!, s]))

  console.log('Auto velocity vs manual:')
  for (const s of data.sprints) {
    const m = byJira.get(s.jiraSprintId)
    if (!m) continue
    const dOk =
      m.delivered == null
        ? '—'
        : s.delivered === m.delivered
          ? 'OK'
          : `${s.delivered} vs ${m.delivered}`
    const cOk =
      m.committed == null
        ? '—'
        : s.committed === m.committed
          ? 'OK'
          : `${s.committed} vs ${m.committed}`
    console.log(
      m.id,
      '| committed',
      cOk,
      '| delivered',
      dOk,
      '| scope auto',
      s.scope,
      'manual',
      m.scope ?? '—'
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
