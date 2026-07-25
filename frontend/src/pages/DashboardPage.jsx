import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { tasksAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, PriorityBadge, Skeleton } from '../components/common';

const COLORS = { todo: '#94a3b8', in_progress: '#3b82f6', in_review: '#a855f7', completed: '#10b981', cancelled: '#ef4444' };

function StatCard({ label, value, icon, color, loading }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div>
        {loading ? <Skeleton className="h-7 w-16 mb-1" /> : <div className="stat-value">{value}</div>}
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, tasksRes] = await Promise.all([
          tasksAPI.stats(),
          tasksAPI.list({ limit: 5, sortBy: 'createdAt', sortOrder: 'DESC' }),
        ]);
        setStats(statsRes.data.data.stats);
        setRecentTasks(tasksRes.data.data.tasks);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const pieData = stats ? [
    { name: 'To Do', value: stats.todo, color: COLORS.todo },
    { name: 'In Progress', value: stats.inProgress, color: COLORS.in_progress },
    { name: 'In Review', value: stats.inReview, color: COLORS.in_review },
    { name: 'Completed', value: stats.completed, color: COLORS.completed },
    { name: 'Cancelled', value: stats.cancelled, color: COLORS.cancelled },
  ].filter((d) => d.value > 0) : [];

  const barData = stats ? [
    { name: 'Total', value: stats.total },
    { name: 'Active', value: stats.inProgress + stats.todo + stats.inReview },
    { name: 'Done', value: stats.completed },
    { name: 'Overdue', value: stats.overdue },
  ] : [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.firstName}! Here&apos;s what&apos;s happening.</p>
        </div>
        <Link to="/tasks" className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Task
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Tasks" value={stats?.total ?? '—'} loading={loading} color="bg-blue-50 text-blue-600"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
        />
        <StatCard label="In Progress" value={stats?.inProgress ?? '—'} loading={loading} color="bg-amber-50 text-amber-600"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard label="Completed" value={stats?.completed ?? '—'} loading={loading} color="bg-emerald-50 text-emerald-600"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard label="Overdue" value={stats?.overdue ?? '—'} loading={loading} color="bg-red-50 text-red-600"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
        />
      </div>

      {/* Charts */}
      {!loading && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="mb-4 text-slate-700">Task Status Breakdown</h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">No task data yet</div>
            )}
          </div>

          <div className="card">
            <h3 className="mb-4 text-slate-700">Task Overview</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} barSize={32}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Tasks */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-700">Recent Tasks</h3>
          <Link to="/tasks" className="text-sm text-brand-600 hover:underline">View all →</Link>
        </div>
        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : recentTasks.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No tasks yet. <Link to="/tasks" className="text-brand-600">Create your first task →</Link></p>
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
                </tr>
              </thead>
              <tbody>
                {recentTasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <Link to={`/tasks/${task.id}`} className="font-medium text-slate-900 hover:text-brand-600 transition-colors">
                        {task.title}
                      </Link>
                    </td>
                    <td><StatusBadge status={task.status} /></td>
                    <td><PriorityBadge priority={task.priority} /></td>
                    <td className="text-slate-500">
                      {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : '—'}
                    </td>
                    <td className="text-slate-500">
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
