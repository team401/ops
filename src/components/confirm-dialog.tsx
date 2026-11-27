"use client";

import { useState } from "react";
import { Alert, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@team401/web-ui";

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

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !working) onClose(); }}>
      <DialogContent className="max-w-sm" showCloseButton={!working}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && <Alert tone="danger">{error}</Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={working} onClick={onClose}>Cancel</Button>
          <Button type="button" variant={destructive ? "danger" : "primary"} busy={working} disabled={working} onClick={handleConfirm}>{working ? "Working…" : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
