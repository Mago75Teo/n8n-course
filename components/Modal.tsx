"use client";

import { useEffect, useRef } from "react";

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handler = () => onClose();
    d.addEventListener("close", handler);
    return () => d.removeEventListener("close", handler);
  }, [onClose]);

  return (
    <dialog ref={ref} style={{ border: "none", background: "transparent" }}>
      <div className="card" style={{ width: "min(920px, 92vw)", padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          <button className="btn" onClick={onClose}>Chiudi</button>
        </div>
        <div className="muted small" style={{ marginTop: 8, lineHeight: 1.5 }}>
          {children}
        </div>
      </div>
      <style jsx global>{`
        dialog::backdrop{ background: rgba(0,0,0,0.6); }
      `}</style>
    </dialog>
  );
}
