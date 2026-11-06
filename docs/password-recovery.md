# Password recovery and account settings

## Enable email delivery with Gmail

1. Enable 2-Step Verification on the Google account used to send mail.
2. Create a dedicated App Password at https://myaccount.google.com/apppasswords. This is separate from Google OAuth sign-in and from your normal Gmail password. Some organization/Advanced Protection accounts do not offer App Passwords.
3. In the local `.env`, set `SMTP_USER` to the sender Gmail address, `EMAIL_FROM` to `Vaultkeeper <that-address@gmail.com>`, and `SMTP_PASSWORD` to the generated App Password. Do not paste this secret into chat, browser code, or a `VITE_` variable. Keep it in a secret manager for deployment.
4. Keep `EMAIL_PROVIDER=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`. A unique `OTP_HASH_SECRET` has been generated in the local environment; preserve it securely. Deploy a distinct value for each environment, with at least 32 random characters.
5. From a normal terminal with network access, run:

   ```sh
   npm install
   npm run db:deploy
   npm run db:generate
   npm run server
   ```

   Start the frontend in a second terminal with `npm start`. The migration is idempotent if the identical change was already applied through Neon, so `db:deploy` also records it in Prisma’s migration ledger. Apply the migration before restarting API instances because protected endpoints now read `User.authVersion`.

Gmail is suitable for local development/small deployments, subject to its sending limits. For transactional delivery use `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and an `EMAIL_FROM` address on your verified sending domain. A Gmail address cannot be used as a verified custom Resend sender domain.

## User flows

- **Forgot password:** `/forgot-password` → email → six-digit code → new password. Verification creates a five-minute HttpOnly session restricted to password completion. Full access is issued only after the password is saved.
- **Settings:** open Settings from the vault header. Accounts with a password must supply their current password. Accounts without a password must verify an email OTP first. Google sign-in remains available after a password is added.
- **Google-only password login:** returns `GOOGLE_OAUTH_REQUIRED` and directs the user to Google. Forgot Password can add a password to the existing account without creating a duplicate user.

## Security and operational behavior

- Codes expire after 10 minutes. A PostgreSQL row lock enforces the 60-second per-account resend cooldown and a maximum of 3 failed guesses across all API instances. Resend cannot erase an active lockout. Per-IP route limits provide an additional coarse layer; if deploying behind a proxy, configure the documented trusted proxy hops. IP limiter stores are in-process, so use a shared limiter/gateway for global IP quotas on a multi-instance deployment.
- Codes are stored using keyed SHA-256 (HMAC-SHA-256), bound to their challenge and purpose. Only the hash is used for verification. No raw OTP is logged or persisted. SHA-256 hashes protect high-entropy single-use reset grants, and bcrypt cost 12 protects passwords.
- Pending email payloads are AES-256-GCM encrypted in a durable PostgreSQL outbox. API instances poll every 5 seconds, use atomic row leases, and retry up to 5 times before expiry. Resend idempotency keys reduce duplicate delivery; SMTP delivery is at-least-once and can duplicate an email after a crash. Superseded/verified codes cannot be reused. Monitor generic delivery failure logs and queue age; configure a transactional provider before production rollout.
- Changing a password increments `authVersion`, updates `passwordChangedAt` and Prisma `updatedAt`, consumes every challenge, revokes all old refresh tokens, and creates a new session atomically. Protected routes compare JWT session version with the database, so old access tokens are rejected immediately. Refresh-token replay also revokes existing sessions.
- Unknown-account and eligible-account code requests use the same public response shape and stable opaque request IDs. Email delivery occurs outside the request through the outbox to avoid provider timing differences.
- Plaintext JavaScript strings cannot be reliably zeroized. Code/password references are short-lived; buffers are cleared by the crypto utility. Requests, OTPs, tokens, provider responses, and credentials must never be added to request-body logs.
- Retain old encryption keys while any vault entry or unexpired email-outbox payload uses them. Drain/wait for the 10-minute OTP window before retiring an old key after vault rotation.

## API routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/password/request` | Request recovery code |
| POST | `/api/auth/password/verify` | Verify code, set restricted cookie |
| POST | `/api/auth/password/reset` | Consume cookie, save password, issue session |
| GET | `/api/auth/account` | Authenticated safe account metadata |
| PUT | `/api/auth/password` | Authenticated current-password update |
| POST | `/api/auth/password/settings/request` | Authenticated email verification request |
| POST | `/api/auth/password/settings/verify` | Authenticated verification |
| POST | `/api/auth/password/settings/complete` | Authenticated first-password setup |

Run `npm run check:password`, `npm run check:auth`, `npm run check:google`, `npm run typecheck:server`, and `npm run build` before release. Password service checks isolate storage and mail; real SMTP delivery must be verified separately with a configured sender. The static email preview is `docs/password-otp-preview.html` and contains a sample code only.
