import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { documentAnswer } from './projectAssistant'

const helpPath = 'docs/assistant-help.md'
const passages = readFileSync(new URL('../../docs/assistant-help.md', import.meta.url), 'utf8')
  .split(/(?=^## )/m).filter(section => section.startsWith('## ')).map(content => ({ path: helpPath, content }))

test.each(['how to compare two sites?', 'How do I compare locations on Earth, the Moon, and Mars?'])('answers %s with short, actionable steps', question => {
  const reply = documentAnswer([{ role: 'user', content: question }], passages)
  expect(reply.answer).toMatch(/^1\. Open Compare sites/)
  expect(reply.answer).toContain('Set both worlds to Earth')
  expect(reply.answer).toContain('Compare selected locations')
  expect(reply.answer.match(/^\d\. /gm)).toHaveLength(4)
  expect(reply.answer.split(/\s+/).length).toBeLessThanOrEqual(80)
  expect(reply.sources).toEqual([helpPath])
})

test('gives sunlight steps for a sky comparison rather than a location comparison', () => {
  const reply = documentAnswer([{ role: 'user', content: 'How do I compare sunlight on Earth and Mars?' }], passages)
  expect(reply.answer).toMatch(/^1\. Open Sunlight/)
  expect(reply.answer).toContain('Elevation chart')
})

test('does not substitute a task guide or paste source documents for an unsupported science question', () => {
  const reply = documentAnswer([{ role: 'user', content: 'What is the sunlight sensor accuracy?' }], [
    ...passages, { path: 'README.md', content: 'Source excerpt that must not be pasted.' },
  ])
  expect(reply.answer).toContain('Connect OpenAI')
  expect(reply.answer).not.toContain('Source excerpt')
  expect(reply.answer).not.toContain('Open Sunlight')
  expect(reply.sources).toEqual([])
})

test.each(['What happens when a score is missing?', 'What does this app do?'])('only gives the overview for questions about the website itself: %s', question => {
  const reply = documentAnswer([{ role: 'user', content: question }], passages)
  expect(reply.answer.startsWith('Find Earth locations')).toBe(question === 'What does this app do?')
})
