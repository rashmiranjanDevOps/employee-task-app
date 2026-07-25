import React from 'react';

// ─── Spinner ─────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4 border-2', md: 'w-6 h-6 border-2', lg: 'w-8 h-8 border-4' };
  return (
    <div className={`animate-spin rounded-full border-brand-500 border-t-transparent ${sizes[size]} ${className}`} />
  );
}

// ─── Alert ───────────────────────────────────────────────────────────────────
export function Alert({ type = 'error', children, onClose }) {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-sm ${styles[type]}`}>
      <span className="flex-1">{children}</span>
      {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100 font-bold">✕</button>}
    </div>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────
const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', in_review: 'In Review', completed: 'Completed', cancelled: 'Cancelled' };
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

export function StatusBadge({ status }) {
  return <span className={`status-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function PriorityBadge({ priority }) {
  return <span className={`priority-${priority}`}>{PRIORITY_LABELS[priority] || priority}</span>;
}

// ─── Empty State ─────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="text-slate-300 mb-4">{icon}</div>}
      <h3 className="text-slate-700 font-semibold mb-1">{title}</h3>
      {description && <p className="text-slate-500 text-sm max-w-sm mb-4">{description}</p>}
      {action}
    </div>
  );
}

// ─── Confirm Modal ───────────────────────────────────────────────────────────
export function ConfirmModal({ open, title, message, onConfirm, onCancel, loading, confirmLabel = 'Confirm', danger = false }) {
  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-box max-w-sm">
        <div className="modal-header">
          <h3 className="font-semibold text-slate-900">{title}</h3>
        </div>
        <div className="modal-body">
          <p className="text-slate-600 text-sm">{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={loading}>
            {loading ? <Spinner size="sm" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
export function Avatar({ user, size = 'md' }) {
  const sizes = { sm: 'w-6 h-6 text-xs', md: 'w-8 h-8 text-sm', lg: 'w-10 h-10 text-base' };
  const initials = user ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() : '?';
  return (
    <div className={`${sizes[size]} rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center flex-shrink-0`}>
      {initials}
    </div>
  );
}

// ─── Pagination ──────────────────────────────────────────────────────────────
export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total, limit } = pagination;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
      <span>Showing {start}–{end} of {total}</span>
      <div className="flex gap-1">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>← Prev</button>
        <span className="px-3 py-1.5 text-xs bg-slate-100 rounded-lg">{page} / {totalPages}</span>
        <button className="btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next →</button>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} />;
}

// ─── Select ──────────────────────────────────────────────────────────────────
export function Select({ label, value, onChange, options, className = '', error, required }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={error ? 'input-error' : 'input'}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
