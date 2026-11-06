import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import PasswordRecoveryForm from "../components/PasswordRecoveryForm";
import PasswordInput from "../components/PasswordInput";
import GoogleSignInButton from "../components/GoogleSignInButton";
import { api } from "../api/axios";
import { getAccount, passwordError, validatePassword, type PasswordSessionResponse } from "../api/password";
import { useAuth, type AuthUser } from "../context/AuthContext";

export default function SettingsPage() {
  const { acceptSession } = useAuth();
  const [account, setAccount] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");
  const lock = useRef(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    void getAccount().then((user) => { if (active) setAccount(user); }).catch((failure) => { if (active) setError(passwordError(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  function applySession(session: PasswordSessionResponse) {
    acceptSession(session.accessToken, session.user); setAccount(session.user);
    setCurrentPassword(""); setNewPassword(""); setConfirm(""); setMessage(session.message); setError("");
  }
  async function update(event: FormEvent) {
    event.preventDefault(); if (lock.current) return;
    const validation = validatePassword(newPassword, confirm);
    if (validation) { setError(validation); return; }
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try { applySession((await api.put<PasswordSessionResponse>("/auth/password", { currentPassword, newPassword })).data); }
    catch (failure) { setError(passwordError(failure)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function linkGoogle(credential: string) {
    setLinking(true); setLinkError(""); setMessage("");
    try {
      const response = await api.post<{ message: string; user: AuthUser }>("/auth/google/link", { credential });
      setAccount(response.data.user); setMessage(response.data.message);
    } catch (failure) { setLinkError(passwordError(failure)); }
    finally { setLinking(false); }
  }
  return <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950 dark:text-slate-100"><section className="mx-auto max-w-xl"><Link to="/dashboard" className="text-sm font-medium text-indigo-600 hover:underline">Back to vault</Link><h1 className="mt-6 text-3xl font-semibold tracking-tight">Account security</h1><p className="mt-2 text-sm text-slate-500">Manage how you sign in to Vaultkeeper.</p><div className="mt-7 rounded-xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
    {loading ? <p role="status" className="animate-pulse text-sm text-slate-500">Loading account security...</p> : !account ? <div><p role="alert" className="text-sm text-rose-700">{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-4 border border-slate-300 px-4 py-2 text-sm">Try again</button></div> : <>
      <p className="text-sm font-medium">{account.email}</p><p className="mt-1 text-xs text-slate-500">{account.googleLinked ? "Google account connected" : "Email and password account"}</p>
      <h2 className="mb-5 mt-7 text-lg font-semibold">{account.hasPassword ? "Update password" : "Set a password"}</h2>
      {message && <p role="status" className="mb-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {account.hasPassword ? <form onSubmit={(event) => void update(event)} className="space-y-5">{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<label className="block text-sm font-medium">Current password<PasswordInput required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={busy} /></label><label className="block text-sm font-medium">New password<PasswordInput required minLength={12} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={busy} /></label><label className="block text-sm font-medium">Confirm new password<PasswordInput required autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={busy} /></label><p className="text-xs leading-5 text-slate-500">Use at least 12 characters. Changing your password signs out all other sessions.</p><button type="submit" disabled={busy} className="w-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "Updating..." : "Update password"}</button></form> : <><p className="mb-5 text-sm leading-6 text-slate-600 dark:text-slate-300">Verify your email before adding a password. You can continue using Google after setting one.</p><PasswordRecoveryForm flow="settings" email={account.email} onComplete={applySession} /></>}
      {account.passwordChangedAt && <p className="mt-6 text-xs text-slate-500">Password last updated: {new Date(account.passwordChangedAt).toLocaleString()}</p>}
      {account.hasPassword && !account.googleLinked && <section className="mt-8 border-t border-slate-200 pt-6 dark:border-white/10"><h2 className="text-lg font-semibold">Connect Google</h2><p className="my-3 text-sm text-slate-600 dark:text-slate-300">Connect the Google account with the same email address to use it for future sign-ins.</p>{linkError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{linkError}</p>}<GoogleSignInButton disabled={linking} loading={linking} onCredential={linkGoogle} onError={setLinkError} /></section>}
    </>}
  </div></section></main>;
}
