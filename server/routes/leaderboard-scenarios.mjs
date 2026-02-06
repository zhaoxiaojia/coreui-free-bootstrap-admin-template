import { Router } from 'express'
import { leaderboardScenarios } from '../services/leaderboard-scenarios.mjs'

const router = Router()

router.get('/', (req, res) => {
  const scenarios = Object.values(leaderboardScenarios).map(scenario => ({
    key: scenario.key,
    label: scenario.label,
    scoreLabel: scenario.scoreLabel ?? 'Score',
    scoring: scenario.scoring ?? null
  }))

  res.json({ scenarios })
})

export default router
