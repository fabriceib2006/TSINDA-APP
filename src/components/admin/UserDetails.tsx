import React, { useEffect, useState } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { UserProfile, Subscription, Plan, ExamAttempt } from '../../types';
import { normalizeSubscription, normalizePlan } from '../../lib/subscriptionUtils';
import { 
  ArrowLeft, 
  Plus, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  AlertCircle, 
  Calendar, 
  ShieldCheck,
  Eye,
  Award,
  Clock,
  BarChart3,
  TrendingUp,
  BookOpen,
  Check,
  X,
  FileText,
  Filter,
  CheckCircle2
} from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';

interface UserDetailsProps {
  user: UserProfile;
  onBack: () => void;
}

interface PerformanceSummary {
  totalExams: number;
  passedExams: number;
  failedExams: number;
  passRate: number;
  averageScore: number;
  averageScorePercent: number;
  highestScore: number;
  lowestScore: number;
  averageDurationSeconds: number;
  totalQuizzes: number;
  passedQuizzes: number;
}

interface QuestionReviewItem {
  index: number;
  questionId: string;
  text: any;
  options: any;
  userAnswer: number | null;
  correctIndex: number;
  isCorrect: boolean;
  explanation: any;
  category?: string;
  categoryName?: any;
  imageUrl?: string | null;
}

interface ExamHistoryItem {
  id: string;
  attemptId: string;
  date: string;
  durationSeconds: number;
  score: number;
  total: number;
  passMark: number;
  passed: boolean;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  questions?: QuestionReviewItem[];
}

interface CategoryMastery {
  categoryId: string;
  categoryName: any;
  totalQuestions: number;
  correctCount: number;
  accuracyPercent: number;
}

interface LessonQuizItem {
  lessonId: string;
  lessonTitle: any;
  category: string;
  score: number;
  total: number;
  percent: number;
  passed: boolean;
  attempts: number;
  date: string;
}

