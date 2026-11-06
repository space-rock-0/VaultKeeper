import PasswordInput from "../components/PasswordInput";
import Icon from "../components/BrandIcon";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, type ApiErrorResponse } from "../api/axios";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PasswordGenerator from "../components/PasswordGenerator";

type Interval = "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";
interface VaultEntry {
  id: string;
  siteName: string;
  siteUrl: string | null;
  username: string;
  renewalInterval: Interval;
  expiresAt: string;
  createdAt: string;
}
interface VaultListResponse { entries: VaultEntry[] }
interface VaultEntryResponse { entry: VaultEntry }
interface RevealResponse { password: string }
interface Toast { kind: "success" | "error"; message: string }

const intervalLabels: Record<Interval, string> = {
  WEEKLY: "Every week", MONTHLY: "Every month", YEARLY: "Every year", CUSTOM: "Custom date",
};
const dayMs = 24 * 60 * 60 * 1000;
const futureDate = (days: number) => new Date(Date.now() + days * dayMs).toISOString().slice(0, 10);

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: ApiErrorResponse } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return "We couldn’t complete that request. Check your connection and try again.";
}

function getRenewalState(expiresAt: string) {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return { kind: "expired" as const, label: "Needs renewal", days: 0 };
  const days = Math.ceil(remaining / dayMs);
  if (remaining < 7 * dayMs) return { kind: "soon" as const, label: `Due in ${days} ${days === 1 ? "day" : "days"}`, days };
  return { kind: "active" as const, label: "Active", days };
}

