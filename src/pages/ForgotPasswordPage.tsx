import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import PasswordRecoveryForm from "../components/PasswordRecoveryForm";
import { useAuth } from "../context/AuthContext";

export default function ForgotPasswordPage() {
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  return <AuthLayout><section className="auth-card"><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Account recovery</p><h1 className="mt-3 text-3xl font-semibold">Forgot your password?</h1><p className="mb-7 mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Verify your email to reset your password, or add a password to your Google account.</p><PasswordRecoveryForm flow="recovery" onComplete={(session) => { acceptSession(session.accessToken, session.user); navigate("/dashboard", { replace: true }); }} /><Link to="/login" className="mt-7 inline-block text-sm font-medium text-indigo-600 hover:underline">Back to sign in</Link></section></AuthLayout>;
}
