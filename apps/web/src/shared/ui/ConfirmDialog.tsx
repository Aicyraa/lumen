import type { ReactNode } from "react";
import { Dialog } from "./Dialog";

// Confirmation before a destructive action. Cancel has focus, so Enter or Space never confirms by accident.
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pending = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <p className="body muted-2">{children}</p>
      <div className="row-end">
        <button type="button" data-autofocus className="btn btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary danger-fill"
          disabled={pending}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
