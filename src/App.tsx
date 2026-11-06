import { lazy, Suspense } from "react";
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
import { googleClientId } from "./api/googleConfig";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";
import VaultPage from "./pages/VaultPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";

function SessionLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50" role="status" aria-live="polite">
      <span className="sr-only">Checking your session…</span>
      <span aria-hidden="true" className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
    </main>
  );
}

function HomeRedirect() {
  const { user, accessToken } = useAuth();
  return <Navigate to={user || accessToken ? "/dashboard" : "/login"} replace />;
}

function AppRoutes() {
  const { isLoading } = useAuth();
  if (isLoading) return <SessionLoading />;

  return (
    <Suspense fallback={<SessionLoading />}><Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<VaultPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/vault" element={<VaultPage />} />
      </Route>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes></Suspense>
  );
}

export default function App() {
  const content = (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
  return googleClientId ? <GoogleOAuthProvider clientId={googleClientId}>{content}</GoogleOAuthProvider> : content;
}


