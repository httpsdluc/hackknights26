"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type State<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };

/** Loads on mount. `reload()` refetches and keeps the current data on screen until the new data lands. */
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      const data = await loadRef.current();
      setState({ status: "ready", data });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    void reload();
  }, [reload]);

  return { state, reload, retry };
}
