import Icon from "./BrandIcon";
import { useEffect, useId, useMemo, useState } from "react";
import { api } from "../api/axios";

interface GeneratorResponse { password: string }
interface PasswordGeneratorProps { onUsePassword?: (password: string) => void; compact?: boolean }
type CharacterOption = "includeUppercase" | "includeLowercase" | "includeNumbers" | "includeSymbols";
const optionSets: { key: CharacterOption; label: string; chars: number }[] = [
  { key: "includeUppercase", label: "Uppercase", chars: 26 },
  { key: "includeLowercase", label: "Lowercase", chars: 26 },
  { key: "includeNumbers", label: "Numbers", chars: 10 },
  { key: "includeSymbols", label: "Symbols", chars: 24 },
];

export default function PasswordGenerator({ onUsePassword, compact = false }: PasswordGeneratorProps) {
  const id = useId();
  const [length, setLength] = useState(20);
  const [options, setOptions] = useState<Record<CharacterOption, boolean>>({
    includeUppercase: true, includeLowercase: true, includeNumbers: true, includeSymbols: true,
  });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const enabled = optionSets.filter(({ key }) => options[key]);

  useEffect(() => {
    if (!password) return;
    const timer = window.setTimeout(() => setPassword(""), 60_000);
    return () => window.clearTimeout(timer);
  }, [password]);

  const strength = useMemo(() => {
    if (!enabled.length) return { label: "Select a character set", width: "0%", color: "bg-slate-300" };
    const entropy = length * Math.log2(enabled.reduce((sum, item) => sum + item.chars, 0));
    if (entropy < 60) return { label: "Weak", width: "25%", color: "bg-rose-500" };
    if (entropy < 90) return { label: "Moderate", width: "50%", color: "bg-amber-500" };
    if (entropy < 120) return { label: "Strong", width: "75%", color: "bg-emerald-500" };
    return { label: "Cryptographic grade", width: "100%", color: "bg-cyan-500" };
  }, [enabled, length]);

  const resetOutput = () => { setPassword(""); setFeedback(""); };
  const generate = async () => {
    if (!enabled.length) return;
    setBusy(true); setFeedback("");
    try {
      const params = new URLSearchParams({ length: String(length) });
      optionSets.forEach(({ key }) => params.set(key, String(options[key])));
      const response = await api.get<GeneratorResponse>(`/vault/generate-password?${params.toString()}`);
      setPassword(response.data.password);
      setFeedback("Ready to copy or use.");
    } catch {
      setFeedback("Could not generate a password. Try again.");
    } finally { setBusy(false); }
  };
  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setPassword("");
      setFeedback("Copied. The generated password was cleared from this panel.");
    } catch { setFeedback("Clipboard access was blocked by your browser."); }
  };

  return (
    <section className={`generator-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 ${compact ? "" : "sm:p-6"}`} aria-labelledby={`${id}-title`}>
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">Tools</p><h2 id={`${id}-title`} className="mt-1 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Password generator</h2></div>
        <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-200"><Icon name="shield" /></span>
      </div>
      <div className="mt-4 flex min-h-[58px] items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-950">
        <code className="min-w-0 break-all font-mono text-sm leading-6 text-slate-800 dark:text-slate-100" aria-live="polite">{password || "Generate a password to see it here"}</code>
        {onUsePassword && password && <button type="button" onClick={() => onUsePassword(password)} className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-indigo-200 dark:hover:bg-indigo-400/10">Use</button>}
      </div>
      <div className="mt-4 flex items-center justify-between text-sm"><label htmlFor={`${id}-length`} className="font-medium text-slate-700 dark:text-slate-300">Length</label><span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">{length}</span></div>
      <input id={`${id}-length`} aria-label="Generated password length" type="range" min={12} max={64} value={length} onChange={(event) => { setLength(Number(event.target.value)); resetOutput(); }} className="mt-2 h-2 w-full cursor-pointer accent-indigo-600" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        {optionSets.map(({ key, label }) => <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:border-indigo-300 dark:border-white/10 dark:text-slate-300 dark:hover:border-indigo-400/60"><input type="checkbox" checked={options[key]} onChange={(event) => { setOptions((current) => ({ ...current, [key]: event.target.checked })); resetOutput(); }} className="h-4 w-4 rounded accent-indigo-600" />{label}</label>)}
      </div>
      <div className="mt-4" aria-live="polite"><div className="flex justify-between text-xs"><span className="text-slate-500 dark:text-slate-400">Estimated strength</span><span className="font-medium text-slate-700 dark:text-slate-200">{strength.label}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className={`h-full rounded-full transition-[width] duration-300 ${strength.color}`} style={{ width: strength.width }} /></div></div>
      <div className="mt-5 grid grid-cols-[1fr_auto] gap-2"><button type="button" disabled={busy || !enabled.length} onClick={() => void generate()} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Generating…" : "Generate password"}</button><button type="button" disabled={busy || !password} onClick={() => void copy()} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5" aria-label="Copy generated password"><Icon name="copy" /></button></div>
      {feedback && <p role="status" className="mt-3 text-xs text-slate-500 dark:text-slate-400">{feedback}</p>}
    </section>
  );
}


