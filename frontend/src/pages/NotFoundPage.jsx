import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-8xl font-black text-brand-100 select-none">404</p>
        <h1 className="text-2xl font-bold text-slate-900 -mt-4 mb-2">Page not found</h1>
        <p className="text-slate-500 mb-6">The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <Link to="/dashboard" className="btn-primary">← Back to Dashboard</Link>
      </div>
    </div>
  );
}
