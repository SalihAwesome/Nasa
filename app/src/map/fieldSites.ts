import validationSites from '../../../shared/validation_sites.json'
import { findPodCell } from '../card/cardData'
import type { MapData } from './data'
import type { FieldSite } from './globe'

export function fieldSites(data: Pick<MapData, 'cells' | 'manifest'>): FieldSite[] {
  return validationSites.sites.map(({ id, name, coordinates }) => {
    let index: number | null = null
    try { index = findPodCell(data, coordinates) } catch { /* Keep a missing land cell unavailable. */ }
    return { id, name, lat: coordinates.lat, lon: coordinates.lon, index }
  })
}
