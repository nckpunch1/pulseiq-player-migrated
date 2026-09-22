# Player against the AdminHost DEV project

From `player/Player_migrated`, run:

```sh
npm run dev:testing
```

This serves Player at `http://127.0.0.1:5174`. It reads the sibling AdminHost development Firebase environment through Vite (`../../admin-host`, including `.env.local`) and requires project `pulseiq-dev-70d82`. It overrides all seven Firebase settings so Player's production `.env.local` cannot supply missing values. Missing required settings or the wrong project/auth domain stop startup. No credentials or environment values are copied into Git.

For a DEV build use `npm run build:testing`; output goes to ignored `dist-dev/`. Ordinary `npm run dev` and `npm run build` retain the existing Player environment. **Use the explicit testing command for DEV.** The existing production environment file is untouched.

## Email behaviour

When the Firebase project is `pulseiq-dev-70d82`, Player's invitation sender returns a local simulated response without obtaining an ID token or calling the production email endpoint. The Team page says `DEV: invitation simulated. No email was sent.` Existing-account invitations still create DEV team membership normally.

AdminHost also stubs its current `/api/send-invite` and `/api/send-notification` calls through `authedFetch` when configured for that DEV project. Its notification result displays that no email was sent. These are browser-side test stubs, not deployed server endpoints or a server-side email policy. Production requests retain their authenticated behaviour.

Firebase Authentication verification and password-reset messages are separate SDK paths and are **not stubbed**. Use existing DEV test accounts for membership tests; only use controlled inboxes for signup/reset/verification. Stubbing invitation/notification endpoints does not test email delivery, template rendering or server authorization.

The shared Pulse app/secondary connection is unchanged. No Firestore rules are deployed by starting either local app. Follow AdminHost's `docs/team-writes-dev-verification.md` for rules snapshot, deployment and real-app checks.
