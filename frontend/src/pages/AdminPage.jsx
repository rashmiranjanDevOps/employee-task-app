import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../services/api';
import { Alert, Spinner, ConfirmModal, Pagination, Skeleton } from '../components/common';

function StatBox({ label, value, color, loading }) {
  return (
    <div className={`card border-l-4 ${color}`}>
      {loading ? <Skeleton className="h-8 w-16 mb-1" /> : <p className="text-3xl font-bold text-slate-900">{value}</p>}
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState('overview');
  const [dashData, setDashData] = useState(null);
  const [users, setUsers] = useState([]);
  const [userPagination, setUserPagination] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPagination, setAuditPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [deactivateModal, setDeactivateModal] = useState({ open: false, user: null });
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    if (tab === 'overview') {
      adminAPI.dashboard()
        .then(({ data }) => { setDashData(data.data); setLoading(false); })
        .catch(() => { setError('Failed to load dashboard.'); setLoading(false); });
    }
  }, [tab]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.listUsers({ page: userPage, limit: 10, search });
      setUsers(data.data.users);
      setUserPagination(data.data.pagination);
    } catch { setError('Failed to load users.'); }
    finally { setLoading(false); }
  }, [userPage, search]);

  useEffect(() => { if (tab === 'users') loadUsers(); }, [tab, loadUsers]);

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.auditLogs({ page: auditPage, limit: 20 });
      setAuditLogs(data.data.logs);
      setAuditPagination(data.data.pagination);
    } catch { setError('Failed to load audit logs.'); }
    finally { setLoading(false); }
  }, [auditPage]);

  useEffect(() => { if (tab === 'audit') loadAuditLogs(); }, [tab, loadAuditLogs]);

  const handleDeactivate = async () => {
    setDeactivating(true);
    try {
      await adminAPI.deleteUser(deactivateModal.user.id);
      setDeactivateModal({ open: false, user: null });
      setSuccess('User deactivated.');
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed.');
    } finally { setDeactivating(false); }
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'users', label: 'User Management' },
    { key: 'audit', label: 'Audit Logs' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-title">Admin Panel</h1>
        <p className="page-subtitle">System administration and monitoring</p>
      </div>

      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert type="success" onClose={() => setSuccess('')}>{success}</Alert>}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map((t) => (
          <button key={t.key}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => { setTab(t.key); setError(''); }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatBox label="Total Users" value={dashData?.stats.totalUsers} loading={loading} color="border-brand-500" />
            <StatBox label="Active Users" value={dashData?.stats.activeUsers} loading={loading} color="border-emerald-500" />
            <StatBox label="Total Tasks" value={dashData?.stats.totalTasks} loading={loading} color="border-blue-500" />
            <StatBox label="Overdue Tasks" value={dashData?.stats.overdueTasks} loading={loading} color="border-red-500" />
          </div>

          <div className="card">
            <h3 className="mb-4">Recent Activity</h3>
            {loading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>User</th><th>Action</th><th>Resource</th><th>Time</th></tr></thead>
                  <tbody>
                    {dashData?.recentActivity?.map((log) => (
                      <tr key={log.id}>
                        <td className="text-sm">{log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}</td>
                        <td><span className="badge-blue font-mono text-xs">{log.action}</span></td>
                        <td className="text-slate-500 text-sm">{log.resource}</td>
                        <td className="text-slate-400 text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Users Tab ────────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <input className="input max-w-xs" placeholder="Search users…" value={search}
              onChange={(e) => { setSearch(e.target.value); setUserPage(1); }} />
          </div>

          <div className="card p-0 overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Status</th><th>Joined</th><th className="text-right">Actions</th></tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="font-medium text-slate-900">{u.firstName} {u.lastName}</td>
                        <td className="text-slate-600 text-sm">{u.email}</td>
                        <td><span className={u.role === 'admin' ? 'badge-purple' : 'badge-blue'}>{u.role}</span></td>
                        <td className="text-slate-500 text-sm">{u.department || '—'}</td>
                        <td>
                          <span className={u.isActive ? 'badge bg-emerald-100 text-emerald-700' : 'badge bg-slate-100 text-slate-500'}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="text-slate-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="text-right">
                          {u.isActive && (
                            <button className="text-xs text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors font-medium"
                              onClick={() => setDeactivateModal({ open: true, user: u })}>
                              Deactivate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 pb-4">
                  <Pagination pagination={userPagination} onPageChange={setUserPage} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Audit Logs Tab ───────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr><th>User</th><th>Action</th><th>Resource</th><th>IP</th><th>Time</th></tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="text-sm">{log.user ? `${log.user.firstName} ${log.user.lastName}` : <span className="text-slate-400">System</span>}</td>
                      <td><span className="badge-blue font-mono text-xs">{log.action}</span></td>
                      <td className="text-slate-600 text-sm">{log.resource}{log.resourceId && <span className="text-slate-400 text-xs ml-1">{log.resourceId.slice(0, 8)}…</span>}</td>
                      <td className="text-slate-400 text-xs font-mono">{log.ipAddress || '—'}</td>
                      <td className="text-slate-400 text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 pb-4">
                <Pagination pagination={auditPagination} onPageChange={setAuditPage} />
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={deactivateModal.open}
        title="Deactivate User"
        message={`Deactivate ${deactivateModal.user?.firstName} ${deactivateModal.user?.lastName}? They will lose access immediately.`}
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateModal({ open: false, user: null })}
      />
    </div>
  );
}
