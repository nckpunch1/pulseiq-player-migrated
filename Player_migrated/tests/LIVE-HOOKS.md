# Player live hook tests

Run `npm run test:coverage`. The 16 cases in `liveHooks.test.jsx` run real React hooks against mocked RTDB subscriptions and writes, with fake timers. Both usePaperLiveGame and usePulseSession measure 100% lines, branches and functions, protected by per-file floors.

Paper coverage: exact subscription path, first snapshot/loading, ten-second fallback, late data, timestamps/team mapping, error count/reconnection, null snapshots, ID changes, and listener/timer cleanup.

Pulse coverage: both IDs required, snapshots/deletions/errors, numeric submissions to the active team/session, rejected writes, team changes, leaving a team, session changes and listener cleanup.

Fixed: Pulse snapshots are tied to each subscription, so switching sessions or revisiting a session starts with null data. Late callbacks from an unsubscribed listener cannot overwrite the active snapshot. Normal regressions cover these transitions and the current submission path.

Fixed: Paper also scopes snapshots, timestamps, failure counts and timeout state to each subscription. A new game starts empty with a fresh ten-second loading fallback. Removing the game ID clears state and stops loading. Retired callbacks are ignored, while errors within the same game retain its last good snapshot. All hook gap regressions are now normal passing tests.

No Firebase project or network is used. These tests do not verify deployed RTDB authorization, numeric-input validity, real concurrent clients. Full suite reports include the expected-failure cases.
