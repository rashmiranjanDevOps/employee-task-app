import React, { useState } from 'react';
import { tasksAPI } from '../../services/api';
import { Alert, Spinner } from '../common';

const STATUS_OPTS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export default function TaskFormModal({ task, users = [], onSuccess, onClose }) {
  const isEdit = Boolean(task);
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || 'todo',
    priority: task?.priority || 'medium',
    assignedTo: task?.assignedTo || '',
    dueDate: task?.dueDate ? task.dueDate.split('T')[0] : '',
    estimatedHours: task?.estimatedHours || '',
    tags: task?.tags?.join(', ') || '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...form,
        assignedTo: form.assignedTo || null,
        dueDate: form.dueDate || null,
        estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : null,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      };

      if (isEdit) {
        await tasksAPI.update(task.id, payload);
        onSuccess('Task updated successfully.');
      } else {
        await tasksAPI.create(payload);
        onSuccess('Task created successfully.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.details?.[0]?.message || 'Failed to save task.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h3 className="font-semibold text-slate-900">{isEdit ? 'Edit Task' : 'Create New Task'}</h3>
          <button onClick={onClose} className="btn-ghost p-1 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body space-y-4">
            {error && <Alert type="error">{error}</Alert>}

            <div>
              <label className="label">Title <span className="text-red-500">*</span></label>
              <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} required placeholder="Task title" />
            </div>

            <div>
              <label className="label">Description</label>
              <textarea className="input resize-none" rows={3} value={form.description}
                onChange={(e) => set('description', e.target.value)} placeholder="Task details…" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Priority</label>
                <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                  {PRIORITY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Assign To</label>
              <select className="input" value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Due Date</label>
                <input type="date" className="input" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
              </div>
              <div>
                <label className="label">Estimated Hours</label>
                <input type="number" className="input" step="0.5" min="0" max="9999"
                  value={form.estimatedHours} onChange={(e) => set('estimatedHours', e.target.value)} placeholder="e.g. 4.5" />
              </div>
            </div>

            <div>
              <label className="label">Tags <span className="text-slate-400 font-normal">(comma-separated)</span></label>
              <input className="input" value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="frontend, api, bug" />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <Spinner size="sm" /> : isEdit ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
