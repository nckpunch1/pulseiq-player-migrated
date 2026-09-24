import { expect, it } from 'vitest'
import { regionSlug } from '../src/lib/regionAccess'

it.each([
  ['  Brisbane North  ', 'brisbane-north'],
  ['São José', 'sao-jose'],
  ['North / West & Coast', 'north-west-coast'],
  ['--Region 42--', 'region-42'],
])('normalizes region name %s into a stable slug', (name, expected) => {
  expect(regionSlug(name)).toBe(expected)
  expect(regionSlug(expected)).toBe(expected)
})
it.each([null, undefined, '', '   ', '!!!'])('rejects names without usable slug characters: %j', name => {
  expect(() => regionSlug(name)).toThrow('Region needs a valid lowercase-hyphenated slug.')
})
