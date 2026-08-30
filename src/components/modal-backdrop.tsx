"use client";

import { useEffect, type MouseEvent, type ReactNode } from "react";

export function ModalBackdrop({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 p-2 [&>*]:max-h-[calc(100dvh-1rem)] [&>*]:overflow-y-auto sm:p-4 sm:[&>*]:max-h-[calc(100dvh-2rem)]"
      onMouseDown={handleBackdropMouseDown}
      role="presentation"
    >
      {children}
    </div>
  );
}
