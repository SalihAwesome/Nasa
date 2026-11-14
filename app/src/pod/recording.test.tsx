import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import defaults from '../../../shared/pod-live-defaults.json'
import { createReplaySource } from './live'
import { createLiveSession, LivePanel } from './LivePanel'

const csv = readFileSync(new URL('../../public/data/sim/pod-sim.csv', import.meta.url), 'utf8')

test('U26 exposes a reset control on the live panel', () => {
  expect(renderToStaticMarkup(<LivePanel onHandoff={() => {}} />)).toContain('>Reset buffer</button>')
})

test('U26 fills and resets the replay buffer twice in the same live session', async () => {
  const session = createLiveSession('replay')
  const controller = new AbortController()
  let replayMs = 0
  let passes = 0

  await createReplaySource({ csv, speed: 60, wait: async ms => { replayMs += ms } }).run(event => {
    session.receive(event)
    if (event.kind !== 'record' || session.snapshot().bufferedRecords !== defaults.recordLimit) return

    const full = session.snapshot()
    expect(full.latest).toBe(event)
    expect(full.simulated).toBe(true)
    expect(full.reflectivity).not.toBeNull()
    if (passes === 0) expect(replayMs).toBeLessThanOrEqual(10 * 60 * 1000)

    session.resetBuffer()
    const cleared = session.snapshot()
    expect(cleared).toMatchObject({ source: 'replay', simulated: true, latest: null, reflectivity: null, bufferedRecords: 0 })
    console.info(`U26 replay pass ${passes + 1}: ${full.bufferedRecords} → ${cleared.bufferedRecords} records`)
    passes += 1
    if (passes === 2) controller.abort()
  }, controller.signal)

  expect(passes).toBe(2)
})
