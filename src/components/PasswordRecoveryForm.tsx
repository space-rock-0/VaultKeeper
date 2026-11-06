import axios from "axios";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api/axios";
import { passwordEndpoints, passwordError, validatePassword, type PasswordFlow, type CodeRequestResponse, type CodeVerifyResponse, type PasswordSessionResponse } from "../api/password";
import PasswordInput from "./PasswordInput";

interface Props { flow: PasswordFlow; email?: string; onComplete: (session: PasswordSessionResponse) => void }

/** Recovery grants stay in HttpOnly cookies; only workflow UI state lives here. */
export default function PasswordRecoveryForm({ flow, email: initialEmail = "", onComplete }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [stage, setStage] = useState<"request" | "verify" | "password">("request");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [resendAt, setResendAt] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [grantExpiresAt, setGrantExpiresAt] = useState(0);
  const [failures, setFailures] = useState(0);
  const [now, setNow] = useState(Date.now());
  const endpoints = passwordEndpoints(flow);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(timer); }, []);
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const codeExpired = expiresAt > 0 && now >= expiresAt;
  const grantExpired = grantExpiresAt > 0 && now >= grantExpiresAt;

  async function requestCode() {
    if (lock.current || remaining > 0) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const { data } = await api.post<CodeRequestResponse>(endpoints.request, flow === "recovery" ? { email: email.trim() } : {});
      setChallengeId(data.challengeId); setStage("verify"); setOtp(""); setFailures(0);
      setResendAt(Date.now() + data.resendAfter * 1000);
      setExpiresAt(Date.now() + data.expiresIn * 1000);
      setNotice(data.message);
    } catch (failure) { setError(passwordError(failure)); }
    finally { lock.current = false; setBusy(false); }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!/^\d{6}$/.test(otp)) { setError("Enter the six-digit code from your email."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const { data } = await api.post<CodeVerifyResponse>(endpoints.verify, { challengeId, otp });
      setGrantExpiresAt(Date.now() + data.expiresIn * 1000);
      setOtp(""); setStage("password"); setNotice("Email verified. Set your new password within five minutes.");
    } catch (failure) {
      setError(passwordError(failure));
      // The server owns the attempt count. This local count also prevents accidental repeated submissions.
      if (axios.isAxiosError<{ code?: string }>(failure) && failure.response?.data.code === "INVALID_OTP") {
        const next = failures + 1; setFailures(next);
        if (next >= 3) setResendAt(expiresAt);
      }
    } finally { lock.current = false; setBusy(false); }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    const validation = validatePassword(password, confirm);
    if (validation) { setError(validation); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const { data } = await api.post<PasswordSessionResponse>(endpoints.complete, { newPassword: password });
      setPassword(""); setConfirm(""); onComplete(data);
    } catch (failure) { setError(passwordError(failure)); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className="space-y-5">
    <ol aria-label="Password recovery progress" className="flex gap-3 text-xs text-slate-500"><li className={stage === "request" ? "font-semibold text-indigo-600" : ""}>1. Email</li><li className={stage === "verify" ? "font-semibold text-indigo-600" : ""}>2. Verify</li><li className={stage === "password" ? "font-semibold text-indigo-600" : ""}>3. Password</li></ol>
    {error && <p role="alert" id="password-action-error" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="text-sm leading-6 text-slate-600 dark:text-slate-300">{notice}</p>}
    {stage === "request" && <form onSubmit={(event) => { event.preventDefault(); void requestCode(); }} className="space-y-5"><label className="block text-sm font-medium">Email<input className="form-control" type="email" required autoComplete="email" maxLength={254} value={email} disabled={busy || flow === "settings"} onChange={(event) => setEmail(event.target.value)} /></label><button type="submit" disabled={busy} className="w-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "Sending..." : "Send verification code"}</button></form>}
    {stage === "verify" && <form onSubmit={(event) => void verifyCode(event)} className="space-y-4"><label className="block text-sm font-medium">Verification code<input className="form-control text-center font-mono text-2xl tracking-[.45em]" type="text" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required maxLength={6} value={otp} disabled={busy || failures >= 3 || codeExpired} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} aria-describedby="otp-help" /></label><p id="otp-help" className="text-xs text-slate-500">Expires in 10 minutes. Maximum 3 failed attempts.</p>{codeExpired && <p className="text-sm text-amber-700">This code has expired. Request a new one.</p>}<button type="submit" disabled={busy || failures >= 3 || codeExpired || otp.length !== 6} className="w-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Verifying..." : "Verify code"}</button><button type="button" disabled={busy || remaining > 0} onClick={() => void requestCode()} className="w-full border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{remaining > 0 ? `Resend available in ${remaining}s` : "Resend code"}</button></form>}
    {stage === "password" && <form onSubmit={(event) => void savePassword(event)} className="space-y-4">{grantExpired && <p role="alert" className="text-sm text-amber-700">Verification expired. Please verify your email again.</p>}<label className="block text-sm font-medium">New password<PasswordInput required autoComplete="new-password" minLength={12} value={password} disabled={busy || grantExpired} onChange={(event) => setPassword(event.target.value)} /></label><label className="block text-sm font-medium">Confirm new password<PasswordInput required autoComplete="new-password" value={confirm} disabled={busy || grantExpired} onChange={(event) => setConfirm(event.target.value)} /></label><p className="text-xs text-slate-500">At least 12 characters. Your other sessions will be signed out.</p><button type="submit" disabled={busy || grantExpired} className="w-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save password"}</button>{grantExpired && <button type="button" onClick={() => { setStage("request"); setPassword(""); setConfirm(""); setNotice(""); }} className="w-full border border-slate-300 px-4 py-2 text-sm">Verify email again</button>}</form>}
  </div>;
}
