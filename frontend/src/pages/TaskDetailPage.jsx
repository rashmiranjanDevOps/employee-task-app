import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { tasksAPI, usersAPI } from '../services/api';
import { StatusBadge, PriorityBadge, Alert, ConfirmModal, Spinner, Avatar } from '../components/common';
import TaskFormModal from '../components/tasks/TaskFormModal';

export default function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([tasksAPI.get(id), usersAPI.list()])
      .then(([t, u]) => { setTask(t.data.data.task); setUsers(u.data.data.users); })
      .catch(() => setError('Task not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await tasksAPI.delete(id);
      navigate('/tasks');
    } catch { setError('Failed to delete.'); setDeleting(false); }
  };

  const handleEditSuccess = async () => {
    setShowEdit(false);
    const { data } = await tasksAPI.get(id);
    setTask(data.data.task);
  };

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (error) return <Alert type="error">{error}</Alert>;
  if (!task) return null;

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !['completed','cancelled'].includes(task.status);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-500">
        <Link to="/tasks" className="hover:text-brand-600">Tasks</Link>
        <span className="mx-2">›</span>
        <span className="text-slate-900">{task.title}</span>
      </nav>

      {/* Main Card */}
      <div className="card space-y-6">
        {/* Title + actions */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">{task.title}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              {isOverdue && <span className="badge bg-red-100 text-red-700">⚠ Overdue</span>}
              {task.tags?.map((t) => <span key={t} className="badge-slate">{t}</span>)}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button className="btn-secondary btn-sm" onClick={() => setShowEdit(true)}>Edit</button>
            <button className="btn-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              onClick={() => setDeleteModal(true)}>Delete</button>
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <div>
            <h3 className="text-sm font-medium text-slate-500 mb-2">Description</h3>
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-400 mb-1">Created by</p>
            {task.creator ? (
              <div className="flex items-center gap-2">
                <Avatar user={task.creator} size="sm" />
                <span className="text-sm text-slate-700">{task.creator.firstName} {task.creator.lastName}</span>
              </div>
            ) : <span className="text-sm text-slate-400">—</span>}
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1">Assigned to</p>
            {task.assignee ? (
              <div className="flex items-center gap-2">
                <Avatar user={task.assignee} size="sm" />
                <span className="text-sm text-slate-700">{task.assignee.firstName} {task.assignee.lastName}</span>
              </div>
            ) : <span className="text-sm text-slate-400">Unassigned</span>}
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1">Due date</p>
            <p className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-slate-700'}`}>
              {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1">Estimated hours</p>
            <p className="text-sm text-slate-700">{task.estimatedHours ? `${task.estimatedHours}h` : '—'}</p>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1">Actual hours</p>
            <p className="text-sm text-slate-700">{task.actualHours ? `${task.actualHours}h` : '—'}</p>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1">Created</p>
            <p className="text-sm text-slate-700">{new Date(task.createdAt).toLocaleDateString()}</p>
          </div>

          {task.completedAt && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Completed</p>
              <p className="text-sm text-emerald-700">{new Date(task.completedAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      </div>

      {showEdit && (
        <TaskFormModal task={task} users={users} onSuccess={handleEditSuccess} onClose={() => setShowEdit(false)} />
      )}

      <ConfirmModal
        open={deleteModal}
        title="Delete Task"
        message={`Delete "${task.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal(false)}
      />
    </div>
  );
}
