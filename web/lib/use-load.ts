"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ContractError } from "./contract-check";

type State<T> = { status: "loading" } | { status: "error"; detail: string | null } | { status: "ready"; data: T };

/**
 * Loads on mount and whenever `key` changes. A slower, older response never overwrites a newer one.
 * `reload()` refetches while the current data stays on screen; it rejects if the refetch fails.
 */
export function useLoad<T>(load: () => Promise<T>, key = "") {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  const loadRef = useRef(load);
  loadRef.current = load;
  const latest = useRef(0);

  const run = useCallback(async (keepData: boolean) => {
    const mine = ++latest.current;
    try {
      const data = await loadRef.current();
      if (mine === latest.current) setState({ status: "ready", data });
    } catch (err) {
      if (mine !== latest.current) return;
      if (keepData) throw err;
      setState({ status: "error", detail: err instanceof ContractError ? err.message : null });
    }
  }, []);

  useEffect(() => {
    setState({ status: "loading" });
    void run(false);
    return () => {
      latest.current += 1;
    };
  }, [run, key]);

  const reload = useCallback(() => run(true), [run]);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    void run(false);
  }, [run]);

  return { state, reload, retry };
}
