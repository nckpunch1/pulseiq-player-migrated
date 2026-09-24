# Player regression tests

Run `npm test` or `npm run test:coverage` from `Player_migrated`. The latter writes an ignored HTML report to `coverage/index.html` and enforces scoped coverage floors.

The hardening pass adds 54 tests: auth API errors and verification, AuthProvider loading/offline/logout/listener cleanup, game availability and attendance, legacy records, leaderboard filtering and tie-breaks, and cache isolation. The full suite has 104 passing tests.

Using the same coverage include set, line coverage rose from 50.07% to 82.24%; final branch coverage is 85.24% and function coverage is 89.23%. The denominator includes firebaseClient, cache, inviteEmail, useAuth and regionAccess, including untested lines. It does not include all pages, routing or Firebase initialization.

Firebase and network dependencies are mocked. These tests check client behaviour, not Firestore authorization, real transaction concurrency, deployed email delivery or multi-client integration. Run the emulator rules suites and the Dev manual flows separately before release. Existing Dev configuration and email-stub tests are included in the total.

## Team page (`tests/teamPage.test.jsx`)

Component tests for `src/pages/Team.jsx`, run with the normal suite. An in-memory Firestore fires every `onSnapshot` listener on each write, like the live page. Covered: creating a team, region-scoped search, the duplicate check before a join request, a region-less account, captain approve/reject, member-only views, leaving, the four invite outcomes, asking an admin for a team, listener failure, and adopting a team only from an **accepted** member row.

## Integration: real client against the real regional rules

`npm run test:integration` runs `tests/integration/` in the Firestore emulator. It uses the real `src/api/firebaseClient.js`, and loads the rules from `../../admin-host/rules/firestore.candidate.rules`, so both repos must be checked out side by side. Only the Firebase bootstrap and Auth sign-up are simulated. It needs Java 21 and admin-host's `firebase-tools`; on this Mac:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH FIREBASE_EMULATORS_PATH=/tmp/pulseiq-firebase-emulators npm run test:integration
```

Gaps follow the KNOWN GAP convention. `npm run test:integration` pins today's behaviour; `npm run test:integration:rollout` requires the target and fails until each gap is fixed:

| ID | Gap under the regional rules |
| --- | --- |
| INT-01 | Profile rename writes `display_name`. Nothing reads it, and the rules don't allow it (`displayName` is the field). |
| INT-02 | `handleJoinRequest('approve')` also writes the applicant's `users.teamId` as the captain, which the rules refuse, so approval fails. |
| INT-03 | `getGames` queries sessions with no region filter and reads registrations through a collection-group query. Both are refused, so the Games list fails for every player. |
| INT-04 | Captain invite finds the invitee with `users WHERE email ==`. Players may only read their own profile, so inviting a registered player fails. |
