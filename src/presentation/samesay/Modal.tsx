"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** The prototype's dialog: closes with Escape, the × button or a click outside. */
export function Modal({ title, children, okLabel, onOk, onClose, danger, okDisabled }: {
  title: string;
  children: ReactNode;
  okLabel: string;
  onOk: () => void;
  onClose: () => void;
  danger?: boolean;
  okDisabled?: boolean;
}) {
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const last = document.activeElement as HTMLElement | null;
    (okDisabled ? cancelRef.current : okRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); last?.focus?.(); };
  }, [onClose, okDisabled]);

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-head"><h3>{title}</h3><button className="btn ghost icon sm" onClick={onClose} aria-label="Close"><X /></button></div>
        <div className="panel-body">{children}</div>
        <div className="panel-foot">
          <button ref={cancelRef} className="btn" onClick={onClose}>Cancel</button>
          <button ref={okRef} className={"btn " + (danger ? "danger" : "primary")} disabled={okDisabled} onClick={onOk}>{okLabel}</button>
        </div>
      </div>
    </div>
  );
}
