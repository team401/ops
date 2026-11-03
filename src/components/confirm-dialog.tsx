"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ModalBackdrop } from "@/components/modal-backdrop";

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  destructive = false,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  destructive?: boolean;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (typeof document === "undefined") return null;

  async function handleConfirm() {
    setWorking(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That action could not be completed.");
      setWorking(false);
    }
  }

  return createPortal(
    <ModalBackdrop onClose={() => { if (!working) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="w-full max-w-sm rounded-lg border border-steel-line bg-paper-raised p-5 text-ink shadow-xl">
        <h2 id="confirm-dialog-title" className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-steel">{description}</p>
        {error && <p className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={working} onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" disabled={working} onClick={handleConfirm} className={destructive ? "btn-danger" : "btn-primary"}>{working ? "Working…" : confirmLabel}</button>
        </div>
      </section>
    </ModalBackdrop>,
    document.body,
  );
}
