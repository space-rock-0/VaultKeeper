import type { ReactNode } from "react";
export type IconName = "shield" | "search" | "eye" | "eyeOff" | "copy" | "trash" | "plus" | "refresh" | "close";
// Existing application vector assets, shared by all branded surfaces.
export default function BrandIcon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    shield: <><path d="M12 3 19 6v5c0 4.4-2.9 8.1-7 10-4.1-1.9-7-5.6-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4 4"/></>,
    eye: <><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.4"/></>,
    eyeOff: <><path d="m3 3 18 18M10.6 6.2A10 10 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15 15 0 0 1-3.2 3.7M6.2 6.8C3.8 8.4 2.5 12 2.5 12s3.4 6 9.5 6a9 9 0 0 0 2-.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{paths[name]}</svg>;
}
