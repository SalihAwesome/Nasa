const columnLine = 'ts,lux_up,lux_dn,tg,tamb,uv,ta,rh,p,t10'
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const utcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

export type PodRecord = {
  ts: string
  lux_up: number | null
  lux_dn: number | null
  tg: number | null
  tamb: number | null
  uv: number | null
  ta: number | null
  rh: number | null
  p: number | null
  t10: number | null
}

export type PodLine =
  | { kind: 'record'; record: PodRecord; saturated: { lux_up: boolean; lux_dn: boolean } }
  | { kind: 'columns' }
  | { kind: 'setting'; key: string; value: string }
  | { kind: 'comment' }
  | { kind: 'error'; reason: 'column-count' | 'timestamp' | 'reading' }

function isUtcTimestamp(value: string): boolean {
  if (!utcTimestamp.test(value)) return false

  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19)
}

function parseReading(value: string): number | null {
  if (value === '') return null
  if (!decimal.test(value)) return NaN
  const reading = Number(value)
  return Number.isFinite(reading) ? reading : NaN
}

/** Supply the current log or link's lux_max setting to flag saturation. */
export function parsePodLine(input: string, luxMax?: number): PodLine {
  const line = input.replace(/\r?\n$|\r$/, '')
  if (line === columnLine) return { kind: 'columns' }
  if (line.startsWith('#')) {
    const setting = /^#\s*([\w-]+)\s*=(.*)$/.exec(line)
    return setting
      ? { kind: 'setting', key: setting[1], value: setting[2].trim() }
      : { kind: 'comment' }
  }

  const fields = line.split(',')
  if (fields.length !== 10) return { kind: 'error', reason: 'column-count' }
  const [ts, ...readings] = fields
  if (!isUtcTimestamp(ts)) return { kind: 'error', reason: 'timestamp' }

  const values = readings.map(parseReading)
  if (values.some(Number.isNaN)) return { kind: 'error', reason: 'reading' }
  const [lux_up, lux_dn, tg, tamb, uv, ta, rh, p, t10] = values
  return {
    kind: 'record',
    record: { ts, lux_up, lux_dn, tg, tamb, uv, ta, rh, p, t10 },
    saturated: {
      lux_up: luxMax !== undefined && lux_up !== null && lux_up >= luxMax,
      lux_dn: luxMax !== undefined && lux_dn !== null && lux_dn >= luxMax,
    },
  }
}
