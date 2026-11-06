import { googleClientId } from "../api/googleConfig";
import { GoogleLogin, useGoogleOAuth, type CredentialResponse } from "@react-oauth/google";
import { useEffect } from "react";

interface GoogleSignInButtonProps {
  disabled: boolean;
  loading: boolean;
  onCredential: (credential: string) => Promise<void>;
  onError: (message: string) => void;
}

function ConfiguredGoogleSignIn({ disabled, loading, onCredential, onError }: GoogleSignInButtonProps) {
  const { scriptLoadedSuccessfully } = useGoogleOAuth();
  useEffect(() => {
    if (scriptLoadedSuccessfully) return;
    const timer = window.setTimeout(() => onError("Google sign-in could not load. Check your connection or use your email and password."), 12000);
    return () => window.clearTimeout(timer);
  }, [scriptLoadedSuccessfully, onError]);

  function handleSuccess(response: CredentialResponse) {
    if (disabled) return;
    if (!response.credential) {
      onError("Google did not return a sign-in credential. Please try again.");
      return;
    }
    void onCredential(response.credential);
  }

  return <div aria-busy={loading}>
    <div aria-disabled={disabled} {...(disabled ? { inert: "" } : {})} className={`flex min-h-11 justify-center ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => onError("Google sign-in was unsuccessful. Please try again or sign in with your password.")}
        theme="outline" size="large" shape="pill" text="continue_with" width="320"
        auto_select={false} useOneTap={false}
      />
    </div>
    {loading && <p role="status" className="mt-2 text-center text-sm text-indigo-600">Signing in with Google...</p>}
  </div>;
}

export default function GoogleSignInButton(props: GoogleSignInButtonProps) {
  if (!googleClientId) {
    return <div><button type="button" disabled className="w-full border border-slate-300 px-4 py-2.5 text-sm text-slate-500 opacity-60">Continue with Google</button><p className="mt-2 text-center text-xs text-slate-500">Google sign-in is not available yet. Use email and password.</p></div>;
  }
  return <ConfiguredGoogleSignIn {...props} />;
}
