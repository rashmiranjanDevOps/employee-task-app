import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { tasksAPI, usersAPI } from '../services/api';
import { StatusBadge, PriorityBadge, Pagination, ConfirmModal, EmptyState, Alert, Spinner } from '../components/common';
import TaskFormModal from '../components/tasks/TaskFormModal';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [filters, setFilters] = useState({ status: '', priority: '', search: '', page: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, task: null });
  const [deleting, setDeleting] = useState(false);

  // Debounce free-text search so it doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((p) => (p.search === searchInput ? p : { ...p, search: searchInput, page: 1 }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Guards against out-of-order responses: if a newer request starts before
  // an older one resolves, the older one's result is discarded on arrival.
  const requestIdRef = React.useRef(0);

  const loadTasks = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const params = { page: filters.page, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' };
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      if (filters.search) params.search = filters.search;
      const { data } = await tasksAPI.list(params);
      if (requestId !== requestIdRef.current) return; // stale response, ignore
      setTasks(data.data.tasks);
      setPagination(data.data.pagination);
    } catch {
      if (requestId === requestIdRef.current) setError('Failed to load tasks.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    usersAPI.list().then(({ data }) => setUsers(data.data.users)).catch(() => {});
  }, []);

  const handleFilterChange = (key, value) => setFilters((p) => ({ ...p, [key]: value, page: 1 }));

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await tasksAPI.delete(deleteModal.task.id);
      setDeleteModal({ open: false, task: null });
      setSuccess('Task deleted successfully.');
      loadTasks();
    } catch {
      setError('Failed to delete task.');
    } finally {
      setDeleting(false);
    }
  };

  const handleFormSuccess = (msg) => {
    setShowForm(false);
    setEditTask(null);
    setSuccess(msg);
    loadTasks();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">Manage and track all your tasks</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditTask(null); setShowForm(true); }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Task
        </button>
      </div>

      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert type="success" onClose={() => setSuccess('')}>{success}</Alert>}

      {/* Filters */}
      <div className="card py-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text" placeholder="Search tasks…" className="input max-w-xs"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select className="input w-40" value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="input w-40" value={filters.priority} onChange={(e) => handleFilterChange('priority', e.target.value)}>
            {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className="btn-ghost" onClick={() => { setSearchInput(''); setFilters({ status: '', priority: '', search: '', page: 1 }); }}>
            Reset
          </button>
        </div>
      </div>

      {/* Task Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : tasks.length === 0 ? (
          <EmptyState
            title="No tasks found"
            description="Create your first task or adjust your filters."
            action={<button className="btn-primary" onClick={() => setShowForm(true)}>Create Task</button>}
            icon={<svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Assignee</th>
                  <th>Due Date</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !['completed','cancelled'].includes(task.status);
                  return (
                    <tr key={task.id}>
                      <td>
                        <Link to={`/tasks/${task.id}`} className="font-medium text-slate-900 hover:text-brand-600 line-clamp-1">
                          {task.title}
                        </Link>
                        {task.tags?.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {task.tags.slice(0, 3).map((t) => (
                              <span key={t} className="badge-slate">{t}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td><StatusBadge status={task.status} /></td>
                      <td><PriorityBadge priority={task.priority} /></td>
                      <td>
                        <span className="text-slate-600 text-sm">
                          {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : <span className="text-slate-400">Unassigned</span>}
                        </span>
                      </td>
                      <td>
                        <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
                          {isOverdue && ' ⚠'}
                        </span>
                      </td>
                      <td className="text-slate-500 text-sm">{new Date(task.createdAt).toLocaleDateString()}</td>
                      <td>
                        <div className="flex justify-end gap-2">
                          <button className="btn-ghost btn-sm" onClick={() => { setEditTask(task); setShowForm(true); }}>Edit</button>
                          <button className="btn-sm text-red-600 hover:bg-red-50 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                            onClick={() => setDeleteModal({ open: true, task })}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 pb-4">
              <Pagination pagination={pagination} onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))} />
            </div>
          </div>
        )}
      </div>

      {/* Task Form Modal */}
      {showForm && (
        <TaskFormModal
          task={editTask}
          users={users}
          onSuccess={handleFormSuccess}
          onClose={() => { setShowForm(false); setEditTask(null); }}
        />
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        open={deleteModal.open}
        title="Delete Task"
        message={`Are you sure you want to delete "${deleteModal.task?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal({ open: false, task: null })}
      />
    </div>
  );
}
