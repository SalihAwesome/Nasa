import { expect, test } from 'vitest'
import sharedReadme from '../../shared/README.md?raw'

test('the app can import a file from ../shared', () => {
  expect(sharedReadme).toContain('# shared')
})
