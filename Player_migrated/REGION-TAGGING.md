# Region tagging — Step 2, Part 1

New teams use an explicitly selected region, otherwise the only distinct ID in the player's profile `regions` array. Missing/multiple regions require selection. Scalar access values are not coerced to arrays, and no city is assumed. Region IDs remain Firebase document IDs; human-readable slugs are resolved separately for claims.

The team form loads region choices. `createTeam` validates both the required ID and existence of the region. It does not update the profile's region access as a side effect. New signup profiles initialize `regions: []`.

New registrations copy `regionId` from the parent session, not the profile or team. Existing registrations retain their current tags, including remaining untagged until Part 2. A new registration under a session with no region is rejected, so the separate backfill must precede rollout to legacy sessions.

Run `npm test` for ten offline tests covering these paths and the array/set helpers; run `npm run build` for the production build. Vitest uses a test-only nested Vite 6.4.2 override (the cached AdminHost toolchain), while the application still builds with Vite 8.0.10. No existing locked package versions were changed. Revisit the test-tool override during the planned dependency remediation.

No backfill, rules changes, scoring changes, production writes or push were performed. Existing unrelated `.gitignore` edits and the earlier uncommitted NFR report are excluded from this task's commit.
