import { useState } from 'react'
import tests from '../../../shared/tests.json'
import { loadTargetSettings } from '../data/targets'
import type { Target } from '../data/targets'
import './mobility.css'

// Display names are the five tests in docs/project-brief.md.
const labels: Record<string, string> = { power: 'Power', mobility: 'Mobility', communications: 'Communications', navigation: 'Navigation', science_tools: 'Science tools' }
const targets = loadTargetSettings().targets

export function TestSelector({ value, target, onChange, availableLayers = [] }: {
  value: string; target: Target['id']; onChange: (value: string) => void; availableLayers?: readonly string[]
}) {
  const definitions = tests.map(test => {
    if (test.id !== 'mobility' || !test.enabled) return test
    const terrain = targets.find(candidate => candidate.id === target)?.mobility
    const ready = terrain?.slope.value != null && terrain.roughness.value != null && availableLayers.includes('slope') && availableLayers.includes('roughness')
    return ready ? test : { ...test, enabled: false, reason: test.reason ?? terrain?.slope.reason ?? 'Slope and roughness layers and target values are unavailable.' }
  })
  return <div className="mobility-test-selector">
    <label htmlFor={`test-${target}`}>Test</label>
    <select id={`test-${target}`} aria-describedby={`test-reasons-${target}`} value={value} onChange={event => onChange(event.target.value)}>
      {definitions.map(test => <option key={test.id} value={test.id} disabled={!test.enabled}>{labels[test.id]}{!test.enabled && ` — ${test.reason}`}</option>)}
    </select>
    <ul id={`test-reasons-${target}`}>{definitions.filter(test => !test.enabled).map(test => <li key={test.id}><strong>{labels[test.id]}:</strong> {test.reason}</li>)}</ul>
  </div>
}

export function MobilityAvailability() {
  const [value, setValue] = useState(tests.find(test => test.enabled)!.id)
  return <TestSelector value={value} target={targets[0].id} onChange={setValue} />
}
