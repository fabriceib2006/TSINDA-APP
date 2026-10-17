import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n/translations';
import { Navbar } from './Navbar';
import { UserProfileView } from './UserProfileView';
import { Building2, Users, FileCheck, TrendingUp } from 'lucide-react';

export const SchoolDashboard: React.FC = () => {
  const { userProfile, language } = useAuth();
  const dict = t[language];
  const [showProfile, setShowProfile] = useState(false);

  if (showProfile) {
    return <UserProfileView onBack={() => setShowProfile(false)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar onOpenProfile={() => setShowProfile(true)} />
      <main className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full space-y-6">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
              {dict.schoolPortal}
            </span>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">
              {userProfile?.name} Driving School
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage your registered student candidates and track their exam progress.
            </p>
          </div>
          <button className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm shadow-md transition-colors">
            Register New Student
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="p-3 bg-emerald-50 text-emerald-600 w-fit rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900">Enrolled Students</h3>
            <p className="text-3xl font-bold text-slate-900 mt-2">48</p>
            <p className="text-xs text-slate-500">Active learners in your school cohort.</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="p-3 bg-blue-50 text-blue-600 w-fit rounded-xl">
              <FileCheck className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900">Pass Rate</h3>
            <p className="text-3xl font-bold text-slate-900 mt-2">91%</p>
            <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> +4% above average
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="p-3 bg-purple-50 text-purple-600 w-fit rounded-xl">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900">School Profile</h3>
            <p className="text-xs text-slate-500 mt-2">Verified Rwanda Driving School partner.</p>
          </div>
        </div>
      </main>
    </div>
  );
};
