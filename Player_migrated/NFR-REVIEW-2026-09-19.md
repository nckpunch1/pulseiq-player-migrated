# Player app — critical NFR review

Reviewed 19 September 2026 at `71ea5b5`, branch `perf/module-ttl-cache`.

**The critical security issues are shared with AdminHost. The most significant additional Player-specific risks concern team approval, inconsistent membership records and weak automated regression protection.** Performance has improved since the August audit, although leaderboard reads still grow with historical data.

This review covers the current local Player source, Firebase integration, build, lint and dependency audit. It does not establish which commit or rules are deployed. No production requests to test permissions were made. Local environment configuration identifies the same primary Firebase project as AdminHost; configuration values are not reproduced here. The shared rule findings reference AdminHost's checked-in rules. No separate Player rule deployment configuration was found.

## Verified baseline

| Check | Result |
|---|---|
| Production build | Passed |
| ESLint | 22 errors, 3 warnings |
| Automated tests | No test script or test suite found in the reviewed app |
| Dependency audit | 12 affected package entries: 1 critical, 9 high, 1 moderate, 1 low |
| Largest shared JS output | 491.38 kB raw / 148.43 kB gzip |
| Main JS output | 253.05 kB raw / 80.38 kB gzip |
| Largest source files | firebaseClient.js 1,159 lines; Team.jsx 995; LiveGame.jsx 758; GameDetail.jsx 584 |

Bundle sizes are build measurements, not measured user latency. Dependency severities are registry classifications, not confirmed reachable application vulnerabilities. Existing changes to the parent `.gitignore` were left untouched. Only this report was added.

## 1. Critical — shared role escalation and excessive data permissions

[Player registration](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/api/firebaseClient.js:151) creates a user profile with `role: 'player'`, `manuallyVerified: false` and `teamId`. The [shared users rule](/Users/nickpanchuk/Documents/PulseIQ-Workspace/admin-host/firestore.rules:5) permits unrestricted writes to one's own user document. Consequently, under those rules, a player can change their own role, manual-verification flag and team pointer. Setting the initial role correctly in the registration form does not protect it from later SDK writes.

The role change compromises AdminHost authorization, as already documented. Player also trusts the editable manual-verification flag in [useAuth.jsx:22](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/hooks/useAuth.jsx:22), so the email-verification UI can be bypassed. The shared rules permit broad authenticated writes to teams, memberships, registrations, scores and leaderboards, and authenticated reads of user profiles. The invitation flow actively queries profiles by email at [Team.jsx:379](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/pages/Team.jsx:379).

