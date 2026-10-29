/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { AuthScreen } from './components/AuthScreen';
import { AdminAuthScreen } from './components/AdminAuthScreen';
import { AdminLayout } from './components/AdminLayout';
import { LearnerDashboard } from './components/LearnerDashboard';
import { HomePage } from './components/HomePage';
import { TermsAndPrivacyPage } from './components/TermsAndPrivacyPage';
import { useAuth } from './context/AuthContext';

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

  if (path.startsWith('/terms')) {
    return <TermsAndPrivacyPage />;
  }

  // 1. Admin route (/admin...)
  if (path.startsWith('/admin')) {
    if (!firebaseUser || !userProfile || userProfile.role !== 'admin') {
      return <AdminAuthScreen />;
    }
    return <AdminLayout />;
  }

  // 2. Student route (/student...)
  if (path.startsWith('/student')) {
    if (!firebaseUser || !userProfile) {
      return <AuthScreen />;
    }
    if (userProfile.role === 'admin') {
      window.history.replaceState({}, '', '/admin');
      return <AdminLayout />;
    }
    return <LearnerDashboard />;
  }

  if (path.startsWith('/signup')) {
    window.history.replaceState({}, '', '/student?mode=signup');
    return <AuthScreen />;
  }

  // 3. Root Home Page (/)
  return <HomePage />;
};

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}
