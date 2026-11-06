import PasswordInput from "../components/PasswordInput";
import AuthLayout from "../components/AuthLayout";
import { Link, useNavigate } from "react-router-dom";
import { useState, type FormEvent } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

interface ApiErrorBody {
  message?: string;
}

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    const nextEmailError = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "" : "Enter a valid email address.";
    const nextPasswordError = password.length >= 8 ? "" : "Password must be at least 8 characters.";
    const nextConfirmError = confirmPassword === password ? "" : "Passwords do not match.";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    if (nextEmailError || nextPasswordError || nextConfirmError) return;

    setIsSubmitting(true);
    try {
      await signup(email.trim(), password);
      navigate("/login?registered=1", { replace: true });
    } catch (error) {
      if (axios.isAxiosError<ApiErrorBody>(error)) {
        setErrorMessage(error.response?.data?.message ?? "Unable to create your account. Please try again.");
      } else {
        setErrorMessage("Unable to create your account. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <section className="auth-card">
        <div className="mb-8 text-left">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Get started</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Create your account</h1>
          <p className="mt-2 text-sm text-slate-600">Sign up with your email address.</p>
        </div>

        {errorMessage && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{errorMessage}</div>}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input id="signup-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "signup-email-error" : undefined} className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" placeholder="you@example.com" />
            {emailError && <p id="signup-email-error" className="mt-1.5 text-sm text-red-600">{emailError}</p>}
          </div>
          <div>
            <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
            <PasswordInput id="signup-password" name="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(passwordError)} aria-describedby={passwordError ? "signup-password-error" : undefined} className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" placeholder="At least 8 characters" />
            {passwordError && <p id="signup-password-error" className="mt-1.5 text-sm text-red-600">{passwordError}</p>}
          </div>
          <div>
            <label htmlFor="signup-confirm-password" className="mb-1.5 block text-sm font-medium text-slate-700">Confirm password</label>
            <PasswordInput id="signup-confirm-password" name="confirmPassword" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-invalid={Boolean(confirmError)} aria-describedby={confirmError ? "signup-confirm-error" : undefined} className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" placeholder="Re-enter your password" />
            {confirmError && <p id="signup-confirm-error" className="mt-1.5 text-sm text-red-600">{confirmError}</p>}
          </div>
          <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-70">
            {isSubmitting && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">Already have an account? <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">Sign in</Link></p>
      </section>
    </AuthLayout>
  );
}

