// Only public Web client IDs belong in browser configuration. Never accept a client secret.
const configuredId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
export const googleClientId = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(configuredId)
  ? configuredId
  : null;
