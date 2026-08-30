import { Modal } from "../ui/Modal";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open, title, message,
  confirmLabel = "Confirmer", cancelLabel = "Annuler",
  onConfirm, onCancel, danger = true,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      icon={<AlertTriangle className={`h-5 w-5 ${danger ? "text-red-500" : "text-amber-500"}`} />}
      size="sm"
      footer={
        <>
          <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">{cancelLabel}</button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600">{message}</p>
    </Modal>
  );
}