**Recommendation:** include Player explicitly in the scheduled shared security remediation. Protect role/manual-verification/team assignment fields; separate private contact information from public identity; enforce team ownership, captain authority and allowed registration transitions in the trusted layer. Design a controlled invitation lookup rather than relying on broad profile access. Firebase supports changed-field restrictions, and private fields require separate documents when readers must not see the whole profile: [field access guidance](https://firebase.google.com/docs/firestore/security/rules-fields).

**Required tests:** a player cannot promote themselves, manually verify themselves, adopt an arbitrary team, read unrelated private profiles or alter another team's registration/scores. Valid signup, profile editing, invitation and captain approval must continue working. This is a shared finding, not a second independent vulnerability to count in the security backlog.

## 2. High — pending membership can be treated as approved

Three paths discover a membership record and write its parent team into the current user's `teamId`, without checking that the membership is approved:

- [Membership listener, Team.jsx:180](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/pages/Team.jsx:180).
- [15-second poll, Team.jsx:211](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/pages/Team.jsx:211).
- [“Been approved?” refresh, Team.jsx:759](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/pages/Team.jsx:759).

All select the first matching document. A pending request, cancelled record or membership from another team can therefore become the user's authoritative team pointer. Some roster rendering correctly filters approved members, which can make the resulting state contradictory: the user's team pointer and the visible roster disagree. This does not by itself grant the captain role, but bypasses the intended team-assignment approval gate.

**Recommendation:** require an explicitly accepted membership, use deterministic membership identity and define how legacy/multiple records are resolved. Prefer an authoritative approval operation that updates the member and user together. Remove the redundant poll after reliable subscription/error handling is established. Enforce the invariant in rules/backend too; a UI filter alone cannot protect against direct writes.

**Required tests:** pending/rejected/cancelled requests never assign a team; approved membership does; multiple requests cannot pick an arbitrary team; revocation/leave does not get undone by a delayed listener or poll.

## 3. High — team operations can leave partial or contradictory records

[createTeam:525](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/api/firebaseClient.js:525) commits the team and captain membership, then writes `users.teamId` separately. [handleJoinRequest:633](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/api/firebaseClient.js:633) concurrently updates membership and the other user's profile using independent writes. [leaveTeam:682](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/api/firebaseClient.js:682) similarly separates deletion and clearing the profile pointer.

There is also a specific rules incompatibility: under the checked-in users rule, an ordinary player acting as captain cannot update the joining player's user document. The membership update can succeed while the profile update is denied. Current self-repair behavior can hide this partial failure, but also causes finding 2. Simply filtering that repair more strictly does not solve the underlying approval operation.

**Recommendation:** design the authorized membership transition first, then make its Firestore writes atomic. A trusted backend command is a suitable way to coordinate captain authorization and cross-user updates without giving captains broad profile-write permission. Validate existing membership and captain constraints, and make retries idempotent. Do not merely wrap the existing denied cross-user write in a batch and assume authorization is resolved.

**Required tests:** a normal captain can approve only their team's requests; denied or interrupted operations leave no partial state; retries cannot create duplicate teams/memberships; competing approvals cannot assign a user to two teams.

## 4. High — registration authority and state transitions rely on the client

[registerForGame:881](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/api/firebaseClient.js:881) reads `soldOut` and later performs an unconditional registration `setDoc`. It does not atomically enforce the session's registration state. A repeat/stale write can replace an existing registration and reset its attendance state to `not_requested`. [confirmAttendance:924](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/api/firebaseClient.js:924) writes `confirmedBy: 'captain'` after resolving the current user's team, without verifying captain authority in the service. Shared rules allow these writes from any authenticated principal.

**Recommendation:** make registration creation/retry and attendance transitions authoritative, scoped to the correct team and actor, and conditional on current session/registration state. Define whether members or only captains may perform each action. Preserve existing confirmation data on duplicate requests. Apply strict allowed fields and numeric bounds for team sizes.

**Required tests:** duplicate registration preserves confirmation; a stale client cannot reopen/overwrite a closed registration; unrelated players cannot confirm/cancel it; recorded actor identity reflects the authenticated caller.

## 5. Medium — startup and network failures lack clear recovery

[useAuth.jsx](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/hooks/useAuth.jsx:9) hides the whole app while initial auth/profile work is pending. It renders `null` rather than a visible loading/retry state. Profile failures are caught, which is a useful improvement over a hard crash, but a slow unresolved request has no explicit timeout/recovery UI. The async auth callback also has no generation guard against a previous user's request finishing after sign-out/account change.

The app uses memory-only Firestore caching to avoid known IndexedDB issues on iOS. Keep that compatibility rationale: blindly enabling persistent storage is not the fix. The new module cache improves navigation but does not survive reload or provide a complete offline workflow. No application error boundary or integrated error-reporting system was found in the reviewed app shell.

**Recommendation:** visible startup state, bounded recovery with retry, stale-auth-response protection, explicit offline/stale-data messaging and a route error boundary. Test slow/rejected profile reads, sign-out during loading and real mobile reconnect behavior. Do not describe all unavailable data as an empty successful result.

## 6. Medium — remaining performance costs grow with history

[getLeaderboardsUncached:1026](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/api/firebaseClient.js:1026) still reads the entire `leaderboard` collection group, then validates referenced teams. [Leaderboard.jsx:105](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/pages/Leaderboard.jsx:105) fetches this all-time data even when displaying the default season tab. The 30-second cache mitigates repeat visits, but does not bound cold reads or new users' costs. Errors are converted into null/empty results, which can then be cached as if valid.

The teamless-user membership poll still queries every 15 seconds when there is no membership to resolve. The registration collection-group query is consolidated but can include historical registrations for that team. Shared JS output totals about 229 kB gzip before route chunks/CSS, and RTDB initializes with the common Firebase module.

**Recommendation:** lazy-fetch all-time standings, introduce bounded aggregates/queries, stop unnecessary polling, and retain last-known data with an explicit error rather than caching failed reads as empty success. Profile real mobile startup and venue-network behavior before selecting bundle changes. No critical performance outage was demonstrated by this static review.

## 7. High-priority dependency triage and missing regression protection

The registry reports 12 affected package entries, including critical `websocket-driver` and high findings involving React Router, Firebase transport dependencies, Vite and build tooling. Some React Router advisories concern SSR/RSC/server endpoints that this BrowserRouter SPA does not show; they must not be presented as proven production exploits. Likewise establish whether the vulnerable Node websocket transport is in any actual runtime path. Patch supported dependencies in reviewable changes, then re-run audit/build and targeted browser tests; do not apply forced major upgrades indiscriminately.

There is no configured automated test suite comparable to AdminHost's. Build success does not validate permissions, membership approval, cache invalidation or registration transitions. Start with those critical workflows, cache race/invalidation tests, and an emulator role/ownership matrix. Firebase's [rules test guidance](https://firebase.google.com/docs/rules/unit-tests) supports testing permissions without production writes. Add a small browser smoke suite for signup/verification, team request/approval, registration/confirmation and reconnect.

The API module and Team page are now 1,159 and 995 lines respectively. Split authentication/profile, teams/membership, registrations and leaderboards into focused services after behavioral tests exist. Avoid coupling this work to a full UI rewrite. Full lint currently fails with 22 errors and 3 warnings; establish a baseline and prevent new debt while addressing the highest-risk findings.

## Deferred live-answer integration findings

These are recorded separately because unfinished Digital gameplay is not a current implementation priority. Confirm whether any Pulse answer-submission flow is used before promoting their urgency.

- [PulseAnswerScreen:126](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/pages/LiveGame.jsx:126) sets `submitted=true` before awaiting the database write, with no catch or retry. A failed write can leave “Answer submitted!” displayed despite failure. If this path is used live, treat it as High and show success only after acknowledgement.
- [MiniGameOverlay:34](/Users/nickpanchuk/Documents/PulseIQ-Workspace/player/Player_migrated/src/components/MiniGameOverlay.jsx:34) omits the required known session ID when invoking the Pulse hook. Its subscription therefore never activates, although it still fetches team identity.
- Player's Pulse hook uses the primary Firebase database; AdminHost's current Pulse service writes to its secondary display database. No bridge was established by this review. Verify the intended integration and backend/mirroring setup before enabling these Player features. Do not assume a new UI alone will make them compatible.

## Progress since the August report

The earlier report should not be treated as the current baseline. The following improvements are present:

- A 30-second module cache, concurrent fetch sharing, invalidation generations and explicit logout clearing.
- Last-known-data rendering on returning to key screens.
- Consolidated registration reads replacing the prior per-session query pattern.
- Batched session listeners and a registration collection-group listener, with fallback handling, replacing the normal one-listener-per-session approach.
- Route-level lazy loading remains in place.

The membership approval, multi-document consistency, cold-start feedback and unbounded all-time leaderboard issues remain. No fresh production read-count or latency measurements were taken; the old audit's exact read-cost estimates should not be reused as current measurements.

## Recommended order

1. Include Player signup, verification, invitations, captain approval and registration in the already-scheduled shared authorization work. Preserve legitimate flows with emulator tests before deployment.
2. Fix team assignment/approval and make team transitions atomic and idempotent. This is the highest-value Player-specific batch.
3. Protect registration transitions and add the first automated workflow tests.
4. Add startup/reconnect recovery and dependency updates with reachability review.
5. Bound leaderboard reads, remove redundant polling, then split the large API/Team modules.

Deployment verification, Firebase IAM/provider settings, production headers, telemetry and real mobile/network testing remain outside the evidence collected here. Application code, dependencies and deployed rules were not changed.
