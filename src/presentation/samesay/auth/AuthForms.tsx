"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { CircleCheck, OctagonAlert } from "lucide-react";
import { continueWithGoogle, logIn, sendPasswordReset, setNewPassword, signUp, type AuthState } from "@/app/auth/actions";
import { useToast } from "../Toast";

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return <button className="btn primary block" type="submit" disabled={pending}>{children}</button>;
}

function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div className="note rec" role="alert"><OctagonAlert /><div>{msg}</div></div>;
}

function GoogleButton({ label, next }: { label: string; next?: string }) {
  return (
    <form action={continueWithGoogle} style={{ display: "contents" }}>
      <input type="hidden" name="next" value={next ?? "/app"} />
      <button className="btn block" type="submit"><span className="g-mark">G</span>{label}</button>
    </form>
  );
}

const NOTICES: Record<string, string> = {
  link: "That link has expired or was already used. Log in, or ask for a new link.",
  google: "Google sign-in didn’t work. Please try again.",
  setup: "Sign-in isn’t set up yet. Add your Supabase keys to .env.local and restart the server.",
};

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useFormState<AuthState, FormData>(logIn, undefined);
  const [resetState, setResetState] = useState<AuthState>();
  const [resetting, startReset] = useTransition();
  const emailRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const e = { ...resetState?.errors, ...state?.errors };

  const forgot = () =>
    startReset(async () => {
      const r = await sendPasswordReset(emailRef.current?.value ?? "");
      setResetState(r);
      if (r?.sent) toast("We sent a reset link to your email");
    });

  return (
    <div className="panel auth-card">
      <div className="panel-body">
        <div>
          <h1 className="t-h3">Log in</h1>
          <p className="muted t-small" style={{ marginTop: 4 }}>Welcome back.</p>
        </div>
        <FormError msg={notice ? NOTICES[notice] : undefined} />
        <GoogleButton label="Continue with Google" next={next} />
        <div className="or">or</div>
        <form className="stack" noValidate action={action}>
          <input type="hidden" name="next" value={next ?? "/app"} />
          <div className="field">
            <label className="label" htmlFor="li-email">Email</label>
            <input ref={emailRef} className={"input" + (e.email ? " invalid" : "")} id="li-email" name="email" type="email" placeholder="you@studio.com" autoComplete="email" />
            {e.email && <span className="hint err">{e.email}</span>}
          </div>
          <div className="field">
            <div className="hstack" style={{ justifyContent: "space-between" }}>
              <label className="label" htmlFor="li-pw">Password</label>
              <button type="button" className="linkbtn" onClick={forgot} disabled={resetting}>Forgot password?</button>
            </div>
            <input className={"input" + (e.password ? " invalid" : "")} id="li-pw" name="password" type="password" autoComplete="current-password" />
            {e.password && <span className="hint err">{e.password}</span>}
          </div>
          <FormError msg={notice && e.form === NOTICES[notice] ? undefined : e.form} />
          <Submit>Log in</Submit>
        </form>
        <p className="t-small muted" style={{ textAlign: "center" }}>New here? <Link href="/signup">Create an account</Link></p>
      </div>
    </div>
  );
}

export function SignupForm() {
  const [state, action] = useFormState<AuthState, FormData>(signUp, undefined);
  const toast = useToast();
  const e = state?.errors ?? {};

  return (
    <div className="panel auth-card">
      <div className="panel-body">
        <div>
          <h1 className="t-h3">Create your account</h1>
          <p className="muted t-small" style={{ marginTop: 4 }}>Get 60 free credits. No card needed.</p>
        </div>
        {state?.checkEmail ? (
          <div className="note ok" role="status">
            <CircleCheck />
            <div><b>Check your inbox.</b> We sent a link to {state.checkEmail}. Open it to finish creating your account and get your 60 credits.</div>
          </div>
        ) : (
          <>
            <GoogleButton label="Sign up with Google" />
            <div className="or">or</div>
            <form className="stack" noValidate action={action}>
              <div className="field">
                <label className="label" htmlFor="su-name">Name</label>
                <input className="input" id="su-name" name="name" placeholder="Dara Chan" autoComplete="name" />
              </div>
              <div className="field">
                <label className="label" htmlFor="su-email">Email</label>
                <input className={"input" + (e.email ? " invalid" : "")} id="su-email" name="email" type="email" placeholder="you@studio.com" autoComplete="email" />
                {e.email && <span className="hint err">{e.email}</span>}
              </div>
              <div className="field">
                <label className="label" htmlFor="su-pw">Password</label>
                <input className={"input" + (e.password ? " invalid" : "")} id="su-pw" name="password" type="password" autoComplete="new-password" />
                <span className={"hint" + (e.password ? " err" : "")}>At least 8 characters.</span>
              </div>
              <label className="check t-small">
                <input type="checkbox" name="agree" />I agree to the{" "}
                <a href="#" onClick={(ev) => { ev.preventDefault(); toast("Coming soon"); }}>Terms</a> and{" "}
                <a href="#" onClick={(ev) => { ev.preventDefault(); toast("Coming soon"); }}>Privacy Policy</a>
              </label>
              {e.agree && <span className="hint err">{e.agree}</span>}
              <FormError msg={e.form} />
              <Submit>Create account</Submit>
            </form>
          </>
        )}
        <p className="t-small muted" style={{ textAlign: "center" }}>Already have an account? <Link href="/login">Log in</Link></p>
      </div>
    </div>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useFormState<AuthState, FormData>(setNewPassword, undefined);
  const e = state?.errors ?? {};
  return (
    <div className="panel auth-card">
      <div className="panel-body">
        <div>
          <h1 className="t-h3">Set a new password</h1>
          <p className="muted t-small" style={{ marginTop: 4 }}>Choose a password you haven’t used here before.</p>
        </div>
        <form className="stack" noValidate action={action}>
          <div className="field">
            <label className="label" htmlFor="rp-pw">New password</label>
            <input className={"input" + (e.password ? " invalid" : "")} id="rp-pw" name="password" type="password" autoComplete="new-password" />
            <span className={"hint" + (e.password ? " err" : "")}>At least 8 characters.</span>
          </div>
          <FormError msg={e.form} />
          <Submit>Save password</Submit>
        </form>
      </div>
    </div>
  );
}