export default function VaultPage() {
  const { user, logout } = useAuth();
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "RENEWAL">("ALL");
  const [toast, setToast] = useState<Toast | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [renewalInterval, setRenewalInterval] = useState<Interval>("MONTHLY");
  const [customDate, setCustomDate] = useState(futureDate(30));
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const concealTimers = useRef(new Map<string, number>());
  const [renewalEdit, setRenewalEdit] = useState<string | null>(null);
  const [editInterval, setEditInterval] = useState<Interval>("MONTHLY");
  const [editDate, setEditDate] = useState(futureDate(30));

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await api.get<VaultListResponse>("/vault");
      setEntries(response.data.entries);
    } catch (error) {
      const message = getErrorMessage(error);
      setLoadError(message);
      setToast({ kind: "error", message });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadEntries(); }, [loadEntries]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => () => concealTimers.current.forEach((timer) => window.clearTimeout(timer)), []);
  useEffect(() => {
    if (!modalOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) closeAddModal();
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href]') ?? []).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [modalOpen, saving]);

  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesQuery = !needle || entry.siteName.toLowerCase().includes(needle) || (entry.siteUrl ?? "").toLowerCase().includes(needle);
      const matchesRenewal = filter !== "RENEWAL" || new Date(entry.expiresAt).getTime() <= Date.now();
      return matchesQuery && matchesRenewal;
    });
  }, [entries, filter, query]);
  const needsRenewal = entries.filter((entry) => new Date(entry.expiresAt).getTime() <= Date.now()).length;

  const closeAddModal = () => {
    setModalOpen(false);
    setNewPassword("");
    setRenewalInterval("MONTHLY");
    setCustomDate(futureDate(30));
  };
  const openAddModal = () => {
    setNewPassword("");
    setRenewalInterval("MONTHLY");
    setCustomDate(futureDate(30));
    setModalOpen(true);
  };

  const concealPassword = (id: string) => {
    const timer = concealTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    concealTimers.current.delete(id);
    setRevealed((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const revealPassword = async (entry: VaultEntry) => {
    if (revealed[entry.id]) { concealPassword(entry.id); return; }
    setRevealing(entry.id);
    try {
      const response = await api.get<RevealResponse>(`/vault/${entry.id}/password`);
      setRevealed((current) => ({ ...current, [entry.id]: response.data.password }));
      const timer = window.setTimeout(() => concealPassword(entry.id), 30_000);
      concealTimers.current.set(entry.id, timer);
    } catch (error) { setToast({ kind: "error", message: getErrorMessage(error) }); }
    finally { setRevealing(null); }
  };

  const copyPassword = async (entry: VaultEntry) => {
    let plaintext = revealed[entry.id] ?? "";
    try {
      if (!plaintext) {
        const response = await api.get<RevealResponse>(`/vault/${entry.id}/password`);
        plaintext = response.data.password;
      }
      await navigator.clipboard.writeText(plaintext);
      setToast({ kind: "success", message: `${entry.siteName} password copied.` });
    } catch {
      setToast({ kind: "error", message: "Could not copy the password. Check clipboard permissions." });
    } finally {
      plaintext = "";
      concealPassword(entry.id);
    }
  };

  const saveRenewal = async (entry: VaultEntry) => {
    setSaving(true);
    try {
      const response = await api.put<VaultEntryResponse>(`/vault/${entry.id}`, {
        renewalInterval: editInterval,
        ...(editInterval === "CUSTOM" ? { expiresAt: new Date(`${editDate}T23:59:59`).toISOString() } : {}),
      });
      setEntries((current) => current.map((item) => item.id === entry.id ? response.data.entry : item));
      setRenewalEdit(null);
      setToast({ kind: "success", message: "Renewal schedule saved." });
    } catch (error) { setToast({ kind: "error", message: getErrorMessage(error) }); }
    finally { setSaving(false); }
  };

  const removeEntry = async (entry: VaultEntry) => {
    if (!window.confirm(`Delete the password saved for ${entry.siteName}?`)) return;
    try {
      await api.delete(`/vault/${entry.id}`);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      concealPassword(entry.id);
      setToast({ kind: "success", message: `${entry.siteName} was deleted.` });
    } catch (error) { setToast({ kind: "error", message: getErrorMessage(error) }); }
  };

  const createEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await api.post<VaultEntryResponse>("/vault", {
        siteName: form.get("siteName"),
        siteUrl: form.get("siteUrl") || undefined,
        username: form.get("username"),
        password: newPassword,
        renewalInterval,
        ...(renewalInterval === "CUSTOM" ? { expiresAt: new Date(`${customDate}T23:59:59`).toISOString() } : {}),
      });
      setEntries((current) => [response.data.entry, ...current]);
      closeAddModal();
      setToast({ kind: "success", message: "Password saved to your vault." });
    } catch (error) { setToast({ kind: "error", message: getErrorMessage(error) }); }
    finally { setSaving(false); }
  };

  return (
    <main className="vault-shell min-h-screen text-slate-900 dark:text-slate-100">
      <div className="vault-container mx-auto px-4 pb-12 sm:px-6 lg:px-8">
        <header className="vault-header flex min-h-[88px] items-center justify-between gap-4 border-b border-slate-200 dark:border-white/10">
          <Link to="/dashboard" className="flex items-center gap-3 text-slate-950 dark:text-white" aria-label="Password Vault home">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-indigo-600 text-white"><Icon name="shield" className="h-5 w-5" /></span>
            <span className="brand-wordmark-text">Vaultkeeper<small>Password manager</small></span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[220px] truncate text-sm text-slate-500 dark:text-slate-400 sm:block">{user?.email}</span>
            <Link to="/settings" className="rounded-full px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50">Settings</Link><button type="button" onClick={() => void logout()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10">Log out</button>
          </div>
        </header>

        {toast && <div role={toast.kind === "error" ? "alert" : "status"} className={`fixed right-5 top-5 z-[70] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${toast.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/30 dark:bg-rose-950 dark:text-rose-100" : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-950 dark:text-emerald-100"}`}>{toast.message}</div>}

        <section className="vault-intro mt-7">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-300">Private password manager</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">Your vault</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-400">Keep the logins you need in one encrypted place.</p></div>
            <button type="button" onClick={openAddModal} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"><Icon name="plus" />Add password</button>
          </div>

          <div className="vault-stats mt-7 grid sm:grid-cols-3" aria-label="Vault statistics">
            <Stat label="Saved logins" value={entries.length} detail="Accounts in your vault" />
            <Stat label="Needs renewal" value={needsRenewal} detail="Expired passwords" />
            <Stat label="Encrypted" value={entries.length} detail="Protected with AES-256-GCM" />
          </div>
        </section>

        <section className="vault-workspace mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_350px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">Saved accounts</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{entries.length} {entries.length === 1 ? "account" : "accounts"}</p></div></div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 flex-1"><span className="sr-only">Search by site name or URL</span><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-white/10 dark:bg-slate-900 dark:placeholder:text-slate-500" /></label>
              <div className="flex rounded-lg border border-slate-300 bg-white p-1 dark:border-white/10 dark:bg-slate-900" role="group" aria-label="Filter saved accounts">
                <FilterButton active={filter === "ALL"} onClick={() => setFilter("ALL")}>All accounts</FilterButton>
                <FilterButton active={filter === "RENEWAL"} onClick={() => setFilter("RENEWAL")}>Needs renewal</FilterButton>
              </div>
            </div>

            {loading ? <div className="mt-4 space-y-2" role="status"><span className="sr-only">Loading accounts</span>{[1, 2, 3].map((item) => <div key={item} className="h-[102px] animate-pulse rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900" />)}</div>
              : loadError ? <div className="mt-4 rounded-xl border border-rose-200 bg-white p-6 dark:border-rose-400/25 dark:bg-slate-900"><p className="text-sm font-medium">Your vault could not be loaded.</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{loadError}</p><button type="button" onClick={() => void loadEntries()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/15 dark:hover:bg-white/5"><Icon name="refresh" />Try again</button></div>
              : visibleEntries.length ? <div className="mt-3 space-y-2">{visibleEntries.map((entry) => <VaultRow key={entry.id} entry={entry} password={revealed[entry.id]} isRevealing={revealing === entry.id} isEditing={renewalEdit === entry.id} editInterval={editInterval} editDate={editDate} saving={saving} onReveal={() => void revealPassword(entry)} onCopy={() => void copyPassword(entry)} onDelete={() => void removeEntry(entry)} onEdit={() => { setRenewalEdit(renewalEdit === entry.id ? null : entry.id); setEditInterval(entry.renewalInterval); setEditDate(futureDate(Math.max(getRenewalState(entry.expiresAt).days || 30, 1))); }} onIntervalChange={setEditInterval} onDateChange={setEditDate} onSave={() => void saveRenewal(entry)} />)}</div>
              : <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-white/15 dark:bg-slate-900"><div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-200"><Icon name="shield" className="h-5 w-5" /></div><h3 className="mt-4 text-sm font-semibold">{entries.length ? "No matching accounts" : "Your vault is empty"}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{entries.length ? "Try a different search or filter." : "Add an account to keep its login details here."}</p>{!entries.length && <button type="button" onClick={openAddModal} className="mt-4 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Add your first password</button>}</div>}
          </div>

          <aside className="lg:sticky lg:top-5"><PasswordGenerator /></aside>
        </section>
      </div>

      {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeAddModal(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="add-vault-title" className="my-auto max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900 sm:p-6">
          <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-700 dark:text-indigo-300">New login</p><h2 id="add-vault-title" className="mt-1 text-xl font-semibold tracking-tight">Add to your vault</h2></div><button type="button" onClick={closeAddModal} disabled={saving} aria-label="Close dialog" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-white/10"><Icon name="close" /></button></div>
          <form onSubmit={(event) => void createEntry(event)} className="mt-5 space-y-4">
            <label className="block text-sm font-medium">Site name<input autoFocus required name="siteName" maxLength={100} placeholder="GitHub" className="form-control" /></label>
            <label className="block text-sm font-medium">Site URL <span className="font-normal text-slate-400">(optional)</span><input name="siteUrl" type="url" placeholder="https://example.com" className="form-control" /></label>
            <label className="block text-sm font-medium">Username or email<input required name="username" maxLength={254} autoComplete="username" placeholder="you@example.com" className="form-control" /></label>
            <div><label htmlFor="vault-new-password" className="block text-sm font-medium">Password</label><PasswordInput id="vault-new-password" required name="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="Enter or generate a password" className="form-control"/><details className="mt-3 rounded-lg border border-slate-200 dark:border-white/10"><summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-indigo-700 dark:text-indigo-300">Generate a password</summary><div className="p-2 pt-0"><PasswordGenerator compact onUsePassword={setNewPassword} /></div></details></div>
            <label className="block text-sm font-medium">Renewal schedule<select name="renewalInterval" value={renewalInterval} onChange={(event) => setRenewalInterval(event.target.value as Interval)} className="form-control"><option value="WEEKLY">Every week</option><option value="MONTHLY">Every month</option><option value="YEARLY">Every year</option><option value="CUSTOM">Choose a date</option></select></label>
            {renewalInterval === "CUSTOM" && <label className="block text-sm font-medium">Expires on<input type="date" required min={futureDate(1)} value={customDate} onChange={(event) => setCustomDate(event.target.value)} className="form-control" /></label>}
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10"><button type="button" disabled={saving} onClick={closeAddModal} className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5">Cancel</button><button type="submit" disabled={saving || !newPassword} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save password"}</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}

function Stat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-900"><div className="flex items-baseline justify-between gap-3"><p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p><p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-950 dark:text-white">{value}</p></div><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{detail}</p></div>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${active ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-200" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"}`}>{children}</button>;
}

function VaultRow({
  entry, password, isRevealing, isEditing, editInterval, editDate, saving, onReveal, onCopy, onDelete, onEdit, onIntervalChange, onDateChange, onSave,
}: {
  entry: VaultEntry; password?: string; isRevealing: boolean; isEditing: boolean; editInterval: Interval; editDate: string; saving: boolean;
  onReveal: () => void; onCopy: () => void; onDelete: () => void; onEdit: () => void; onIntervalChange: (value: Interval) => void; onDateChange: (value: string) => void; onSave: () => void;
}) {
  const status = getRenewalState(entry.expiresAt);
  const badgeClass = status.kind === "active" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300" : status.kind === "soon" ? "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300" : "bg-rose-50 text-rose-800 dark:bg-rose-400/10 dark:text-rose-300";
  return <article className="vault-row rounded-xl border border-slate-200 bg-white px-4 py-4 transition-colors hover:border-slate-300 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20 sm:px-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><div aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-indigo-100 text-sm font-semibold text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-200">{entry.siteName.trim().slice(0, 1).toUpperCase()}</div><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-950 dark:text-white">{entry.siteName}</h3><p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{entry.username}</p>{entry.siteUrl && <a href={entry.siteUrl} target="_blank" rel="noreferrer" className="mt-1 block max-w-[260px] truncate text-xs text-indigo-700 hover:underline dark:text-indigo-300">{entry.siteUrl}</a>}</div></div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass}`}>{status.label}</span>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-white/10">
      <div className="flex min-w-0 items-center gap-1.5"><code className="max-w-[250px] truncate rounded-md bg-slate-50 px-2.5 py-1.5 font-mono text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-200">{password ?? "••••••••••••"}</code><button type="button" onClick={onReveal} disabled={isRevealing} aria-label={password ? `Hide ${entry.siteName} password` : `Show ${entry.siteName} password`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"><Icon name={password ? "eyeOff" : "eye"} /></button>{isRevealing && <span className="text-xs text-slate-500" role="status">Loading</span>}</div>
      <div className="flex items-center gap-1"><ActionButton label="Copy password" onClick={onCopy}><Icon name="copy" /></ActionButton><ActionButton label={`${isEditing ? "Close" : "Edit"} renewal schedule`} onClick={onEdit}><Icon name="refresh" /></ActionButton><ActionButton label={`Delete ${entry.siteName}`} tone="danger" onClick={onDelete}><Icon name="trash" /></ActionButton></div>
    </div>
    {isEditing && <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60"><label className="min-w-[150px] flex-1 text-xs font-medium text-slate-600 dark:text-slate-300">Renewal schedule<select value={editInterval} onChange={(event) => onIntervalChange(event.target.value as Interval)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-white/10 dark:bg-slate-900"><option value="WEEKLY">Every week</option><option value="MONTHLY">Every month</option><option value="YEARLY">Every year</option><option value="CUSTOM">Custom date</option></select></label>{editInterval === "CUSTOM" && <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Expires on<input type="date" min={futureDate(1)} value={editDate} onChange={(event) => onDateChange(event.target.value)} className="mt-1 block rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-white/10 dark:bg-slate-900" /></label>}<button type="button" disabled={saving || (editInterval === "CUSTOM" && !editDate)} onClick={onSave} className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save schedule"}</button></div>}
    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{intervalLabels[entry.renewalInterval]} · Expires {new Date(entry.expiresAt).toLocaleDateString()}</p>
  </article>;
}

function ActionButton({ label, tone = "default", onClick, children }: { label: string; tone?: "default" | "danger"; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={`rounded-md p-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${tone === "danger" ? "text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-rose-400/10 dark:hover:text-rose-300" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"}`}>{children}</button>;
}






