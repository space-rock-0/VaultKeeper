import { Navigate, Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { isLoading, user, accessToken } = useAuth();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50" role="status" aria-live="polite">
        <span className="sr-only">Checking your session…</span>
        <span aria-hidden="true" className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </main>
    );
  }

  if (!user && !accessToken) return <Navigate to="/login" replace />;
  return children ? <>{children}</> : <Outlet />;
}

