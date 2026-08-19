export default function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  hideCancel = false,
  danger = false,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 grid place-items-center p-4 z-[60]"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="card w-full max-w-sm space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h3 id="confirm-title" className="font-semibold text-lg mb-0">{title}</h3>
        {children ? <div className="text-sm text-muted space-y-2">{children}</div> : null}
        {error ? <p className="text-sm text-orange-300 mb-0">{error}</p> : null}
        <div className="flex justify-end gap-2">
          {!hideCancel && (
            <button type="button" className="btn-outline" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
