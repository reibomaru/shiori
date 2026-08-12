import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { TripPayload } from "./types";
import { api } from "./api";

interface TripCtx {
  data: TripPayload | null;
  error: string | null;
  reload: () => Promise<void>;
}

const Ctx = createContext<TripCtx | null>(null);

export function TripProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TripPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await api.getTrip());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return <Ctx.Provider value={{ data, error, reload }}>{children}</Ctx.Provider>;
}

export function useTrip() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTrip must be used within TripProvider");
  return c;
}
