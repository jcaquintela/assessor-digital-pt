import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Sabe se existe sessão no browser. Serve para não chamar server functions
// protegidas antes da sessão estar hidratada (evita 401 + ecrã branco).
export function useHasSession(): boolean | undefined {
  const [hasSession, setHasSession] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return hasSession;
}
