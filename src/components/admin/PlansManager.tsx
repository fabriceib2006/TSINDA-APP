import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { Plan, Subscription, Language, UserProfile, Promotion } from '../../types';
import { normalizePlan } from '../../lib/subscriptionUtils';
import { getPromotionStatus, formatKigaliDateTime } from '../../lib/timeUtils';
import { 
  Plus, 
  Tag, 
  Check, 
  X, 
  Trash2, 
  Edit2, 
  ToggleLeft, 
  ToggleRight, 
  Users, 
  Video, 
  BookOpen, 
  Award, 
  AlertCircle,
  HelpCircle,
  Star,
  Percent,
  Clock,
  Calendar
} from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';

export const PlansManager: React.FC = () => {
  const [activeMainTab, setActiveMainTab] = useState<'plans' | 'promotions'>('plans');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Plan Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubscribersModalOpen, setIsSubscribersModalOpen] = useState(false);
  const [selectedPlanForSubscribers, setSelectedPlanForSubscribers] = useState<Plan | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);

  // Promotion Modal state
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [promoToDelete, setPromoToDelete] = useState<Promotion | null>(null);

  // Plan Form state
  const [nameEn, setNameEn] = useState('');
  const [nameRw, setNameRw] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [descEn, setDescEn] = useState('');
  const [descRw, setDescRw] = useState('');
  const [descFr, setDescFr] = useState('');
  const [price, setPrice] = useState<number>(2000);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [accessVideos, setAccessVideos] = useState<boolean>(true);
  const [accessRules, setAccessRules] = useState<boolean>(true);
  const [accessExams, setAccessExams] = useState<boolean>(true);
  const [isExamUnlimited, setIsExamUnlimited] = useState<boolean>(true);
  const [examLimitVal, setExamLimitVal] = useState<number>(20);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isRecommended, setIsRecommended] = useState<boolean>(false);
  const [sortOrder, setSortOrder] = useState<number>(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Promotion Form state
  const [promoPlanId, setPromoPlanId] = useState<string>('all');
  const [promoLabel, setPromoLabel] = useState<string>('Special Offer');
  const [promoDiscountType, setPromoDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [promoDiscountValue, setPromoDiscountValue] = useState<number>(20);
  const [promoStartAt, setPromoStartAt] = useState<string>('');
  const [promoEndAt, setPromoEndAt] = useState<string>('');
  const [promoIsActive, setPromoIsActive] = useState<boolean>(true);
  const [promoError, setPromoError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      // 1. Fetch Plans
      const plansSnap = await getDocs(collection(db, 'plans')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, 'plans');
        return null;
      });
      if (plansSnap) {
        const list = plansSnap.docs.map(d => normalizePlan(d.data(), d.id));
        list.sort((a, b) => a.sortOrder - b.sortOrder);
        setPlans(list);
      }

      // 2. Fetch Promotions
      const promoSnap = await getDocs(collection(db, 'promotions')).catch(err => null);
      if (promoSnap) {
        setPromotions(promoSnap.docs.map(d => ({ id: d.id, ...d.data() } as Promotion)));
      }

      // 3. Fetch Subscriptions
      const subsSnap = await getDocs(collection(db, 'subscriptions')).catch(err => null);
      if (subsSnap) {
        setSubscriptions(subsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subscription)));
      }

      // 4. Fetch Users
      const usersSnap = await getDocs(collection(db, 'users')).catch(err => null);
      if (usersSnap) {
        setUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      }
    } catch (err) {
      console.error("Error fetching plans or promotions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getActiveSubscriberCount = (planId: string) => {
    const now = new Date();
    return subscriptions.filter(s => 
      s.planId === planId && 
      s.status === 'active' && 
      (!s.endDate || new Date(s.endDate) > now) &&
      (!s.examLimit || (s.examsUsed ?? 0) < s.examLimit) &&
      users.some(u => u.uid === s.userId)
    ).length;
  };

  const openCreateModal = () => {
    setEditingPlan(null);
    setNameEn('');
    setNameRw('');
    setNameFr('');
    setDescEn('');
    setDescRw('');
    setDescFr('');
    setPrice(2000);
    setDurationDays(30);
    setAccessVideos(true);
    setAccessRules(true);
    setAccessExams(true);
    setIsExamUnlimited(true);
    setExamLimitVal(20);
    setIsActive(true);
    setIsRecommended(false);
    setSortOrder(plans.length + 1);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (plan: Plan) => {
    setEditingPlan(plan);
    setNameEn(plan.name.en || '');
    setNameRw(plan.name.rw || '');
    setNameFr(plan.name.fr || '');
    setDescEn(plan.description.en || '');
    setDescRw(plan.description.rw || '');
    setDescFr(plan.description.fr || '');
    setPrice(plan.price);
    const isStudy = Boolean(plan.access.trafficRules || plan.access.lessonVideos);
    setDurationDays(isStudy ? (plan.durationDays || 30) : 0);
    setAccessVideos(plan.access.lessonVideos);
    setAccessRules(plan.access.trafficRules);
    setAccessExams(plan.access.exams);
    setIsExamUnlimited(isStudy ? true : (plan.examLimit === null));
    setExamLimitVal(plan.examLimit !== null && plan.examLimit !== undefined ? plan.examLimit : 5);
    setIsActive(plan.isActive);
    setIsRecommended(plan.isRecommended);
    setSortOrder(plan.sortOrder);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openPromoModal = (promo?: Promotion) => {
    if (promo) {
      setEditingPromo(promo);
      setPromoPlanId(promo.planId);
      setPromoLabel(typeof promo.label === 'object' ? promo.label.en || '' : promo.label);
      setPromoDiscountType(promo.discountType);
      setPromoDiscountValue(promo.discountValue);
      setPromoStartAt(promo.startAt ? promo.startAt.slice(0, 16) : '');
      setPromoEndAt(promo.endAt ? promo.endAt.slice(0, 16) : '');
      setPromoIsActive(promo.isActive);
    } else {
      setEditingPromo(null);
      setPromoPlanId('all');
      setPromoLabel('Special Promo');
      setPromoDiscountType('percent');
      setPromoDiscountValue(20);
      const nowStr = new Date().toISOString().slice(0, 16);
      const laterStr = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 16);
      setPromoStartAt(nowStr);
      setPromoEndAt(laterStr);
      setPromoIsActive(true);
    }
    setPromoError(null);
    setIsPromoModalOpen(true);
  };

  const handleCleanDatabasePlans = async () => {
    try {
      const res = await fetch('/api/admin/clean-plans-and-subs', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        alert(`Database plans and subscriptions audited successfully! Updated: ${data.summary?.plansUpdated || 0} plans, ${data.summary?.subsUpdated || 0} subscriptions.`);
        fetchData();
      } else {
        alert('Failed to audit database plans');
      }
    } catch (e: any) {
      alert(e.message || 'Error auditing plans');
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!nameEn.trim()) {
      setFormError('Plan name in English is required.');
      return;
    }

    const isStudy = Boolean(accessRules || accessVideos);
    if (isStudy && (!durationDays || durationDays < 1)) {
      setFormError('Duration in days is required for plans containing traffic rules or video lessons.');
      return;
    }
    if (!isStudy && accessExams && (!examLimitVal || examLimitVal < 1)) {
      setFormError('Number of exams allowed is required for exam-only plans.');
      return;
    }

    setSaving(true);
    try {
      const planData = {
        name: { rw: nameRw || nameEn, en: nameEn, fr: nameFr || nameEn },
        description: { rw: descRw || descEn, en: descEn, fr: descFr || descEn },
        price: Number(price),
        durationDays: isStudy ? Number(durationDays) : 0,
        access: {
          trafficRules: accessRules,
          lessonVideos: accessVideos,
          exams: accessExams,
        },
        examLimit: isStudy ? null : (accessExams ? Number(examLimitVal) : null),
        isActive,
        isRecommended,
        sortOrder: Number(sortOrder),
        createdAt: editingPlan ? (editingPlan.createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (editingPlan) {
        await updateDoc(doc(db, 'plans', editingPlan.id), planData);
      } else {
        await addDoc(collection(db, 'plans'), planData);
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Error saving plan:', err);
      setFormError(err.message || 'Failed to save plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError(null);

    if (promoDiscountType === 'percent' && (promoDiscountValue < 1 || promoDiscountValue > 90)) {
      setPromoError('Percentage discount must be between 1% and 90%.');
      return;
    }

    if (new Date(promoEndAt).getTime() <= new Date(promoStartAt).getTime()) {
      setPromoError('End time must be strictly after start time.');
      return;
    }

    setSaving(true);
    try {
      const promoData = {
        planId: promoPlanId,
        label: { rw: promoLabel, en: promoLabel, fr: promoLabel },
        discountType: promoDiscountType,
        discountValue: Number(promoDiscountValue),
        startAt: new Date(promoStartAt).toISOString(),
        endAt: new Date(promoEndAt).toISOString(),
        isActive: promoIsActive,
        createdAt: new Date().toISOString()
      };

      if (editingPromo) {
        await updateDoc(doc(db, 'promotions', editingPromo.id), promoData);
      } else {
        await addDoc(collection(db, 'promotions'), promoData);
      }

      setIsPromoModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Error saving promotion:', err);
      setPromoError(err.message || 'Failed to save promotion.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!planToDelete) return;
    try {
      await deleteDoc(doc(db, 'plans', planToDelete.id));
      setPlanToDelete(null);
      fetchData();
    } catch (err) {
      console.error('Error deleting plan:', err);
    }
  };

  const handleDeletePromotion = async () => {
    if (!promoToDelete) return;
    try {
      await deleteDoc(doc(db, 'promotions', promoToDelete.id));
      setPromoToDelete(null);
      fetchData();
    } catch (err) {
      console.error('Error deleting promotion:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Subscription Plans & Promotions</h2>
          <p className="text-xs text-slate-500 mt-1">Configure pricing tiers, access privileges, and time-bound promotional discount campaigns.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveMainTab('plans')}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeMainTab === 'plans' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Plans ({plans.length})
          </button>
          <button
            onClick={() => setActiveMainTab('promotions')}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeMainTab === 'promotions' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Promotions ({promotions.length})
          </button>
        </div>
      </div>

      {activeMainTab === 'plans' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">All Subscription Plans</h3>
              <p className="text-xs text-slate-500">Duration is required for study plans; number of exams is required for exam packs.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCleanDatabasePlans}
                className="min-h-[44px] px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-colors border border-slate-200"
                title="Normalize existing plans and subscriptions in database"
              >
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Audit & Sync Database</span>
              </button>
              <button
                onClick={openCreateModal}
                className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add Plan</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const activeCount = getActiveSubscriberCount(plan.id);
              return (
                <div key={plan.id} className={`bg-white rounded-2xl border p-6 shadow-xs space-y-4 relative flex flex-col justify-between ${
                  plan.isRecommended ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-slate-200'
                }`}>
                  {plan.isRecommended && (
                    <span className="absolute -top-3 right-6 bg-blue-600 text-white text-[10px] font-extrabold uppercase px-3 py-1 rounded-full shadow-xs flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current" />
                      <span>Recommended</span>
                    </span>
                  )}

                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-lg font-bold text-slate-900">{plan.name.en}</h4>
                        <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{plan.description.en}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                        plan.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {plan.isActive ? 'Active' : 'Hidden'}
                      </span>
                    </div>

                    <div className="pt-2">
                      <div className="text-2xl font-black text-slate-900">RWF {plan.price.toLocaleString()}</div>
                      <div className="text-xs text-slate-500">{plan.durationDays} days access</div>
                    </div>

                    <div className="space-y-1.5 pt-3 border-t border-slate-100 text-xs font-medium text-slate-700">
                      <div className="flex items-center gap-2">
                        {plan.access.trafficRules ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <X className="w-4 h-4 text-slate-400" />
                        )}
                        <span>Traffic Rules: {plan.access.trafficRules ? 'Enabled' : 'Disabled'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {plan.access.lessonVideos ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <X className="w-4 h-4 text-slate-400" />
                        )}
                        <span>Video Lessons: {plan.access.lessonVideos ? 'Enabled' : 'Disabled'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {plan.access.exams ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <X className="w-4 h-4 text-slate-400" />
                        )}
                        <span>Exams: {plan.access.exams ? (plan.examLimit === null ? 'Unlimited Exams' : `${plan.examLimit} Mock Exams`) : 'Disabled'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setSelectedPlanForSubscribers(plan);
                        setIsSubscribersModalOpen(true);
                      }}
                      className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>{activeCount} Active</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(plan)}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Edit Plan"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPlanToDelete(plan)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Plan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold text-slate-900">Promotional Discount Campaigns</h3>
              <p className="text-xs text-slate-500">Configure time-bound promotional discount windows for specific or all plans in Africa/Kigali time.</p>
            </div>
            <button
              onClick={() => openPromoModal()}
              className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Promotion</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {promotions.map((promo) => {
              const status = getPromotionStatus(promo.startAt, promo.endAt, promo.isActive);
              const targetPlan = promo.planId === 'all' ? 'All Plans' : plans.find(p => p.id === promo.planId)?.name?.en || 'Selected Plan';
              return (
                <div key={promo.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                      status === 'running' ? 'bg-emerald-100 text-emerald-800 animate-pulse' :
                      status === 'scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {status}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openPromoModal(promo)}
                        className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPromoToDelete(promo)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-base font-bold text-slate-900">{typeof promo.label === 'object' ? promo.label.en : promo.label}</h4>
                    <p className="text-xs text-blue-600 font-semibold mt-0.5">Target: {targetPlan}</p>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-bold text-slate-700 bg-slate-50 p-3 rounded-xl">
                    <div className="flex items-center gap-1.5">
                      <Percent className="w-4 h-4 text-blue-600" />
                      <span>{promo.discountValue}{promo.discountType === 'percent' ? '%' : ' RWF'} off</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 space-y-1 pt-2 border-t border-slate-100">
                    <div>Start: {formatKigaliDateTime(promo.startAt)}</div>
                    <div>End: {formatKigaliDateTime(promo.endAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Plan Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 sm:p-8 my-8 space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">{editingPlan ? 'Edit Plan' : 'Create New Plan'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full"><X className="w-5 h-5"/></button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 text-red-800 rounded-xl text-xs font-medium border border-red-200">
                {formError}
              </div>
            )}

            <form onSubmit={handleSavePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Plan Name (English) *</label>
                <input
                  type="text"
                  required
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="Pro Pass"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Description (English)</label>
                <textarea
                  rows={2}
                  value={descEn}
                  onChange={(e) => setDescEn(e.target.value)}
                  placeholder="Full access to all traffic rules and mock exams."
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Price (RWF) *</label>
                  <input
                    type="number"
                    min="100"
                    required
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                  />
                </div>
                {(accessRules || accessVideos) ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Duration (Days) *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={durationDays}
                      onChange={(e) => setDurationDays(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Study passes expire after this period.</p>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <div className="p-3 bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 w-full">
                      ✓ Exam-only plan: No time duration. Credits remain valid until used.
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-700 uppercase">Access Privileges</label>
                <div className="flex flex-wrap gap-4 text-xs font-medium">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={accessRules} onChange={(e) => setAccessRules(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                    <span>Traffic Rules</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={accessVideos} onChange={(e) => setAccessVideos(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                    <span>Video Lessons</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={accessExams} onChange={(e) => setAccessExams(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                    <span>Mock Exams</span>
                  </label>
                </div>
              </div>

              {accessExams && (
                <div className="space-y-3 pt-2">
                  {(accessRules || accessVideos) ? (
                    <div className="p-3 bg-blue-50 text-blue-800 rounded-xl text-xs font-semibold border border-blue-200 flex items-center gap-2">
                      <Check className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Unlimited mock exam attempts are included for this study pass throughout its duration (no exam count needed).</span>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Number of Exams Allowed *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={examLimitVal}
                        onChange={(e) => setExamLimitVal(Number(e.target.value))}
                        placeholder="e.g. 5, 10, 20"
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Student gets exactly this many exam attempts. No expiry date.</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-6 pt-3 border-t border-slate-100 text-xs font-semibold">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                  <span>Active (Visible on public site)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isRecommended} onChange={(e) => setIsRecommended(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                  <span>Recommended badge</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-h-[44px] px-5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-6 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-xl shadow-sm"
                >
                  {saving ? 'Saving...' : (editingPlan ? 'Save Plan' : 'Create Plan')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Promotion Create/Edit Modal */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 sm:p-8 my-8 space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">{editingPromo ? 'Edit Promotion' : 'Add Promotion'}</h3>
              <button onClick={() => setIsPromoModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full"><X className="w-5 h-5"/></button>
            </div>

            {promoError && (
              <div className="p-3 bg-red-50 text-red-800 rounded-xl text-xs font-medium border border-red-200">
                {promoError}
              </div>
            )}

            <form onSubmit={handleSavePromotion} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Target Plan *</label>
                <select
                  value={promoPlanId}
                  onChange={(e) => setPromoPlanId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                >
                  <option value="all">All Plans (Global Promotion)</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name.en} (RWF {p.price.toLocaleString()})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Campaign Label *</label>
                <input
                  type="text"
                  required
                  value={promoLabel}
                  onChange={(e) => setPromoLabel(e.target.value)}
                  placeholder="Easter Special 20% Off"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Discount Type *</label>
                  <select
                    value={promoDiscountType}
                    onChange={(e) => setPromoDiscountType(e.target.value as any)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed (RWF)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Discount Value *</label>
                  <input
                    type="number"
                    min="1"
                    max={promoDiscountType === 'percent' ? 90 : 100000}
                    required
                    value={promoDiscountValue}
                    onChange={(e) => setPromoDiscountValue(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                  />
                  {promoDiscountType === 'percent' && (
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Must be between 1% and 90%</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Start Time (Africa/Kigali CAT) *</label>
                <input
                  type="datetime-local"
                  required
                  value={promoStartAt}
                  onChange={(e) => setPromoStartAt(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">End Time (Africa/Kigali CAT) *</label>
                <input
                  type="datetime-local"
                  required
                  value={promoEndAt}
                  onChange={(e) => setPromoEndAt(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input type="checkbox" checked={promoIsActive} onChange={(e) => setPromoIsActive(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                  <span>Active Campaign</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPromoModalOpen(false)}
                  className="min-h-[44px] px-5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-6 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-xl shadow-sm"
                >
                  {saving ? 'Saving...' : 'Save Promotion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={!!planToDelete}
        title="Delete Plan"
        message={`Are you sure you want to delete ${planToDelete?.name.en}?`}
        confirmText="Delete"
        onConfirm={handleDeletePlan}
        onClose={() => setPlanToDelete(null)}
      />

      <ConfirmModal
        isOpen={!!promoToDelete}
        title="Delete Promotion"
        message="Are you sure you want to delete this promotional campaign?"
        confirmText="Delete"
        onConfirm={handleDeletePromotion}
        onClose={() => setPromoToDelete(null)}
      />

      {/* Subscribers Modal */}
      {isSubscribersModalOpen && selectedPlanForSubscribers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 my-8 space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Active Subscribers: {selectedPlanForSubscribers.name.en}</h3>
              <button onClick={() => setIsSubscribersModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full"><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {getActiveSubscriberCount(selectedPlanForSubscribers.id) === 0 && (
                <p className="text-sm text-slate-500 py-4 text-center">No active subscribers for this plan.</p>
              )}
              {subscriptions.filter(s => s.planId === selectedPlanForSubscribers.id && s.status === 'active' && (!s.endDate || new Date(s.endDate) > new Date()) && users.some(u => u.uid === s.userId)).map(sub => {
                const user = users.find(u => u.uid === sub.userId);
                return (
                  <div key={sub.id} className="flex justify-between items-center p-3.5 border border-slate-100 rounded-xl bg-slate-50/50">
                    <div>
                      <p className="font-bold text-sm text-slate-900">{user?.name || 'Unknown'}</p>
                      <p className="text-xs text-slate-500">{user?.phone || '-'}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-semibold text-slate-800">Expires: {sub.endDate ? new Date(sub.endDate).toLocaleDateString() : 'No expiry (Exams only)'}</p>
                      <p className="text-slate-500">Exams: {sub.examsUsed} / {sub.examLimit || '∞'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
