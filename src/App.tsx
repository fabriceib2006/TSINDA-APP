/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { AdminLayout } from './components/AdminLayout';
import { LearnerDashboard } from './components/LearnerDashboard';
import { HomePage } from './components/HomePage';

const AppContent: React.FC = () => {
  const { firebaseUser, userProfile, loading } = useAuth();
  const path = window.location.pathname;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-600">Loading TSINDA...</p>
        </div>
      </div>
    );
  }

  // 1. Admin route (/admin...)
  if (path.startsWith('/admin')) {
    if (!firebaseUser || !userProfile) {
      return <AuthScreen />;
    }
    if (userProfile.role !== 'admin') {
      // Student cannot access admin portal -> redirect to /student
      window.history.replaceState({}, '', '/student');
      return <LearnerDashboard />;
    }
    return <AdminLayout />;
  }

  // 2. Student route (/student...)
  if (path.startsWith('/student')) {
    if (!firebaseUser || !userProfile) {
      return <AuthScreen />;
    }
    if (userProfile.role === 'admin') {
      // Admin cannot access student portal -> redirect to /admin
      window.history.replaceState({}, '', '/admin');
      return <AdminLayout />;
    }
    return <LearnerDashboard />;
  }

  // 3. Root Home Page (/) is ALWAYS the public homepage for everyone (visitor, admin, or student)
  return <HomePage />;
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
