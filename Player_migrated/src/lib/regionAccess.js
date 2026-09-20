// Profile regions contain region document IDs. Resolve claim slugs at the boundary.
export const regionSet = (profile) => [...new Set(
  (Array.isArray(profile?.regions) ? profile.regions : [])
    .filter(id => typeof id === 'string' && id.trim()).map(id => id.trim())
)]
export const hasRegionAccess = (profile, regionId) => regionSet(profile).includes(regionId)
export function requireRegionId(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Select a region before creating this record.')
  return value.trim()
}
export function teamCreationRegion(profile, selectedRegionId) {
  const regions = regionSet(profile)
  return requireRegionId(selectedRegionId || (regions.length === 1 ? regions[0] : null))
}
export function regionSlug(name) {
  const slug = String(name ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (!slug) throw new Error('Region needs a valid lowercase-hyphenated slug.')
  return slug
}
