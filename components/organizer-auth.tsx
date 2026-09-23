"use client";

import { createContext, FormEvent, ReactNode, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { organizerErrorMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase/client";

const OrganizerSessionContext = createContext<Session | null>(null);

export function useOrganizerSession() {
  const session = useContext(OrganizerSessionContext);
  if (!session) throw new Error("useOrganizerSession must be used inside OrganizerAuth");
  return session;
}

export default function OrganizerAuth({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setNotice("");
    setSigningIn(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setNotice(organizerErrorMessage("signIn"));
    setSigningIn(false);
  }

  if (!supabase) {
    return <main className="page-shell state-page"><div className="data-state"><h1>Panel no disponible</h1><p>El panel del organizador no está configurado en este momento.</p></div></main>;
  }
  if (loading) {
    return <main className="page-shell state-page" aria-busy="true"><p className="visually-hidden" role="status">Cargando panel…</p><div className="data-state" aria-hidden="true"><span className="skeleton skeleton-compact" /><span className="skeleton skeleton-title" /><span className="skeleton skeleton-secondary" /></div></main>;
  }
  if (!session) {
    return (
      <main className="page-shell auth-page">
        <section className="auth-card" aria-labelledby="auth-title">
          <header className="stack-header">
            <p className="eyebrow">Door List</p>
            <h1 id="auth-title">Panel del organizador</h1>
            <p className="page-description">Inicia sesión para consultar tus eventos y asistentes.</p>
          </header>
          <form aria-busy={signingIn} onSubmit={signIn}>
            {notice ? <p className="alert alert-error" role="alert">{notice}</p> : null}
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" disabled={signingIn} required /></label>
            <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" disabled={signingIn} required /></label>
            <button className="button button-primary" disabled={signingIn} type="submit">{signingIn ? "Ingresando…" : "Ingresar"}</button>
          </form>
        </section>
      </main>
    );
  }

  return <OrganizerSessionContext.Provider value={session}>{children}</OrganizerSessionContext.Provider>;
}
