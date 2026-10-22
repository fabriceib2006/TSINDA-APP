import React, { useEffect, useState } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { UserProfile, Subscription, Plan, ExamAttempt } from '../../types';
import { normalizeSubscription, normalizePlan } from '../../lib/subscriptionUtils';
import { ArrowLeft, Plus, CheckCircle, XCircle, Loader2, AlertCircle, Calendar, ShieldCheck } from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';

interface UserDetailsProps {
  user: UserProfile;
  onBack: () => void;
}

export const UserDetails: React.FC<UserDetailsProps> = ({ user, onBack }) => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [examAttempts, setExamAttempts] = useState<ExamAttempt[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [actionData, setActionData] = useState<{type: 'cancel'|'reset', subId: string}|null>(null);
  
  // Grant modal state
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [customDays, setCustomDays] = useState<number | ''>('');
  const [grantNotes, setGrantNotes] = useState('');
  const [isGranting, setIsGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Plans (Try Firestore collection, then query filter, then backend API /api/plans)
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

      // 3. Fetch Exam Attempts from user subcollection (with legacy root fallback)
      try {
        let examsSnap = await getDocs(collection(db, 'users', user.uid, 'examAttempts')).catch(() => null);
        if (!examsSnap || examsSnap.empty) {
          examsSnap = await getDocs(query(collection(db, 'examAttempts'), where('userId', '==', user.uid))).catch(() => null);
        }
        if (examsSnap && !examsSnap.empty) {
          setExamAttempts(examsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ExamAttempt)));
        }
      } catch (examErr) {
        console.warn("Failed fetching exam attempts:", examErr);
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

    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    let grantedSuccessfully = false;

    // 1. Backend API endpoint with admin authentication
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="min-h-[44px] flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back to Learners
        </button>
      </div>

      {successToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-600 hover:text-emerald-900 font-bold px-2">×</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{user.name || 'Student'}</h2>
          <div className="text-slate-500 text-sm">{user.email} • {user.phone || 'No phone'}</div>
          <div className="text-sm mt-2 flex items-center gap-2">
            Status: 
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>
              {user.status}
            </span>
          </div>
        </div>
        <button 
          onClick={handleOpenGrantModal} 
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-medium text-sm transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4"/> Grant Subscription
        </button>
      </div>

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
                className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md font-medium"
              >
                Reset Exams
              </button>
              <button 
                onClick={() => setActionData({type:'cancel', subId: activeSub.id})} 
                className="px-3 py-1.5 text-xs bg-red-50 text-red-700 hover:bg-red-100 rounded-md font-medium"
              >
                Cancel Sub
              </button>
            </div>
          </div>
        </div>
      )}

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
                      <td className="py-3 px-3 text-slate-600">
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="font-bold text-lg text-slate-900">Exam History</h3>
        {examAttempts.filter(e => e.status === 'completed').length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">No exams completed yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-slate-500 uppercase border-b">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Score</th>
                  <th className="py-2.5 px-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y text-sm">
                {examAttempts
                  .filter(e => e.status === 'completed')
                  .sort((a, b) => new Date(b.finishedAt || '').getTime() - new Date(a.finishedAt || '').getTime())
                  .map(exam => (
                    <tr key={exam.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 text-slate-600">{new Date(exam.finishedAt || '').toLocaleDateString()}</td>
                      <td className="py-3 px-3 font-medium text-slate-900">{exam.score} / 20</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          exam.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {exam.passed ? 'Pass (>=12)' : 'Fail'}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
