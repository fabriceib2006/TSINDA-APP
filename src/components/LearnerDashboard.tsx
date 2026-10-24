import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { t, learnerDashboardT } from '../i18n/translations';
import { getText } from '../lib/i18n';
import { Navbar } from './Navbar';
import { LessonsView } from './learner/LessonsView';
import { MockExamView } from './learner/MockExamView';
import { ResultsHistoryView } from './learner/ResultsHistoryView';
import { SubscriptionModal } from './learner/SubscriptionModal';
import { UserProfileView } from './UserProfileView';
import { seedInitialData } from '../lib/seedData';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { Subscription, CombinedAccess } from '../types';
import { normalizeSubscription, getCombinedAccess } from '../lib/subscriptionUtils';
import { BookOpen, Award, History, ShieldCheck, Play, Lock, Clock } from 'lucide-react';

type LearnerTab = 'overview' | 'lessons' | 'exam' | 'history' | 'profile';

export const LearnerDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const { language } = useLanguage();
  const dict = t[language];
  const [activeTab, setActiveTab] = useState<LearnerTab>('overview');
  const [access, setAccess] = useState<CombinedAccess | null>(null);
  const [isSubModalOpen, setIsSubModalOpen] = useState<boolean>(false);
  const [points, setPoints] = useState<number>(0);
  const [domain, setDomain] = useState<string>('https://tsinda.app');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!userProfile) return;
    
    // Fetch points ledger
    const fetchPoints = async () => {
      try {
        const snap = await getDocs(collection(db, 'users', userProfile.uid, 'pointsLedger'));
        let total = 0;
        snap.forEach(d => {
          const data = d.data();
          if (data.type === 'earn') total += Number(data.points || 0);
          if (data.type === 'spend') total -= Number(data.points || 0);
        });
        setPoints(total);
      } catch (err) {
        console.warn('Error fetching points:', err);
      }
    };
    fetchPoints();

    // Fetch referral settings for domain
    getDoc(doc(db, 'siteSettings', 'referral')).then(snap => {
      if (snap.exists() && snap.data()?.baseDomain) {
        setDomain(snap.data()?.baseDomain);
      }
    }).catch(() => {});
  }, [userProfile]);

  useEffect(() => {
    if (!userProfile) return;

    let latestSubs: any[] = [];
    let latestPurchases: any[] = [];
    let latestAccessDocs: any[] = [];

    const updateCombined = () => {
      const allList: Subscription[] = [];
      latestPurchases.forEach(d => allList.push(normalizeSubscription(d.data(), d.id)));
      latestSubs.forEach(d => {
        if (!allList.some(p => p.id === d.id || p.planId === d.data().planId)) {
          allList.push(normalizeSubscription(d.data(), d.id));
        }
      });

      const combined = getCombinedAccess(allList);
      const currentDoc = latestAccessDocs.find(d => d.id === 'current');
      if (currentDoc) {
        const cData = currentDoc.data();
        if (cData.planName) combined.activePlanName = cData.planName;
      }
      setAccess(combined);
      console.log("LearnerDashboard: Access updated", combined);
    };

    const unsubSubs = onSnapshot(query(collection(db, 'subscriptions'), where('userId', '==', userProfile.uid), where('status', '==', 'active')), (snap) => {
      console.log("LearnerDashboard: Subscription update", snap.docs.length);
      latestSubs = snap.docs;
      updateCombined();
    }, (err) => {
      console.warn("Error listening to subscriptions:", err);
    });

    const unsubPurchases = onSnapshot(query(collection(db, 'users', userProfile.uid, 'purchases'), where('status', '==', 'active')), (snap) => {
      console.log("LearnerDashboard: Purchase update", snap.docs.length);
      latestPurchases = snap.docs;
      updateCombined();
    }, (err) => {
      console.warn("Error listening to purchases:", err);
    });

    const unsubAccess = onSnapshot(collection(db, 'users', userProfile.uid, 'access'), (snap) => {
      console.log("LearnerDashboard: Access update", snap.docs.length);
      latestAccessDocs = snap.docs;
      updateCombined();
    }, (err) => {
      console.warn("Error listening to access:", err);
    });

    return () => {
      unsubSubs();
      unsubPurchases();
      unsubAccess();
    };
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
          <div className="space-y-6">
            {/* Referral Section */}
            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-blue-900">{getText(learnerDashboardT.inviteFriends, language)}</h3>
                  <span className="bg-amber-100 text-amber-800 text-xs font-extrabold px-2 py-0.5 rounded-full">🪙 {points} {getText(learnerDashboardT.coins, language)}</span>
                </div>
                <p className="text-sm text-blue-700">{getText(learnerDashboardT.inviteDesc, language)}</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input type="text" readOnly value={`${domain.replace(/\/$/, '')}/student?mode=signup&ref=${userProfile?.referralCode || ''}`} className="bg-white border rounded px-3 py-2 text-sm font-mono flex-1 sm:w-72" />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${domain.replace(/\/$/, '')}/student?mode=signup&ref=${userProfile?.referralCode || ''}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }} 
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-bold shrink-0 transition-colors"
                >
                  {copied ? getText(learnerDashboardT.copied, language) : getText(learnerDashboardT.copyLink, language)}
                </button>
              </div>
            </div>

            {/* Streamlined Greeting Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {dict.welcomeBack}, <span className="text-blue-600">{userProfile?.name}</span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded mr-1.5 border border-blue-200">
                    {getText(learnerDashboardT.student, language)}
                  </span>
                  {getText(learnerDashboardT.learnerDashboardDesc, language)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {access?.hasActiveSubscription ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <span className="min-h-[44px] text-xs font-semibold text-emerald-800 bg-emerald-50 px-4 py-2 rounded-xl flex items-center gap-2 border border-emerald-200">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /> 
                      <span>{getText(learnerDashboardT.passActive, language)} • {getText(learnerDashboardT.validTo, language)} {expiryFormatted || getText(learnerDashboardT.noExpiry, language)}</span>
                    </span>

                    {access.exams && (
                      <span className="min-h-[44px] text-xs font-bold text-blue-800 bg-blue-50 px-3.5 py-2 rounded-xl flex items-center gap-1.5 border border-blue-200">
                        <Award className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>
                          {getText(learnerDashboardT.examsUsed, language)}: {access.examsUsed} {getText(learnerDashboardT.of, language)} {access.isUnlimitedExams ? getText(learnerDashboardT.unlimited, language) : access.totalExamsAllowed}
                        </span>
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setIsSubModalOpen(true)}
                    className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-xs sm:text-sm shadow-sm transition-colors flex items-center gap-2"
                  >
                    <span>{getText(learnerDashboardT.upgradeToPro, language)}</span>
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
                      <Lock className="w-3 h-3" /> {getText(learnerDashboardT.locked, language)}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 text-base">{getText(learnerDashboardT.trafficLessons, language)}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{getText(learnerDashboardT.trafficLessonsDesc, language)}</p>
              </div>



              {/* Mock Exam Card */}
              {(() => {
                const hasExamAccess = Boolean(
                  access?.exams && (access.isUnlimitedExams || (typeof access.examsRemaining === 'number' && access.examsRemaining > 0))
                );
                const rawPlanName = access?.activePlanName;
                const planName = typeof rawPlanName === 'object' && rawPlanName
                  ? ((rawPlanName as any)[language] || (rawPlanName as any).en || (rawPlanName as any).rw)
                  : (rawPlanName || (access?.hasActiveSubscription ? (access.isUnlimitedExams ? 'Study Pro' : 'Exam Pack') : null));
                const expiryText = access?.isUnlimitedExams
                  ? (expiryFormatted ? `${getText(learnerDashboardT.validTo, language)} ${expiryFormatted}` : getText(learnerDashboardT.unlimited, language))
                  : (expiryFormatted ? `${getText(learnerDashboardT.validTo, language)} ${expiryFormatted}` : getText(learnerDashboardT.noExpiry, language));
                const examsLeftText = access?.isUnlimitedExams
                  ? getText(learnerDashboardT.unlimited, language)
                  : `${access?.examsRemaining ?? 0} ${getText(learnerDashboardT.examsLeft, language)}`;

                return (
                  <div
                    onClick={() => {
                      if (!hasExamAccess) {
                        setIsSubModalOpen(true);
                        return;
                      }
                      setActiveTab('exam');
                    }}
                    className={`bg-white p-6 rounded-xl border shadow-sm transition-all space-y-3 group relative ${
                      hasExamAccess
                        ? 'border-slate-200 hover:border-purple-300 hover:shadow-md cursor-pointer'
                        : 'border-slate-200 bg-slate-50/70 hover:border-amber-300 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`w-12 h-12 rounded-[10px] flex items-center justify-center transition-transform ${
                        hasExamAccess ? 'bg-purple-50 text-purple-600 group-hover:scale-105' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {hasExamAccess ? <Play className="w-6 h-6" /> : <Lock className="w-6 h-6 text-amber-600" />}
                      </div>
                      {!hasExamAccess ? (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1">
                          <Lock className="w-3 h-3" /> {getText(learnerDashboardT.locked, language)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                          {access?.isUnlimitedExams ? getText(learnerDashboardT.unlimited, language) : `${access?.examsRemaining ?? 0} ${getText(learnerDashboardT.left, language)}`}
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">{getText(learnerDashboardT.nationalMockExam, language)}</h3>
                      {hasExamAccess && planName ? (
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                          <div className="text-xs font-semibold text-purple-900 truncate">
                            {getText(learnerDashboardT.plan, language)}: {planName}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center justify-between">
                            <span>{expiryText}</span>
                            <span className="font-bold text-purple-700">{examsLeftText}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 leading-relaxed mt-1">{getText(learnerDashboardT.mockExamDesc, language)}</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Results History Card */}
              <div
                onClick={() => setActiveTab('history')}
                className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md cursor-pointer transition-all space-y-3 group"
              >
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-[10px] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <History className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">{getText(learnerDashboardT.resultsHistory, language)}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{getText(learnerDashboardT.resultsHistoryDesc, language)}</p>
              </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'lessons' && <LessonsView onBack={() => setActiveTab('overview')} />}
        {activeTab === 'exam' && <MockExamView onBack={() => setActiveTab('overview')} />}
        {activeTab === 'history' && <ResultsHistoryView onBack={() => setActiveTab('overview')} />}
        {activeTab === 'profile' && <UserProfileView onBack={() => setActiveTab('overview')} />}
      </main>

      <SubscriptionModal
        isOpen={isSubModalOpen}
        onClose={() => setIsSubModalOpen(false)}
        onSubscribed={() => {}}
      />
    </div>
  );
};
