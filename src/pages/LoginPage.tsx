import GoogleSignInButton from "../components/GoogleSignInButton";
import PasswordInput from "../components/PasswordInput";
import AuthLayout from "../components/AuthLayout";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type FormEvent } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

interface ApiErrorBody {
  code?: string;
  message?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const submitLock = useRef(false);
  const busy = isSubmitting || googleSubmitting;
  const [retryAfter, setRetryAfter] = useState(0);
  const [isRegistered] = useState(() => new URLSearchParams(window.location.search).get("registered") === "1");

  const isWaitingForRateLimit = retryAfter > 0;

  useEffect(() => {
    if (!isWaitingForRateLimit) return;
    const timer = window.setInterval(() => {
      setRetryAfter((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isWaitingForRateLimit]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    setErrorMessage("");
    const nextEmailError = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "" : "Enter a valid email address.";
    const nextPasswordError = password ? "" : "Enter your password.";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;

    submitLock.current = true;
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      if (axios.isAxiosError<ApiErrorBody>(error)) {
        if (error.response?.status === 401) {
          setErrorMessage(error.response.data?.code === "GOOGLE_OAUTH_REQUIRED" ? "This account was created via Google OAuth. Please log in using Google." : "Invalid email or password.");
        } else if (error.response?.status === 429) {
          setErrorMessage(error.response.data?.message ?? "Too many login attempts. Please try again later.");
          const resetSeconds = Number(error.response.headers["ratelimit-reset"]);
          if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
            setRetryAfter(Math.ceil(resetSeconds));
          }
        } else {
          setErrorMessage(error.response?.data?.message ?? "Unable to sign in. Please try again.");
        }
      } else {
        setErrorMessage("Unable to sign in. Please try again.");
      }
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleGoogleCredential(credential: string) {
    if (submitLock.current) return;
    submitLock.current = true;
    setGoogleSubmitting(true);
    setErrorMessage("");
    try {
      await loginWithGoogle(credential);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setErrorMessage(axios.isAxiosError<ApiErrorBody>(error)
        ? error.response?.data?.message ?? "Google sign-in failed. Please try again."
        : "Google sign-in failed. Please try again.");
    } finally {
      submitLock.current = false;
      setGoogleSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <section className="auth-card">
        <div className="mb-8 text-left">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Welcome back</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Sign in to your account</h1>
          <p className="mt-2 text-sm text-slate-600">Use your email and password to continue.</p>
        </div>

        {isRegistered && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">Account created successfully. You can now sign in.</div>}
        {errorMessage && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{errorMessage}</div>}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input disabled={busy} id="login-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "login-email-error" : undefined} className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" placeholder="you@example.com" />
            {emailError && <p id="login-email-error" className="mt-1.5 text-sm text-red-600">{emailError}</p>}
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
            <PasswordInput disabled={busy} id="login-password" name="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(passwordError)} aria-describedby={passwordError ? "login-password-error" : undefined} className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" placeholder="Your password" />
            {passwordError && <p id="login-password-error" className="mt-1.5 text-sm text-red-600">{passwordError}</p>}
            <Link to="/forgot-password" className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline">Forgot password?</Link>
          </div>
          <button type="submit" disabled={busy || retryAfter > 0} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-70">
            {isSubmitting && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {isSubmitting ? "Signing in…" : retryAfter > 0 ? `Try again in ${retryAfter}s` : "Sign in"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-slate-200"/><span className="text-xs text-slate-500">or</span><span className="h-px flex-1 bg-slate-200"/></div>
        <GoogleSignInButton disabled={busy} loading={googleSubmitting} onCredential={handleGoogleCredential} onError={setErrorMessage} />

        <p className="mt-6 text-center text-sm text-slate-600">Don’t have an account? <Link to="/signup" className="font-semibold text-indigo-600 hover:text-indigo-500">Create one</Link></p>
      </section>
    </AuthLayout>
  );
}



