# Player live hook tests

Run `npm run test:coverage`. The 16 cases in `liveHooks.test.jsx` run real React hooks against mocked RTDB subscriptions and writes, with fake timers. Both usePaperLiveGame and usePulseSession measure 100% lines, branches and functions, protected by per-file floors.

Paper coverage: exact subscription path, first snapshot/loading, ten-second fallback, late data, timestamps/team mapping, error count/reconnection, null snapshots, ID changes, and listener/timer cleanup.

Pulse coverage: both IDs required, snapshots/deletions/errors, numeric submissions to the active team/session, rejected writes, team changes, leaving a team, session changes and listener cleanup.

Two explicit expected-failure regressions expose stale state when changing IDs: Paper retains the previous game's liveState/teamId; Pulse retains the previous sessionData until another snapshot arrives. These are not skipped tests or claims that the hooks are safe across transitions. Clear old state on ID changes, then convert the cases to normal tests when that work is authorized. Runtime behaviour was not modified.

No Firebase project or network is used. These tests do not verify deployed RTDB authorization, numeric-input validity, late callbacks after unsubscribe, or real concurrent clients. Full suite reports include the expected-failure cases.
