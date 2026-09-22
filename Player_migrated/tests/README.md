# Player regression tests

Run `npm test` or `npm run test:coverage` from `Player_migrated`. The latter writes an ignored HTML report to `coverage/index.html` and enforces scoped coverage floors.

The hardening pass adds 54 tests: auth API errors and verification, AuthProvider loading/offline/logout/listener cleanup, game availability and attendance, legacy records, leaderboard filtering and tie-breaks, and cache isolation. The full suite has 104 passing tests.

Using the same coverage include set, line coverage rose from 50.07% to 82.24%; final branch coverage is 85.24% and function coverage is 89.23%. The denominator includes firebaseClient, cache, inviteEmail, useAuth and regionAccess, including untested lines. It does not include all pages, routing or Firebase initialization.

Firebase and network dependencies are mocked. These tests check client behaviour, not Firestore authorization, real transaction concurrency, deployed email delivery or multi-client integration. Run the emulator rules suites and the Dev manual flows separately before release. Existing Dev configuration and email-stub tests are included in the total.
