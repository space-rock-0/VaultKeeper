import type { ReactNode } from "react";
import Icon from "./BrandIcon";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="auth-layout">
    <aside className="auth-brand">
      <div className="brand-wordmark"><span className="brand-mark"><Icon name="shield" /></span>Vaultkeeper<span className="brand-product">Password manager</span></div>
      <div className="auth-brand-content">
        <span className="brand-eyebrow">A little less to remember.</span>
        <h2>Your digital life.<br/>Safely in hand.</h2>
        <p>One place for your accounts, strong passwords, and the next time they need a refresh.</p>
        <div className="auth-preview" aria-hidden="true"><div className="auth-preview-icon"><Icon name="shield" className="h-8 w-8" /></div><div><strong>Personal vault</strong><span>Encrypted. Organized. Yours.</span></div></div>
      </div>
      <p className="auth-brand-foot"><Icon name="shield" className="h-4 w-4" /> AES-256-GCM encryption</p>
    </aside>
    <div className="auth-form-area">{children}<p className="auth-form-foot">Your passwords deserve a place of their own.</p></div>
  </main>;
}

