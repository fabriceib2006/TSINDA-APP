import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n/translations';
import { Navbar } from './Navbar';
import { LessonsView } from './learner/LessonsView';
import { PracticeQuizView } from './learner/PracticeQuizView';
import { MockExamView } from './learner/MockExamView';
import { ResultsHistoryView } from './learner/ResultsHistoryView';
import { SubscriptionModal } from './learner/SubscriptionModal';
import { UserProfileView } from './UserProfileView';
import { seedInitialData } from '../lib/seedData';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Subscription, CombinedAccess } from '../types';
import { normalizeSubscription, getCombinedAccess } from '../lib/subscriptionUtils';
import { BookOpen, Award, History, ShieldCheck, Play, Lock, Clock } from 'lucide-react';

type LearnerTab = 'overview' | 'lessons' | 'quiz' | 'exam' | 'history' | 'profile';

export const LearnerDashboard: React.FC = () => {
  const { userProfile, language } = useAuth();
  const dict = t[language];
  const [activeTab, setActiveTab] = useState<LearnerTab>('overview');
  const [access, setAccess] = useState<CombinedAccess | null>(null);
  const [isSubModalOpen, setIsSubModalOpen] = useState<boolean>(false);

  const fetchAccess = async () => {
    if (!userProfile) return;
    try {
      const subsSnap = await getDocs(
        query(collection(db, 'subscriptions'), where('userId', '==', userProfile.uid))
      ).catch(() => null);

      if (subsSnap) {
        const subs = subsSnap.docs.map(d => normalizeSubscription(d.data(), d.id));
        const combined = getCombinedAccess(subs);
        setAccess(combined);
      } else {
        setAccess(getCombinedAccess([]));
      }
    } catch (err) {
      console.error("Error checking subscription:", err);
    }
  };

  useEffect(() => {
    async function init() {
      await seedInitialData();
      await fetchAccess();
    }
    init();
  }, [userProfile]);

  const expiryFormatted = access?.earliestExpiryDate 
    ? new Date(access.earliestExpiryDate).toLocaleDateString()
    : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col overflow-x-hidden">
      <Navbar onOpenProfile={() => setActiveTab('profile')} />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Streamlined Greeting Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {dict.welcomeBack}, <span className="text-blue-600">{userProfile?.name}</span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Rwanda National Gazette driving theory exam preparation.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {access?.hasActiveSubscription ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <span className="min-h-[44px] text-xs font-semibold text-emerald-800 bg-emerald-50 px-4 py-2 rounded-xl flex items-center gap-2 border border-emerald-200">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /> 
                      <span>Pass Active • Valid to {expiryFormatted}</span>
                    </span>

                    {access.exams && (
                      <span className="min-h-[44px] text-xs font-bold text-blue-800 bg-blue-50 px-3.5 py-2 rounded-xl flex items-center gap-1.5 border border-blue-200">
                        <Award className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>
                          Exams used: {access.examsUsed} of {access.isUnlimitedExams ? 'Unlimited' : access.totalExamsAllowed}
                        </span>
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setIsSubModalOpen(true)}
                    className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-xs sm:text-sm shadow-sm transition-colors flex items-center gap-2"
                  >
                    <span>Upgrade to Pro Plan</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Navigation Cards - 12px rounded cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {/* Traffic Lessons Card */}
              <div
                onClick={() => setActiveTab('lessons')}
                className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md cursor-pointer transition-all space-y-3 group relative"
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-[10px] flex items-center justify-center group-hover:scale-105 transition-transform">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  {access && !access.trafficRules && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 text-base">Traffic Lessons</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Official Rwanda Gazette traffic rules & video lessons.</p>
              </div>

              {/* Practice Quiz Card */}
              <div
                onClick={() => setActiveTab('quiz')}
                className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md cursor-pointer transition-all space-y-3 group"
              >
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-[10px] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Award className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Practice Quiz</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Category quizzes with instant feedback & explanations.</p>
              </div>

              {/* Mock Exam Card */}
              <div
                onClick={() => setActiveTab('exam')}
                className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md cursor-pointer transition-all space-y-3 group relative"
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-[10px] flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Play className="w-6 h-6" />
                  </div>
                  {access?.exams && (
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                      {access.isUnlimitedExams ? 'Unlimited' : `${access.examsRemaining} left`}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 text-base">National Mock Exam</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Timed 20-question exam simulation with pass/fail scoring.</p>
              </div>

              {/* Results History Card */}
              <div
                onClick={() => setActiveTab('history')}
                className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md cursor-pointer transition-all space-y-3 group"
              >
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-[10px] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <History className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Results History</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Review past mock exam scores and track your performance.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'lessons' && <LessonsView onBack={() => setActiveTab('overview')} />}
        {activeTab === 'quiz' && <PracticeQuizView onBack={() => setActiveTab('overview')} />}
        {activeTab === 'exam' && <MockExamView onBack={() => setActiveTab('overview')} />}
        {activeTab === 'history' && <ResultsHistoryView onBack={() => setActiveTab('overview')} />}
        {activeTab === 'profile' && <UserProfileView onBack={() => setActiveTab('overview')} />}
      </main>

      <SubscriptionModal
        isOpen={isSubModalOpen}
        onClose={() => setIsSubModalOpen(false)}
        onSubscribed={fetchAccess}
      />
    </div>
  );
};
