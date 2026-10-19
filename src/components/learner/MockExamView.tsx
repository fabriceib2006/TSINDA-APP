import React, { useEffect, useState } from 'react';
import { db, functions } from '../../lib/firebase';
import { collection, getDocs, doc, query, where, addDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { Question, ExamSettings, Language, Subscription, CombinedAccess, ExamAttempt } from '../../types';
import { normalizeSubscription, getCombinedAccess } from '../../lib/subscriptionUtils';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { 
  Clock, 
  ArrowLeft, 
  Award, 
  HelpCircle, 
  Lock, 
  CheckCircle2, 
  XCircle, 
  Play, 
  RotateCcw,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { SubscriptionModal } from './SubscriptionModal';
import { getLocalizedQuestionText, getLocalizedQuestionOptions, getLocalizedQuestionExplanation, NotTranslatedBadge } from '../../lib/i18n';

interface ExamResult {
  id?: string;
  userId: string;
  score: number;
  total: number;
  passMark: number;
  passed: boolean;
  date: string;
  answers: { question: Question; selectedIndex: number; correct: boolean }[];
}

export interface ServerExamReviewItem {
  questionId: string;
  questionIndex: number;
  correctIndex: number;
  studentAnswer: number | null;
  isCorrect: boolean;
}

export interface ServerExamResult {
  success?: boolean;
  score: number;
  passed: boolean;
  total: number;
  passMark: number;
  expired?: boolean;
  review: ServerExamReviewItem[];
}

export const MockExamView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { userProfile } = useAuth();
  const { language } = useLanguage();
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [settings, setSettings] = useState<ExamSettings>({ id: 'global', numQuestions: 20, durationMinutes: 20, passMark: 12 });
  const [access, setAccess] = useState<CombinedAccess | null>(null);
  
  // Exam state
  const [examState, setExamState] = useState<'ready' | 'running' | 'submitted'>('ready');
  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null);
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [isResumed, setIsResumed] = useState(false);
  const [serverResult, setServerResult] = useState<ServerExamResult | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(20 * 60); // seconds
  const [loading, setLoading] = useState(true);
  const [reviewMode, setReviewMode] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const initData = async () => {
    if (!userProfile) return;
    setLoading(true);

    try {
      // 1. Fetch Exam Settings
      const setSnap = await getDocs(collection(db, 'examSettings')).catch(() => null);
      let numQ = 20;
      let durMin = 20;
      let pass = 12;
      if (setSnap && !setSnap.empty) {
        const s = setSnap.docs[0].data() as ExamSettings;
        numQ = s.numQuestions || 20;
        durMin = s.durationMinutes || 20;
        pass = s.passMark || 12;
        setSettings(s);
      }

      // 2. Fetch User Subscriptions & Compute Combined Access
      const subsSnap = await getDocs(
        query(collection(db, 'subscriptions'), where('userId', '==', userProfile.uid))
      ).catch(() => null);

      let combined: CombinedAccess;
      if (subsSnap) {
        const subs = subsSnap.docs.map(d => normalizeSubscription(d.data(), d.id));
        combined = getCombinedAccess(subs);
        setAccess(combined);
      } else {
        combined = getCombinedAccess([]);
        setAccess(combined);
      }

      // 3. Fetch all published questions
      const qSnap = await getDocs(collection(db, 'questions')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, 'questions');
        return null;
      });

      let publishedQuestions: Question[] = [];
      if (qSnap) {
        publishedQuestions = qSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Question))
          .filter(q => q.isPublished);
        setAllQuestions(publishedQuestions);
      }

      // 4. Check for existing in_progress attempt to resume!
      const attemptsSnap = await getDocs(
        query(
          collection(db, 'examAttempts'),
          where('userId', '==', userProfile.uid),
          where('status', '==', 'in_progress')
        )
      ).catch(() => null);

      if (attemptsSnap && !attemptsSnap.empty) {
        const attemptDoc = attemptsSnap.docs[0];
        const attemptData = attemptDoc.data() as ExamAttempt;
        const startedTime = new Date(attemptData.startedAt).getTime();
        const durationSeconds = (attemptData.durationMinutes || durMin) * 60;
        const elapsedSeconds = Math.floor((Date.now() - startedTime) / 1000);

        if (elapsedSeconds >= durationSeconds) {
          // Attempt expired while user was away: auto-submit it
          await handleFinalizeExpiredAttempt(attemptDoc.id, attemptData, publishedQuestions, pass);
        } else {
          // Resume the in-progress attempt!
          setCurrentAttemptId(attemptDoc.id);
          setActiveSubId(attemptData.subscriptionId || combined.activeSubscriptionId);
          setTimeLeft(durationSeconds - elapsedSeconds);
          setIsResumed(true);

          // Restore questions list
          let restoredQuestions: Question[] = [];
          if (attemptData.questionIds && attemptData.questionIds.length > 0) {
            restoredQuestions = attemptData.questionIds
              .map(id => publishedQuestions.find(q => q.id === id))
              .filter(Boolean) as Question[];
          }
          if (restoredQuestions.length === 0) {
            restoredQuestions = publishedQuestions.slice(0, numQ);
          }
          setExamQuestions(restoredQuestions);
          if (attemptData.userAnswers) {
            setUserAnswers(attemptData.userAnswers);
          }
          setExamState('running');
        }
      }
    } catch (err) {
      console.error("Error initializing exam view:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initData();
  }, [userProfile]);

  // Handle auto-finalizing an attempt that expired offline
  const handleFinalizeExpiredAttempt = async (
    attemptId: string, 
    attempt: ExamAttempt, 
    allQ: Question[], 
    _passMark: number
  ) => {
    try {
      const qIds = attempt.questionIds || [];
      const questionsList = qIds.map(id => allQ.find(q => q.id === id)).filter(Boolean) as Question[];

      // Finalize attempt on server via submitExam Cloud Function (never touches subscriptions directly)
      const submitExamCallable = httpsCallable<
        { attemptId: string },
        ServerExamResult
      >(functions, 'submitExam');

      const res = await submitExamCallable({
        attemptId,
      });

      if (res.data) {
        setServerResult(res.data);
      }

      // Show submitted view
      setExamQuestions(questionsList);
      setUserAnswers(attempt.userAnswers || {});
      setExamState('submitted');
    } catch (e) {
      console.error("Error finalizing expired attempt:", e);
    }
  };

  // Timer countdown while exam is running
  useEffect(() => {
    if (examState !== 'running' || loading) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [examState, loading, examQuestions, userAnswers, currentAttemptId, activeSubId]);

  // Start a fresh exam attempt
  const handleStartExam = async () => {
    if (!userProfile || !access) return;

    // Verify exam limits
    if (!access.isUnlimitedExams && access.examsRemaining !== null && access.examsRemaining <= 0) {
      setIsSubModalOpen(true);
      return;
    }

    setLoading(true);
    try {
      // Pick random published questions
      const shuffled = [...allQuestions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, settings.numQuestions);

      // Call startExam Cloud Function (creates attempt and increments examsUsed atomically on server)
      const startExamCallable = httpsCallable<
        { questionIds: string[] },
        {
          resumed: boolean;
          attemptId: string;
          startedAt: string;
          expiresAt?: string;
          durationMinutes: number;
          numQuestions?: number;
          passMark?: number;
          attempt?: any;
        }
      >(functions, 'startExam');

      const result = await startExamCallable({
        questionIds: selected.map(q => q.id),
      });

      const resData = result.data;
      if (resData.resumed && resData.attempt) {
        const existing = resData.attempt;
        const qIds = existing.questionIds || [];
        const questionsList = qIds.map((id: string) => allQuestions.find(q => q.id === id)).filter(Boolean) as Question[];
        setExamQuestions(questionsList.length > 0 ? questionsList : selected);
        setUserAnswers(existing.userAnswers || {});
        setCurrentIndex(0);
        setCurrentAttemptId(resData.attemptId);
        setActiveSubId(existing.subscriptionId || '');
        const expiresAtTime = resData.expiresAt
          ? new Date(resData.expiresAt).getTime()
          : (new Date(resData.startedAt).getTime() + (resData.durationMinutes || 20) * 60 * 1000);
        const remaining = Math.max(0, Math.floor((expiresAtTime - Date.now()) / 1000));
        setTimeLeft(remaining);
      } else {
        setExamQuestions(selected);
        setUserAnswers({});
        setCurrentIndex(0);
        const dur = resData.durationMinutes || settings.durationMinutes;
        setTimeLeft(dur * 60);
        setCurrentAttemptId(resData.attemptId);
        setActiveSubId(access.activeSubscriptionId || '');
      }

      setServerResult(null);
      setExamState('running');
    } catch (err) {
      console.error("Error starting exam attempt:", err);
    } finally {
      setLoading(false);
    }
  };

  // Answer selection: updates local state and saves to attempt via saveAnswer callable
  const handleSelectOption = (idx: number) => {
    if (examState !== 'running') return;
    const updated = { ...userAnswers, [currentIndex]: idx };
    setUserAnswers(updated);

    // Persist answer on server via saveAnswer callable
    if (currentAttemptId) {
      const saveAnswerCallable = httpsCallable<
        { attemptId: string; questionIndex: number; optionIndex: number },
        { success: boolean }
      >(functions, 'saveAnswer');

      saveAnswerCallable({
        attemptId: currentAttemptId,
        questionIndex: currentIndex,
        optionIndex: idx,
      }).catch(err => {
        console.error("Error saving answer via saveAnswer callable:", err);
      });
    }
  };

  // Submit Exam on server via submitExam callable
  const handleSubmitExam = async () => {
    if (submitting || examState === 'submitted' || !userProfile || !currentAttemptId) return;
    setSubmitting(true);

    try {
      // Finalize attempt on server via submitExam Cloud Function (never touches subscriptions directly)
      const submitExamCallable = httpsCallable<
        { attemptId: string },
        ServerExamResult
      >(functions, 'submitExam');

      const res = await submitExamCallable({
        attemptId: currentAttemptId,
      });

      const serverRes = res.data;
      if (serverRes) {
        setServerResult(serverRes);

        const evaluatedAnswers = serverRes.review.map(r => {
          const q = examQuestions[r.questionIndex] || allQuestions.find(item => item.id === r.questionId);
          return {
            question: q as Question,
            selectedIndex: r.studentAnswer ?? -1,
            correct: r.isCorrect,
          };
        }).filter(a => !!a.question);

        // Also create record in examResults for learner history
        const resultData: Omit<ExamResult, 'id'> = {
          userId: userProfile.uid,
          score: serverRes.score,
          total: serverRes.total,
          passMark: serverRes.passMark,
          passed: serverRes.passed,
          date: new Date().toISOString(),
          answers: evaluatedAnswers,
        };
        await addDoc(collection(db, 'examResults'), resultData).catch(err => {
          handleFirestoreError(err, OperationType.CREATE, 'examResults');
        });
      }

      setExamState('submitted');
    } catch (err) {
      console.error("Error finalizing exam:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-6 bg-slate-200 rounded w-28 animate-pulse"></div>
          <div className="h-8 bg-slate-200 rounded-xl w-24 animate-pulse"></div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-8 space-y-6 animate-pulse">
          <div className="h-4 bg-slate-100 rounded w-32"></div>
          <div className="h-6 bg-slate-200 rounded w-3/4"></div>
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-[10px]"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 1. Access Check: No active subscription OR exams access false
  if (!access?.hasActiveSubscription || !access.exams) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-xl border border-slate-200 p-8 text-center space-y-6 shadow-sm">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-900">National Exam Locked</h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            {access?.hasActiveSubscription 
              ? "Your current active subscription plan does not include Rwanda National Gazette exam simulations."
              : "Upgrade to a TSINDA study pass to unlock timed 20-question exam simulations."}
          </p>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => setIsSubModalOpen(true)}
            className="w-full min-h-[44px] px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] shadow-sm transition-colors text-sm"
          >
            Upgrade Plan
          </button>
          <button
            onClick={onBack}
            className="w-full min-h-[44px] px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[10px] transition-colors text-sm"
          >
            Back to Dashboard
          </button>
        </div>
        <SubscriptionModal
          isOpen={isSubModalOpen}
          onClose={() => setIsSubModalOpen(false)}
          onSubscribed={initData}
        />
      </div>
    );
  }

  // 2. Exam Limit Check: examsUsed >= examLimit
  if (!access.isUnlimitedExams && access.examsRemaining !== null && access.examsRemaining <= 0) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-xl border border-slate-200 p-8 text-center space-y-6 shadow-sm">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-900">Exam limit reached, upgrade your plan</h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            You have used all {access.totalExamsAllowed} completed mock exams included with your current pass.
          </p>
          <p className="text-xs text-slate-400">
            Exams used: {access.examsUsed} of {access.totalExamsAllowed} • Expiry: {new Date(access.earliestExpiryDate || '').toLocaleDateString()}
          </p>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => setIsSubModalOpen(true)}
            className="w-full min-h-[44px] px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] shadow-sm transition-colors text-sm"
          >
            Upgrade Your Plan
          </button>
          <button
            onClick={onBack}
            className="w-full min-h-[44px] px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[10px] transition-colors text-sm"
          >
            Back to Dashboard
          </button>
        </div>
        <SubscriptionModal
          isOpen={isSubModalOpen}
          onClose={() => setIsSubModalOpen(false)}
          onSubscribed={initData}
        />
      </div>
    );
  }

  // 3. Question Bank Validation
  if (allQuestions.length < settings.numQuestions && examState === 'ready') {
    return (
      <div className="space-y-6">
        <button onClick={onBack} className="min-h-[44px] flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> 
          <span>Back to Dashboard</span>
        </button>
        <div className="bg-white rounded-xl border border-slate-200 p-10 sm:p-14 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto">
            <HelpCircle className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 text-base">Question bank not ready</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Need at least {settings.numQuestions} published questions to launch a national theory simulation.
          </p>
        </div>
      </div>
    );
  }

  // 4. Initial Ready Screen (Before starting)
  if (examState === 'ready') {
    const expiryFormatted = access.earliestExpiryDate 
      ? new Date(access.earliestExpiryDate).toLocaleDateString()
      : 'Active';

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <button
          onClick={onBack}
          className="min-h-[44px] flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> 
          <span>Back to Dashboard</span>
        </button>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
              <Award className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Rwanda National Theory Exam Simulation</h2>
              <p className="text-xs sm:text-sm text-slate-500">Official format governed by the Rwanda National Police traffic code.</p>
            </div>
          </div>

          {/* Learner Plan & Exam Usage Stats */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase">Exam Usage Status</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                Exams used: {access.examsUsed} of {access.isUnlimitedExams ? 'Unlimited' : access.totalExamsAllowed}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xs text-slate-500 font-semibold uppercase">Plan Expiry Date</div>
              <div className="text-sm font-bold text-blue-600 mt-0.5">{expiryFormatted}</div>
            </div>
          </div>

          {/* Exam Parameters */}
          <div className="grid grid-cols-3 gap-3 p-4 bg-white rounded-xl border border-slate-200 text-center">
            <div>
              <span className="text-xs text-slate-400 block font-semibold uppercase">Questions</span>
              <span className="text-lg sm:text-xl font-bold text-slate-900">{settings.numQuestions}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-semibold uppercase">Duration</span>
              <span className="text-lg sm:text-xl font-bold text-blue-600">{settings.durationMinutes} min</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-semibold uppercase">Pass Mark</span>
              <span className="text-lg sm:text-xl font-bold text-emerald-600">{settings.passMark} / {settings.numQuestions}</span>
            </div>
          </div>

          <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
            <p>• Once you click Start, the official timer starts ticking immediately.</p>
            <p>• If you disconnect or refresh, your in-progress exam attempt will be resumed automatically.</p>
            <p>• When the timer expires or you click Submit, your attempt will be scored and counted towards your subscription limit.</p>
          </div>

          <button
            onClick={handleStartExam}
            className="w-full min-h-[44px] py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-[10px] shadow-sm transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start National Exam</span>
          </button>
        </div>
      </div>
    );
  }

  // 5. Exam Submitted / Results Screen
  if (examState === 'submitted') {
    const finalScore = serverResult ? serverResult.score : 0;
    const finalTotal = serverResult ? serverResult.total : examQuestions.length;
    const finalPassMark = serverResult ? serverResult.passMark : settings.passMark;
    const passed = serverResult ? serverResult.passed : false;
    const isExpired = serverResult?.expired;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 text-center space-y-6">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${passed ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
            <Award className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {passed ? "Congratulations! Passed" : "Exam Not Passed"}
            </h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              {passed 
                ? "You have achieved the required passing score according to Rwanda Gazette criteria." 
                : `You did not achieve the required passing mark of ${finalPassMark}. Review the official answers and try again.`}
            </p>
            {isExpired && (
              <div className="inline-block mt-2 px-3 py-1 bg-amber-50 text-amber-800 text-xs font-semibold rounded-full border border-amber-200">
                Exam time expired &mdash; finalized with saved answers
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase">Your Score</div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">{finalScore} / {finalTotal}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase">Pass Mark</div>
              <div className="text-xl sm:text-2xl font-bold text-blue-600 mt-1">{finalPassMark}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase">Status</div>
              <div className={`text-xl sm:text-2xl font-bold mt-1 ${passed ? 'text-emerald-600' : 'text-red-600'}`}>
                {passed ? 'PASS' : 'FAIL'}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setReviewMode(true)}
              className="flex-1 min-h-[44px] py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-[10px] text-sm transition-colors"
            >
              Review Answers & Explanations
            </button>
            <button
              onClick={() => {
                setExamState('ready');
                setServerResult(null);
                setUserAnswers({});
                setReviewMode(false);
                initData();
              }}
              className="flex-1 min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-sm transition-colors"
            >
              Take Another Exam
            </button>
            <button
              onClick={onBack}
              className="min-h-[44px] py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[10px] text-sm transition-colors"
            >
              Dashboard
            </button>
          </div>
        </div>

        {reviewMode && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Review Questions & Explanations</h3>
            {(serverResult?.review && serverResult.review.length > 0
              ? serverResult.review
              : examQuestions.map((q, idx) => ({
                  questionId: q.id,
                  questionIndex: idx,
                  correctIndex: q.correctIndex,
                  studentAnswer: userAnswers[idx] ?? null,
                  isCorrect: userAnswers[idx] === q.correctIndex,
                }))
            ).map((rev) => {
              const q = examQuestions[rev.questionIndex] || allQuestions.find(item => item.id === rev.questionId);
              if (!q) return null;
              const selected = rev.studentAnswer;
              const isCorrect = rev.isCorrect;
              const correctIdx = rev.correctIndex;
              return (
                <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">Question {rev.questionIndex + 1}</span>
                    <span className={`px-2 py-0.5 rounded-full font-bold ${isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                  </div>
                  {(() => {
                    const locText = getLocalizedQuestionText(q, language as Language);
                    const locOpts = getLocalizedQuestionOptions(q, language as Language);
                    const locExp = getLocalizedQuestionExplanation(q, language as Language);

                    return (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{locText.text}</p>
                          {locText.isFallback && <NotTranslatedBadge />}
                        </div>
                        <div className="space-y-1.5 text-xs">
                          {locOpts.isFallback && (
                            <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50/70 px-2 py-1 rounded border border-amber-200/50">
                              <NotTranslatedBadge />
                              <span>Options in English (translation pending)</span>
                            </div>
                          )}
                          {locOpts.options.map((opt, oIdx) => (
                            <div
                              key={oIdx}
                              className={`p-2.5 rounded-lg border ${
                                oIdx === correctIdx
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                  : oIdx === selected
                                  ? 'bg-red-50 border-red-300 text-red-900 line-through'
                                  : 'border-slate-100 text-slate-600'
                              }`}
                            >
                              {String.fromCharCode(65 + oIdx)}. {opt}
                            </div>
                          ))}
                        </div>
                        {locExp.explanation && (
                          <div className="p-3 bg-blue-50/70 rounded-lg text-xs text-blue-900 border border-blue-100 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <strong>Rwanda Gazette Note:</strong>
                              {locExp.isFallback && <NotTranslatedBadge />}
                            </div>
                            <p>{locExp.explanation}</p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 6. Running Exam Screen
  const currentQ = examQuestions[currentIndex];
  if (!currentQ) return null;

  const answeredCount = Object.keys(userAnswers).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Header with Timer & Resume Alert */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900">National Exam</span>
          {isResumed && (
            <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              Resumed Attempt
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500 font-medium">
            Answered: <strong>{answeredCount}</strong> of {examQuestions.length}
          </span>
          <div className={`min-h-[44px] px-4 py-2 rounded-xl flex items-center gap-2 font-mono font-bold text-sm shadow-xs ${
            timeLeft < 300 ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse' : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            <Clock className="w-4 h-4" />
            <span>{formatTime(timeLeft)}</span>
          </div>
        </div>
      </div>

      {/* Progress Dots Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {examQuestions.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`min-h-[32px] min-w-[32px] rounded-lg text-xs font-bold transition-all ${
              currentIndex === i
                ? 'bg-blue-600 text-white shadow-xs scale-105'
                : userAnswers[i] !== undefined
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Current Question Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between text-xs text-slate-500 pb-4 border-b border-slate-100">
          <span className="font-bold text-blue-600 uppercase tracking-wider">
            Question {currentIndex + 1} of {examQuestions.length}
          </span>
          <span className="bg-slate-100 text-slate-700 font-semibold px-2.5 py-1 rounded-full">
            {currentQ.category}
          </span>
        </div>

        {/* Image thumbnail if question has image */}
        {currentQ.imageUrl && (
          <div className="flex justify-center p-3 bg-slate-50 rounded-xl border border-slate-100">
            <img src={currentQ.imageUrl} alt="Exam illustration" className="max-h-56 object-contain rounded-lg" />
          </div>
        )}

        {(() => {
          const locText = getLocalizedQuestionText(currentQ, language as Language);
          const locOpts = getLocalizedQuestionOptions(currentQ, language as Language);

          return (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                  {locText.text}
                </h2>
                {locText.isFallback && <NotTranslatedBadge />}
              </div>

              {/* Options Selection */}
              <div className="space-y-3">
                {locOpts.isFallback && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50/70 px-3 py-1.5 rounded-lg border border-amber-200/60 mb-1">
                    <NotTranslatedBadge />
                    <span>Options in English (translation pending)</span>
                  </div>
                )}
                {locOpts.options.map((option, idx) => {
                  const isSelected = userAnswers[currentIndex] === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectOption(idx)}
                      className={`w-full min-h-[44px] p-4 text-left rounded-[10px] border transition-all text-sm flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/70 font-semibold text-blue-900 ring-2 ring-blue-600/20'
                          : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50/60 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span>{option}</span>
                      </div>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <button
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex(i => i - 1)}
            className="min-h-[44px] px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-[10px] transition-colors disabled:opacity-30"
          >
            ← Previous
          </button>

          <div className="flex items-center gap-3">
            {currentIndex < examQuestions.length - 1 ? (
              <button
                onClick={() => setCurrentIndex(i => i + 1)}
                className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-sm shadow-sm transition-colors"
              >
                Next →
              </button>
            ) : (
              <button
                disabled={submitting}
                onClick={handleSubmitExam}
                className="min-h-[44px] px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-[10px] text-sm shadow-sm transition-colors disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit National Exam"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
