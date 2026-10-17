import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { UserProfile, Subscription, Plan, ExamAttempt } from '../../types';
import { normalizeSubscription } from '../../lib/subscriptionUtils';
import { ArrowLeft, Plus, CheckCircle, XCircle } from 'lucide-react';
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
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const fetchData = async () => {
    try {
      const [subsSnap, examsSnap, plansSnap] = await Promise.all([
        getDocs(query(collection(db, 'subscriptions'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'examAttempts'), where('userId', '==', user.uid))),
        getDocs(collection(db, 'plans'))
      ]);

      setSubscriptions(subsSnap.docs.map(d => normalizeSubscription(d.data(), d.id)));
      setExamAttempts(examsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ExamAttempt)));
      setPlans(plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as Plan)).filter(p => p.isActive));
    } catch (err) {
      console.error("Error fetching user data:", err);
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
      if (actionData.type === 'cancel') {
        await updateDoc(doc(db, 'subscriptions', actionData.subId), { status: 'cancelled' });
      } else if (actionData.type === 'reset') {
        await updateDoc(doc(db, 'subscriptions', actionData.subId), { examsUsed: 0 });
      }
      await addDoc(collection(db, 'adminLogs'), { userId: user.uid, action: actionData.type, timestamp: new Date().toISOString() });
      fetchData();
      setActionData(null);
    } catch(err) { console.error(err); }
  }

  const handleGrant = async () => {
    if(!selectedPlanId) return;
    const plan = plans.find(p => p.id === selectedPlanId);
    if(!plan) return;
    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString();
    
    await addDoc(collection(db, 'subscriptions'), {
        userId: user.uid,
        planId: plan.id,
        planName: plan.name,
        price: plan.price,
        durationDays: plan.durationDays,
        startDate,
        endDate,
        access: plan.access,
        examLimit: plan.examLimit,
        examsUsed: 0,
        status: 'active',
        source: 'admin_grant',
        grantedBy: 'admin'
    });
    setShowGrantModal(false);
    fetchData();
  }

  const activeSub = subscriptions.filter(s => s.status === 'active').sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())[0];

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="min-h-[44px] flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to Learners
      </button>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex justify-between items-center">
        <div>
            <h2 className="text-xl font-bold">{user.name}</h2>
            <div className="text-slate-500">{user.email} • {user.phone}</div>
            <div className="text-sm mt-2">Status: <span className={user.status === 'active' ? 'text-emerald-600':'text-red-600'}>{user.status}</span></div>
        </div>
        <button onClick={() => setShowGrantModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg"><Plus className="w-4 h-4"/> Grant Subscription</button>
      </div>

      {activeSub && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-lg">Current Subscription</h3>
            <div className="grid grid-cols-2 gap-4">
                <div><div className="text-xs text-slate-500">Plan</div><div>{typeof activeSub.planName === 'string' ? activeSub.planName : (activeSub.planName.en || activeSub.planName.rw)}</div></div>
                <div><div className="text-xs text-slate-500">Expires</div><div>{new Date(activeSub.endDate).toLocaleDateString()}</div></div>
                <div><div className="text-xs text-slate-500">Exams Used</div><div>{activeSub.examsUsed} / {activeSub.examLimit || '∞'}</div></div>
                <div className="flex gap-2">
                    <button onClick={() => setActionData({type:'reset', subId: activeSub.id})} className="text-xs text-blue-600">Reset Exams</button>
                    <button onClick={() => setActionData({type:'cancel', subId: activeSub.id})} className="text-xs text-red-600">Cancel</button>
                </div>
            </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-lg">Subscription History</h3>
          <table className="w-full text-left">
            <thead><tr className="text-xs text-slate-500 uppercase border-b"><th className="py-2">Plan</th><th className="py-2">Dates</th><th className="py-2">Status</th></tr></thead>
            <tbody className="divide-y">
                {subscriptions.map(s => <tr key={s.id} className="text-sm"><td className="py-2">{typeof s.planName === 'string' ? s.planName : (s.planName.en || s.planName.rw)}</td><td className="py-2">{new Date(s.startDate).toLocaleDateString()} - {new Date(s.endDate).toLocaleDateString()}</td><td className="py-2">{s.status}</td></tr>)}
            </tbody>
          </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-lg">Exam History</h3>
          <table className="w-full text-left">
              <thead><tr className="text-xs text-slate-500 uppercase border-b">
                <th className="py-2">Date</th><th className="py-2">Score</th><th className="py-2">Result</th>
              </tr></thead>
              <tbody className="divide-y">
                  {examAttempts.filter(e => e.status === 'completed').sort((a, b) => new Date(b.finishedAt || '').getTime() - new Date(a.finishedAt || '').getTime()).map(exam => (
                      <tr key={exam.id} className="text-sm">
                          <td className="py-3">{new Date(exam.finishedAt || '').toLocaleDateString()}</td>
                          <td className="py-3">{exam.score}</td>
                          <td className="py-3">{exam.passed ? 'Pass' : 'Fail'}</td>
                      </tr>
                  ))}
              </tbody>
          </table>
      </div>

      {showGrantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
            <div className="bg-white p-6 rounded-xl w-96">
                <h3 className="font-bold mb-4">Grant Subscription</h3>
                <select onChange={e => setSelectedPlanId(e.target.value)} className="w-full p-2 border rounded mb-4">
                    <option value="">Select Plan</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{typeof p.name === 'string' ? p.name : p.name.en}</option>)}
                </select>
                <div className="flex justify-end gap-2">
                    <button onClick={() => setShowGrantModal(false)} className="px-4 py-2 text-slate-600">Cancel</button>
                    <button onClick={handleGrant} className="px-4 py-2 bg-blue-600 text-white rounded">Grant</button>
                </div>
            </div>
        </div>
      )}
      <ConfirmModal isOpen={!!actionData} title="Confirm Action" message="Are you sure?" confirmText="Confirm" onConfirm={handleAction} onClose={() => setActionData(null)} />
    </div>
  );
};
