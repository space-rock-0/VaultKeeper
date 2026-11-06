import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/axios";
import { useAuth } from "../context/AuthContext";

interface CurrentUser {
  userId: string;
  email: string;
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get<{ user: CurrentUser }>("/me")
      .then(({ data }) => {
        if (active) setProfile(data.user);
      })
      .catch(() => {
        if (active) setError("Could not load your account details. Please try again.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const displayedUser = profile ?? user;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Account</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          </div>
          <button type="button" onClick={() => void logout()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-indigo-100">Logout</button>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-200/50 ring-1 ring-slate-200" aria-labelledby="profile-heading">
          <h2 id="profile-heading" className="text-lg font-semibold text-slate-900">Your profile</h2>
          {isLoading ? (
            <div className="mt-5 flex items-center gap-3 text-sm text-slate-600" role="status">
              <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
              Loading account details…
            </div>
          ) : error ? (
            <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>
          ) : displayedUser ? (
            <dl className="mt-5 divide-y divide-slate-100">
              <div className="grid gap-1 py-3 sm:grid-cols-3">
                <dt className="text-sm font-medium text-slate-500">User ID</dt>
                <dd className="break-all text-sm text-slate-900 sm:col-span-2">{displayedUser.userId}</dd>
              </div>
              <div className="grid gap-1 py-3 sm:grid-cols-3">
                <dt className="text-sm font-medium text-slate-500">Email</dt>
                <dd className="break-all text-sm text-slate-900 sm:col-span-2">{displayedUser.email}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-slate-600">No account details are available.</p>
          )}
        </section>
      </div>
    </main>
  );
}
