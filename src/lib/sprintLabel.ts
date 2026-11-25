import { type AutoVelocitySprint } from './types'

export function sprintLabel(s: AutoVelocitySprint): string {
  const m = s.name.match(/\d{4}-Q\d-\d+/i)
  return m ? m[0] : s.name.replace(/\s+Doom.*$/i, '').trim() || String(s.jiraSprintId)
}
