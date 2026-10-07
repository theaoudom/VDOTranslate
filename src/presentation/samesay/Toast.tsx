"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; msg: string; err?: boolean };
const ToastContext = createContext<(msg: string, err?: boolean) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((msg: string, err?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={"toast" + (t.err ? " err" : "")}>
            {t.err ? <CircleX /> : <CircleCheck />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Shows a toast for a link or control whose page isn't built yet. */
export function SoonLink({ children, msg = "Coming soon" }: { children: ReactNode; msg?: string }) {
  const toast = useToast();
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); toast(msg); }}>
      {children}
    </a>
  );
}
