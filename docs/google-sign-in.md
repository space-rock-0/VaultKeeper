# Google sign-in setup

1. In Google Cloud Console, create or select a project. Configure Google Auth Platform branding, audience, and test users while the app is in testing.
2. Create an OAuth client of type **Web application**. Set the Authorized JavaScript origin to `http://localhost:5173` (or the actual frontend origin shown by Vite). Add your production HTTPS frontend origin when deploying. This implementation uses a popup credential callback; it does not need a backend redirect URI or client secret.
3. Copy the public client ID into both variables in `.env`:

   ```dotenv
   GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
   VITE_GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
   ```

4. From a normal terminal with network access, install dependencies and update the database/client:

   ```sh
   npm install
   npm run db:deploy
   npm run db:generate
   ```

5. Restart the API (`npm run server`) and frontend (`npm start`) in separate terminals. Vite reads its environment values at startup.

The client sends `{ credential }` to `POST /api/auth/google`. The API verifies the ID token using Google's library, including signature, expiry, issuer, audience, and verified email. Users are identified by Google's immutable subject (`googleId`). It issues the same in-memory access token and HttpOnly refresh cookie as password login.

Existing password accounts are not automatically linked by matching email. Users with those accounts should continue signing in with their password. Linking Google to a password account requires a separate authenticated account-linking feature.

Google credentials and access tokens are never saved in browser storage. Do not place any client secret in a `VITE_` variable. Until the public client ID is configured, password login remains available and Google login is disabled.