export const UserDetails: React.FC<UserDetailsProps> = ({ user, onBack }) => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [actionData, setActionData] = useState<{type: 'cancel'|'reset', subId: string}|null>(null);
  
  // Performance & History state
  const [summary, setSummary] = useState<PerformanceSummary>({
    totalExams: 0,
    passedExams: 0,
    failedExams: 0,
    passRate: 0,
    averageScore: 0,
    averageScorePercent: 0,
    highestScore: 0,
    lowestScore: 0,
    averageDurationSeconds: 0,
    totalQuizzes: 0,
    passedQuizzes: 0
  });
  const [examHistory, setExamHistory] = useState<ExamHistoryItem[]>([]);
  const [categoryPerformance, setCategoryPerformance] = useState<CategoryMastery[]>([]);
  const [lessonQuizzes, setLessonQuizzes] = useState<LessonQuizItem[]>([]);
  
  // UI Tabs & Filters
  const [activeHistoryTab, setActiveHistoryTab] = useState<'exams' | 'quizzes'>('exams');
  const [examFilter, setExamFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Grant modal state
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [customDays, setCustomDays] = useState<number | ''>('');
  const [grantNotes, setGrantNotes] = useState('');
  const [isGranting, setIsGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  const getLocalizedText = (item: any, fallback = '—') => {
    if (!item) return fallback;
    if (typeof item === 'string') return item;
    return item.en || item.rw || item.fr || Object.values(item)[0] || fallback;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Plans
      let loadedPlans: Plan[] = [];
      try {
        const plansSnap = await getDocs(collection(db, 'plans'));
        if (!plansSnap.empty) {
          loadedPlans = plansSnap.docs.map(d => normalizePlan(d.data(), d.id)).filter(p => p.isActive);
        }
      } catch (planErr) {
        console.warn("Direct plans getDocs warning, trying active query:", planErr);
      }

      if (loadedPlans.length === 0) {
        try {
          const activePlansSnap = await getDocs(query(collection(db, 'plans'), where('isActive', '==', true)));
          if (!activePlansSnap.empty) {
            loadedPlans = activePlansSnap.docs.map(d => normalizePlan(d.data(), d.id));
          }
        } catch (activeErr) {
          console.warn("Active query failed, attempting backend /api/plans fallback:", activeErr);
        }
      }

      if (loadedPlans.length === 0) {
        try {
          const res = await fetch('/api/plans');
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.plans) && data.plans.length > 0) {
              loadedPlans = data.plans.map((p: any) => normalizePlan(p, p.id));
            }
          }
        } catch (apiErr) {
          console.warn("Failed fetching from /api/plans:", apiErr);
        }
      }

      setPlans(loadedPlans);
      if (loadedPlans.length > 0 && !selectedPlanId) {
        setSelectedPlanId(loadedPlans[0].id);
        setCustomDays(loadedPlans[0].durationDays);
      }

      // 2. Fetch Subscriptions safely
      try {
        const subsSnap = await getDocs(query(collection(db, 'subscriptions'), where('userId', '==', user.uid)));
        setSubscriptions(subsSnap.docs.map(d => normalizeSubscription(d.data(), d.id)));
      } catch (subErr) {
        console.warn("Failed fetching user subscriptions:", subErr);
      }

      // 3. Fetch Full User Performance & Detailed History via Server API
      let performanceLoaded = false;
      try {
        const currentUser = auth.currentUser;
        const token = await currentUser?.getIdToken();
        if (token) {
          const perfRes = await fetch(`/api/admin/users/${user.uid}/performance`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (perfRes.ok) {
            const perfData = await perfRes.json();
            if (perfData.success) {
              if (perfData.summary) setSummary(perfData.summary);
              if (Array.isArray(perfData.examHistory)) setExamHistory(perfData.examHistory);
              if (Array.isArray(perfData.categoryPerformance)) setCategoryPerformance(perfData.categoryPerformance);
              if (Array.isArray(perfData.lessonQuizzes)) setLessonQuizzes(perfData.lessonQuizzes);
              performanceLoaded = true;
            }
          }
        }
      } catch (apiErr) {
        console.warn("Failed loading from /api/admin/users/:userId/performance:", apiErr);
      }

      // 4. Client-side fallback if server performance endpoint didn't respond
      if (!performanceLoaded) {
        try {
          const [attemptsSnap, resultsSnap, progressSnap] = await Promise.all([
            getDocs(collection(db, 'users', user.uid, 'examAttempts')).catch(() => null),
            getDocs(collection(db, 'users', user.uid, 'examResults')).catch(() => null),
            getDocs(collection(db, 'users', user.uid, 'progress')).catch(() => null),
          ]);

          const localExams: ExamHistoryItem[] = [];
          if (resultsSnap && !resultsSnap.empty) {
            resultsSnap.docs.forEach(d => {
              const data = d.data();
              const score = Number(data.score) || 0;
              const total = Number(data.total) || 20;
              const passMark = Number(data.passMark) || 12;
              localExams.push({
                id: d.id,
                attemptId: data.attemptId || d.id,
                date: data.submittedAt || data.date || new Date().toISOString(),
                durationSeconds: Number(data.durationSeconds) || 0,
                score,
                total,
                passMark,
                passed: data.passed !== undefined ? Boolean(data.passed) : score >= passMark,
                percentage: total > 0 ? Math.round((score / total) * 100) : 0,
                correctCount: score,
                incorrectCount: Math.max(0, total - score),
                questions: Array.isArray(data.results) ? data.results : []
              });
            });
          }

          if (attemptsSnap && !attemptsSnap.empty) {
            attemptsSnap.docs.forEach(d => {
              const data = d.data();
              // Only finished or completed attempts
              if (data.status === 'finished' || data.status === 'completed' || data.score !== undefined) {
                if (!localExams.some(e => e.id === d.id || e.attemptId === d.id)) {
                  const score = Number(data.score) || 0;
                  const total = Number(data.total) || 20;
                  const passMark = 12;
                  localExams.push({
                    id: d.id,
                    attemptId: d.id,
                    date: data.submittedAt || (data.startedAt?.toDate ? data.startedAt.toDate().toISOString() : data.startedAt) || new Date().toISOString(),
                    durationSeconds: Number(data.durationSeconds) || 0,
                    score,
                    total,
                    passMark,
                    passed: data.passed !== undefined ? Boolean(data.passed) : score >= passMark,
                    percentage: total > 0 ? Math.round((score / total) * 100) : 0,
                    correctCount: score,
                    incorrectCount: Math.max(0, total - score),
                    questions: Array.isArray(data.results) ? data.results : []
                  });
                }
              }
            });
          }

          localExams.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setExamHistory(localExams);

          // Compute basic stats
          const totalExams = localExams.length;
          const passedExams = localExams.filter(e => e.passed).length;
          const failedExams = totalExams - passedExams;
          const passRate = totalExams > 0 ? Math.round((passedExams / totalExams) * 100) : 0;
          const totalScores = localExams.reduce((acc, curr) => acc + curr.score, 0);
          const averageScore = totalExams > 0 ? Number((totalScores / totalExams).toFixed(1)) : 0;
          const averageScorePercent = totalExams > 0 ? Math.round((totalScores / (totalExams * 20)) * 100) : 0;
          const highestScore = totalExams > 0 ? Math.max(...localExams.map(e => e.score)) : 0;
          const lowestScore = totalExams > 0 ? Math.min(...localExams.map(e => e.score)) : 0;

          // Local quizzes
          const localQuizzes: LessonQuizItem[] = [];
          if (progressSnap && !progressSnap.empty) {
            progressSnap.docs.forEach(doc => {
              const p = doc.data();
              localQuizzes.push({
                lessonId: p.lessonId || doc.id,
                lessonTitle: { en: 'Lesson ' + (p.lessonId || doc.id), rw: 'Isomo ' + (p.lessonId || doc.id) },
                category: 'General',
                score: Number(p.score) || 0,
                total: Number(p.total) || 0,
                percent: Number(p.percent) || 0,
                passed: Boolean(p.passed || p.completed),
                attempts: Number(p.attempts) || 1,
                date: p.lastAccessed?.toDate ? p.lastAccessed.toDate().toISOString() : new Date().toISOString()
              });
            });
          }

          setSummary({
            totalExams,
            passedExams,
            failedExams,
            passRate,
            averageScore,
            averageScorePercent,
            highestScore,
            lowestScore,
            averageDurationSeconds: 0,
            totalQuizzes: localQuizzes.length,
            passedQuizzes: localQuizzes.filter(q => q.passed).length
          });
          setLessonQuizzes(localQuizzes);
        } catch (fallbackErr) {
          console.warn("Client fallback failed:", fallbackErr);
        }
      }

    } catch (err) {
      console.error("Error in fetchData:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user.uid]);

  const handleAction = async () => {
    if(!actionData) return;
    try {
      const currentUser = auth.currentUser;
      const token = await currentUser?.getIdToken();
      if (!token) throw new Error("Sign in required");

      const endpoint = actionData.type === 'cancel'
        ? `/api/admin/subscriptions/${actionData.subId}/cancel`
        : `/api/admin/subscriptions/${actionData.subId}/reset-exams`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Failed action');
      }

      await fetchData();
      setActionData(null);
      setSuccessToast(`Subscription ${actionData.type === 'cancel' ? 'cancelled' : 'exams reset'} successfully.`);
    } catch(err: any) { 
      console.error("Error updating subscription:", err);
      alert(`Action failed: ${err.message || 'Unknown error'}`);
    }
  };

  const handleOpenGrantModal = () => {
    setSelectedPlanId(plans[0]?.id || '');
    setCustomDays(plans[0]?.durationDays || 30);
    setGrantNotes('');
    setGrantError(null);
    setShowGrantModal(true);
  };

  const handleSelectPlan = (planId: string) => {
    setSelectedPlanId(planId);
    setGrantError(null);
    const plan = plans.find(p => p.id === planId);
    if (plan) {
      setCustomDays(plan.durationDays);
    }
  };

  const handleGrant = async () => {
    if (!selectedPlanId) {
      setGrantError("Please select a subscription plan.");
      return;
    }
    const plan = plans.find(p => p.id === selectedPlanId);
    if (!plan) {
      setGrantError("Selected plan not found. Please choose another plan.");
      return;
    }

    const durationDays = typeof customDays === 'number' && customDays > 0 ? customDays : plan.durationDays;
    setIsGranting(true);
    setGrantError(null);

    const planNameStr = typeof plan.name === 'string' 
      ? plan.name 
      : (plan.name.en || plan.name.rw || plan.name.fr || 'Standard Pass');

    let grantedSuccessfully = false;

    try {
      const currentUser = auth.currentUser;
      const token = await currentUser?.getIdToken();
      if (token) {
        const response = await fetch('/api/admin/grants', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            targetUserId: user.uid,
            planId: plan.id,
            durationDays,
            customNotes: grantNotes || `Granted by admin ${currentUser?.email || currentUser?.uid || 'admin'}`
          })
        });

        if (response.ok) {
          const resData = await response.json();
          if (resData.success) {
            grantedSuccessfully = true;
          }
        } else {
          const errData = await response.json().catch(() => ({}));
          if (response.status === 409 || errData.error === 'STUDY_PLAN_ACTIVE' || errData.code === 'STUDY_PLAN_ACTIVE') {
            setGrantError(errData.message || "User already has an active study plan expiring soon. Another study plan cannot be granted until it expires.");
            setIsGranting(false);
            return;
          }
          console.warn("Backend grant returned error:", errData);
          setGrantError(errData.message || errData.error || "Failed to grant plan.");
          setIsGranting(false);
          return;
        }
      }
    } catch (apiErr: any) {
      console.warn("Backend API grant attempt threw:", apiErr);
      setGrantError(apiErr.message || "Failed to contact grant endpoint.");
      setIsGranting(false);
      return;
    }

    if (grantedSuccessfully) {
      await fetchData();
      setShowGrantModal(false);
      setSuccessToast(`Successfully granted "${planNameStr}" (${plan.access?.trafficRules || plan.access?.lessonVideos ? `${durationDays} days` : 'Exam Pack'}) to ${user.name || user.email}!`);
    }
    setIsGranting(false);
  };

  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const activeSub = subscriptions
    .filter(s => s.status === 'active' && (!s.endDate || new Date(s.endDate) > new Date()) && (!s.examLimit || (s.examsUsed ?? 0) < s.examLimit))
    .sort((a, b) => {
      const aTime = a.endDate ? new Date(a.endDate).getTime() : Infinity;
      const bTime = b.endDate ? new Date(b.endDate).getTime() : Infinity;
      return bTime - aTime;
    })[0];

  const filteredExams = examHistory.filter(exam => {
    if (examFilter === 'passed') return exam.passed;
    if (examFilter === 'failed') return !exam.passed;
    return true;
  });

  const pageSize = 5;
  const totalFiltered = filteredExams.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = totalFiltered === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFiltered);
  const paginatedExams = filteredExams.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="min-h-[44px] flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Learners
        </button>
      </div>

      {successToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-600 hover:text-emerald-900 font-bold px-2">×</button>
        </div>
      )}

      {/* User Header Profile Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{user.name || 'Learner'}</h2>
          <div className="text-slate-500 text-sm mt-0.5">{user.email} • {user.phone || 'No phone'}</div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
            <span>Joined: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</span>
            <span>·</span>
            <span>ID: <code className="font-mono text-slate-500">{user.uid.slice(0, 8)}...</code></span>
            <span>·</span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {user.status === 'active' ? 'Active' : 'Suspended'}
            </span>
          </div>
        </div>
        <button 
          onClick={handleOpenGrantModal} 
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-medium text-sm transition-colors shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4"/> Grant Subscription
        </button>
      </div>

      {/* Active Subscription Banner */}
      {activeSub && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center gap-2 text-slate-900">
              <ShieldCheck className="w-5 h-5 text-emerald-600" /> Current Active Subscription
            </h3>
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full">
              ACTIVE
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-xs text-slate-500 font-medium">Plan</div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5">
                {typeof activeSub.planName === 'string' ? activeSub.planName : (activeSub.planName.en || activeSub.planName.rw)}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-xs text-slate-500 font-medium">Expires</div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5">
                {activeSub.endDate ? (
                  `${new Date(activeSub.endDate).toLocaleDateString()} (${Math.max(0, Math.ceil((new Date(activeSub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days left)`
                ) : (
                  'No Expiry (Exam credits)'
                )}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-xs text-slate-500 font-medium">Exams Allowed</div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5">
                {activeSub.examsUsed} / {activeSub.examLimit === null ? 'Unlimited' : activeSub.examLimit}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-2 justify-end">
              <button 
                onClick={() => setActionData({type:'reset', subId: activeSub.id})} 
                className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md font-medium transition-colors"
              >
                Reset Exams
              </button>
              <button 
                onClick={() => setActionData({type:'cancel', subId: activeSub.id})} 
                className="px-3 py-1.5 text-xs bg-red-50 text-red-700 hover:bg-red-100 rounded-md font-medium transition-colors"
              >
                Cancel Sub
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription History Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="font-bold text-lg text-slate-900">Subscription History</h3>
        {subscriptions.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">No subscriptions recorded for this user yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-slate-500 uppercase border-b">
                  <th className="py-2.5 px-3">Plan</th>
                  <th className="py-2.5 px-3">Validity</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Exams</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y text-sm">
                {subscriptions.map(s => {
                  const isCurrentActive = s.status === 'active' && (!s.endDate || new Date(s.endDate) > new Date()) && (!s.examLimit || (s.examsUsed ?? 0) < s.examLimit);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-medium text-slate-900">
                        {typeof s.planName === 'string' ? s.planName : (s.planName.en || s.planName.rw)}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {new Date(s.startDate).toLocaleDateString()} — {s.endDate ? new Date(s.endDate).toLocaleDateString() : 'No expiry'}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {s.source === 'admin_grant' ? 'Admin Grant' : 'Paypack/MoMo'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-mono">
                        {s.examsUsed} / {s.examLimit === null ? '∞' : s.examLimit}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          isCurrentActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {isCurrentActive ? 'Active' : s.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PERFORMANCE & EXAM ANALYTICS SECTION */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" /> Learner Performance & History
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Comprehensive analysis of official mock exams, score evolution, topic accuracy, and practice quizzes.
            </p>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Exams & Pass Rate */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Pass Rate</span>
              <Award className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{summary.passRate}%</span>
              <span className="text-xs text-slate-500">
                ({summary.passedExams} of {summary.totalExams} passed)
              </span>
            </div>
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${summary.passRate >= 70 ? 'bg-emerald-500' : summary.passRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, summary.passRate)}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-500 flex justify-between">
              <span>Passed: {summary.passedExams}</span>
              <span>Failed: {summary.failedExams}</span>
            </div>
          </div>

          {/* Card 2: Average Score */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Average Score</span>
              <BarChart3 className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {summary.averageScore} <span className="text-sm text-slate-500 font-normal">/ 20</span>
              </span>
              <span className="text-xs font-semibold text-blue-600">
                ({summary.averageScorePercent}%)
              </span>
            </div>
            <div className="text-xs text-slate-500 flex items-center justify-between pt-1">
              <span>Pass Mark Requirement:</span>
              <span className="font-semibold text-slate-700 font-mono">12 / 20 (60%)</span>
            </div>
          </div>

          {/* Card 3: Best vs Lowest Score */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Score Range</span>
              <ShieldCheck className="w-4 h-4 text-purple-600" />
            </div>
            <div className="flex items-baseline gap-3">
              <div>
                <div className="text-xs text-slate-400">Peak</div>
                <div className="text-xl font-bold text-emerald-600 font-mono tabular-nums">
                  {summary.highestScore} <span className="text-xs text-slate-500">/ 20</span>
                </div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <div className="text-xs text-slate-400">Lowest</div>
                <div className="text-xl font-bold text-slate-600 font-mono tabular-nums">
                  {summary.lowestScore} <span className="text-xs text-slate-500">/ 20</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 pt-0.5">
              {summary.highestScore >= 12 ? 'Passed at least one exam' : 'Has not reached pass mark yet'}
            </div>
          </div>

          {/* Card 4: Study & Pace */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Avg Pace & Quizzes</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-lg font-bold text-slate-900 font-mono tabular-nums">
              {formatDuration(summary.averageDurationSeconds)}
            </div>
            <div className="text-xs text-slate-600 flex items-center justify-between pt-1">
              <span>Chapter Quizzes:</span>
              <span className="font-semibold font-mono text-slate-900">
                {summary.passedQuizzes} / {summary.totalQuizzes} Passed
              </span>
            </div>
          </div>
        </div>

        {/* History Switcher Tabs */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveHistoryTab('exams')}
                className={`min-h-[38px] px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeHistoryTab === 'exams'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                <Award className="w-4 h-4" />
                <span>Mock Exam History ({examHistory.length})</span>
              </button>
              <button
                onClick={() => setActiveHistoryTab('quizzes')}
                className={`min-h-[38px] px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeHistoryTab === 'quizzes'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Lesson Chapter Quizzes ({lessonQuizzes.length})</span>
              </button>
            </div>

            {activeHistoryTab === 'exams' && examHistory.length > 0 && (
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> Filter:
                </span>
                <button
                  onClick={() => setExamFilter('all')}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    examFilter === 'all' ? 'bg-slate-900 text-white font-medium' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  All ({examHistory.length})
                </button>
                <button
                  onClick={() => setExamFilter('passed')}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    examFilter === 'passed' ? 'bg-emerald-600 text-white font-medium' : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  Passed ({examHistory.filter(e => e.passed).length})
                </button>
                <button
                  onClick={() => setExamFilter('failed')}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    examFilter === 'failed' ? 'bg-red-600 text-white font-medium' : 'text-red-700 hover:bg-red-50'
                  }`}
                >
                  Failed ({examHistory.filter(e => !e.passed).length})
                </button>
              </div>
            )}
          </div>

          {/* TAB 1: Mock Exams Table */}
          {activeHistoryTab === 'exams' && (
            <>
              {filteredExams.length === 0 ? (
                <div className="p-8 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                  <Award className="w-8 h-8 text-slate-300 mx-auto" />
                  <div className="text-sm font-semibold text-slate-700">No mock exams found</div>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {examHistory.length === 0 
                      ? 'This learner has not completed any official mock exams yet. Completed attempts with detailed scores will appear here.'
                      : 'No exams match the selected filter.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="text-xs text-slate-500 uppercase border-b bg-slate-50/50">
                          <th className="py-3 px-4">Date & Time</th>
                          <th className="py-3 px-4">Score & Percentage</th>
                          <th className="py-3 px-4">Result</th>
                          <th className="py-3 px-4">Answers Breakdown</th>
                          <th className="py-3 px-4">Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {paginatedExams.map((exam, idx) => (
                          <tr key={`${exam.id || 'exam'}-${startIndex + idx}`} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4 text-slate-700">
                              <div className="font-medium text-slate-900">
                                {new Date(exam.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                              </div>
                              <div className="text-xs text-slate-400 font-mono">
                                {new Date(exam.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 font-mono tabular-nums text-base">
                                {exam.score} <span className="text-xs text-slate-500 font-normal">/ {exam.total}</span>
                              </div>
                              <div className="text-xs font-semibold text-blue-600">
                                {exam.percentage}%
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                exam.passed 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' 
                                  : 'bg-red-50 text-red-700 border border-red-200/50'
                              }`}>
                                {exam.passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                <span>{exam.passed ? 'PASSED (>=12)' : 'FAILED (<12)'}</span>
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                                  ✓ {exam.correctCount} correct
                                </span>
                                <span className="text-red-700 font-semibold bg-red-50 px-1.5 py-0.5 rounded">
                                  ✕ {exam.incorrectCount} wrong
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 font-mono text-xs">
                              {formatDuration(exam.durationSeconds)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                      <div className="text-slate-600 font-medium">
                        Showing <span className="font-mono font-semibold text-slate-900">{startIndex + 1}–{endIndex}</span> of <span className="font-mono font-semibold text-slate-900">{totalFiltered}</span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                          <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={safePage <= 1}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-25 transition-colors"
                          >
                            Previous
                          </button>
                          <div className="flex items-center px-1 border-x border-slate-100 gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                              .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                              .map((pageNum, idx, arr) => {
                                const prevPageNum = arr[idx - 1];
                                const showEllipsis = prevPageNum && pageNum - prevPageNum > 1;
                                return (
                                  <React.Fragment key={pageNum}>
                                    {showEllipsis && <span className="px-1 text-slate-300">…</span>}
                                    <button
                                      onClick={() => setCurrentPage(pageNum)}
                                      className={`w-7 h-7 flex items-center justify-center rounded-md font-mono text-xs font-semibold transition-colors ${
                                        safePage === pageNum
                                          ? 'bg-slate-900 text-white shadow-2xs'
                                          : 'text-slate-600 hover:bg-slate-100'
                                      }`}
                                    >
                                      {pageNum}
                                    </button>
                                  </React.Fragment>
                                );
                              })}
                          </div>
                          <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={safePage >= totalPages}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-25 transition-colors"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* TAB 2: Lesson Chapter Quizzes */}
          {activeHistoryTab === 'quizzes' && (
            <>
              {lessonQuizzes.length === 0 ? (
                <div className="p-8 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                  <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
                  <div className="text-sm font-semibold text-slate-700">No chapter quizzes recorded</div>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    This learner hasn't completed end-of-lesson practice quizzes yet.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[650px]">
                    <thead>
                      <tr className="text-xs text-slate-500 uppercase border-b bg-slate-50/50">
                        <th className="py-3 px-4">Lesson / Chapter</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Score</th>
                        <th className="py-3 px-4">Result</th>
                        <th className="py-3 px-4">Attempts</th>
                        <th className="py-3 px-4">Last Taken</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {lessonQuizzes.map((quiz, qIdx) => (
                        <tr key={qIdx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            {getLocalizedText(quiz.lessonTitle, quiz.lessonId)}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            {quiz.category || 'General'}
                          </td>
                          <td className="py-3.5 px-4 font-mono">
                            <span className="font-bold text-slate-900">{quiz.score}</span>
                            <span className="text-slate-400 text-xs"> / {quiz.total}</span>
                            <span className="text-xs font-semibold text-blue-600 ml-1.5">({quiz.percent}%)</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              quiz.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                            }`}>
                              {quiz.passed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              <span>{quiz.passed ? 'Passed (>=70%)' : 'Needs Practice'}</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 font-mono text-xs">
                            {quiz.attempts} attempt{quiz.attempts > 1 ? 's' : ''}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-500 font-mono">
                            {new Date(quiz.date).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Grant Subscription Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Grant Subscription</h3>
                <p className="text-xs text-slate-500 mt-0.5">Activate a learning package for {user.name || user.email}</p>
              </div>
              <button 
                onClick={() => setShowGrantModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {grantError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{grantError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Select Subscription Plan <span className="text-red-500">*</span>
                </label>
                <select 
                  value={selectedPlanId} 
                  onChange={e => handleSelectPlan(e.target.value)} 
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">-- Choose a Plan --</option>
                  {plans.map(p => {
                    const name = typeof p.name === 'string' ? p.name : (p.name.en || p.name.rw || 'Plan');
                    return (
                      <option key={p.id} value={p.id}>
                        {name} — {p.price.toLocaleString()} RWF ({p.durationDays} days)
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedPlan && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Plan Details</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500">Duration:</span>{' '}
                      <span className="font-semibold text-slate-800">{selectedPlan.durationDays} Days</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Exam Limit:</span>{' '}
                      <span className="font-semibold text-slate-800">
                        {selectedPlan.examLimit === null ? 'Unlimited' : `${selectedPlan.examLimit} Exams`}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Lessons:</span>{' '}
                      <span className="font-semibold text-slate-800">{selectedPlan.access?.trafficRules ? 'Included' : 'No'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Videos:</span>{' '}
                      <span className="font-semibold text-slate-800">{selectedPlan.access?.lessonVideos ? 'Included' : 'No'}</span>
                    </div>
                  </div>
                </div>
              )}

              {(() => {
                const activeStudySub = subscriptions.find(s => s.status === 'active' && Boolean(s.access?.trafficRules || s.access?.lessonVideos) && s.endDate && new Date(s.endDate) > new Date());
                const isSelectedStudy = Boolean(selectedPlan?.access?.trafficRules || selectedPlan?.access?.lessonVideos);
                const isGrantBlocked = Boolean(activeStudySub && isSelectedStudy);

                return (
                  <>
                    {isGrantBlocked && (
                      <div className="p-3 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-xs font-medium flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>User has an active study plan until {new Date(activeStudySub!.endDate!).toLocaleDateString()}. Another study plan cannot be granted. Select an Exam Pack to grant exam credits.</span>
                      </div>
                    )}

                    {isSelectedStudy ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Custom Duration (Days)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={customDays}
                            onChange={e => setCustomDays(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                            placeholder="e.g. 30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Calculated Expiry
                          </label>
                          <div className="p-2 bg-slate-100 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5 h-[38px]">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            {new Date(Date.now() + (Number(customDays) || 30) * 24 * 60 * 60 * 1000).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg text-xs font-medium">
                        ✓ Exam Pack: No time validity. Learner receives {selectedPlan?.examLimit || 5} mock exam credits that stop working only when count is depleted.
                      </div>
                    )}
                  </>
                );
              })()}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Admin Note (Optional)
                </label>
                <input
                  type="text"
                  value={grantNotes}
                  onChange={e => setGrantNotes(e.target.value)}
                  placeholder="e.g. Granted by supervisor for in-person training"
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2.5">
              <button 
                type="button"
                disabled={isGranting}
                onClick={() => setShowGrantModal(false)} 
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              {(() => {
                const activeStudySub = subscriptions.find(s => s.status === 'active' && Boolean(s.access?.trafficRules || s.access?.lessonVideos) && s.endDate && new Date(s.endDate) > new Date());
                const isSelectedStudy = Boolean(selectedPlan?.access?.trafficRules || selectedPlan?.access?.lessonVideos);
                const isGrantBlocked = Boolean(activeStudySub && isSelectedStudy);

                return (
                  <button 
                    type="button"
                    disabled={isGranting || !selectedPlanId || isGrantBlocked}
                    onClick={handleGrant} 
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
                  >
                    {isGranting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Granting...
                      </>
                    ) : isGrantBlocked ? (
                      'Active Study Plan Running'
                    ) : (
                      'Grant Subscription'
                    )}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={!!actionData} 
        title="Confirm Action" 
        message={`Are you sure you want to ${actionData?.type === 'cancel' ? 'cancel this subscription' : 'reset exams used to 0'}?`} 
        confirmText="Confirm" 
        onConfirm={handleAction} 
        onClose={() => setActionData(null)} 
      />
    </div>
  );
};
