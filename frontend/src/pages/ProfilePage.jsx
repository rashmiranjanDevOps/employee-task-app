import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usersAPI, authAPI } from '../services/api';
import { Alert, Spinner, Avatar } from '../components/common';

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '', department: user?.department || '', jobTitle: user?.jobTitle || '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const [pwMsg, setPwMsg] = useState({ type: '', text: '' });

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMsg({ type: '', text: '' });
    try {
      const { data } = await usersAPI.updateProfile(profile);
      updateUser(data.data.user);
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.error || 'Update failed.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      return setPwMsg({ type: 'error', text: 'New passwords do not match.' });
    }
    setPwLoading(true);
    setPwMsg({ type: '', text: '' });
    try {
      await authAPI.changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwMsg({ type: 'success', text: 'Password changed successfully.' });
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPwMsg({ type: 'error', text: err.response?.data?.error || 'Password change failed.' });
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">Manage your personal information and security settings</p>
      </div>

      {/* Avatar section */}
      <div className="card flex items-center gap-4">
        <Avatar user={user} size="lg" />
        <div>
          <p className="font-semibold text-slate-900">{user?.firstName} {user?.lastName}</p>
          <p className="text-sm text-slate-500">{user?.email}</p>
          <span className="badge-blue mt-1 capitalize">{user?.role}</span>
        </div>
      </div>

      {/* Profile Form */}
      <div className="card">
        <h2 className="mb-4">Personal Information</h2>
        <form onSubmit={handleProfileSave} className="space-y-4">
          {profileMsg.text && <Alert type={profileMsg.type} onClose={() => setProfileMsg({ type: '', text: '' })}>{profileMsg.text}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First name</label>
              <input className="input" value={profile.firstName} onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Last name</label>
              <input className="input" value={profile.lastName} onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))} required />
            </div>
          </div>
          <div>
            <label className="label">Email address</label>
            <input className="input bg-slate-50 cursor-not-allowed" value={user?.email || ''} disabled />
            <p className="text-xs text-slate-400 mt-1">Email cannot be changed. Contact your admin.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Department</label>
              <input className="input" value={profile.department} onChange={(e) => setProfile((p) => ({ ...p, department: e.target.value }))} placeholder="e.g. Engineering" />
            </div>
            <div>
              <label className="label">Job title</label>
              <input className="input" value={profile.jobTitle} onChange={(e) => setProfile((p) => ({ ...p, jobTitle: e.target.value }))} placeholder="e.g. Engineer" />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={profileLoading}>
              {profileLoading ? <Spinner size="sm" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Password Form */}
      <div className="card">
        <h2 className="mb-4">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          {pwMsg.text && <Alert type={pwMsg.type} onClose={() => setPwMsg({ type: '', text: '' })}>{pwMsg.text}</Alert>}
          <div>
            <label className="label">Current password</label>
            <input type="password" className="input" value={pwForm.currentPassword}
              onChange={(e) => setPwForm((p) => ({ ...p, currentPassword: e.target.value }))} required />
          </div>
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" value={pwForm.newPassword}
              onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))} required />
            <p className="text-xs text-slate-400 mt-1">Min 8 chars, uppercase, lowercase, number, and special character.</p>
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" className="input" value={pwForm.confirmPassword}
              onChange={(e) => setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))} required />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={pwLoading}>
              {pwLoading ? <Spinner size="sm" /> : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Account info */}
      <div className="card">
        <h2 className="mb-4">Account Details</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Account ID</dt><dd className="text-slate-700 font-mono text-xs">{user?.id}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Role</dt><dd className="capitalize text-slate-700">{user?.role}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Account status</dt><dd className="text-emerald-600 font-medium">Active</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Last login</dt><dd className="text-slate-700">{user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'N/A'}</dd></div>
        </dl>
      </div>
    </div>
  );
}
