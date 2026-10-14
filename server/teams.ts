export interface BurnupTeam {
  id: string
  label: string
  boardId: number
}

/** Parses BURNUP_TEAMS="TeamA:123,TeamB:456" from .env. */
export function getBurnupTeams(): BurnupTeam[] {
  const raw = process.env.BURNUP_TEAMS ?? ''
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [name, board] = entry.split(':').map((p) => p.trim())
      const boardId = Number(board)
      if (!name || !Number.isFinite(boardId) || boardId <= 0) return []
      return [{ id: name, label: name, boardId }]
    })
}

export function findBurnupTeam(id: string): BurnupTeam | undefined {
  return getBurnupTeams().find((t) => t.id === id)
}

/** Sprint names include team, e.g. "2026-Q3-6 TeamA Sprint". */
export function sprintMatchesTeam(sprintName: string, teamId: string): boolean {
  const escaped = teamId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(sprintName)
}
