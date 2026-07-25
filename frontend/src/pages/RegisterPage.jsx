import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Alert, Spinner } from '../components/common';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', department: '', jobTitle: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.details?.[0]?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-600 rounded-xl mb-4">
            <span className="text-white font-bold text-xl">TF</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Join TaskFlow</h1>
          <p className="text-slate-500 mt-1">Create your account to get started</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="firstName">First name</label>
                <input id="firstName" name="firstName" type="text" className="input" placeholder="Alice"
                  value={form.firstName} onChange={handleChange} required />
              </div>
              <div>
                <label className="label" htmlFor="lastName">Last name</label>
                <input id="lastName" name="lastName" type="text" className="input" placeholder="Smith"
                  value={form.lastName} onChange={handleChange} required />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" className="input" placeholder="you@company.com"
                value={form.email} onChange={handleChange} required />
            </div>

            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" className="input" placeholder="Min 8 chars, mixed case + number + symbol"
                value={form.password} onChange={handleChange} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="department">Department</label>
                <input id="department" name="department" type="text" className="input" placeholder="Engineering"
                  value={form.department} onChange={handleChange} />
              </div>
              <div>
                <label className="label" htmlFor="jobTitle">Job title</label>
                <input id="jobTitle" name="jobTitle" type="text" className="input" placeholder="Engineer"
                  value={form.jobTitle} onChange={handleChange} />
              </div>
            </div>

            <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
              {loading ? <Spinner size="sm" /> : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
