import { Plan, Subscription, CombinedAccess, PlanAccess, Language } from '../types';

/**
 * Normalizes plan data from Firestore, providing safe defaults if fields are missing or older schema.
 */
export function normalizePlan(raw: any, id: string): Plan {
  const name: Record<Language, string> = typeof raw.name === 'object' && raw.name
    ? { 
        rw: raw.name.rw || raw.name.en || 'Gahunda', 
        en: raw.name.en || raw.name.rw || 'Plan', 
        fr: raw.name.fr || raw.name.en || 'Plan' 
      }
    : { rw: String(raw.name || 'Gahunda'), en: String(raw.name || 'Plan'), fr: String(raw.name || 'Plan') };

  const description: Record<Language, string> = typeof raw.description === 'object' && raw.description
    ? { 
        rw: raw.description.rw || raw.description.en || '', 
        en: raw.description.en || raw.description.rw || '', 
        fr: raw.description.fr || raw.description.en || '' 
      }
    : { rw: String(raw.description || ''), en: String(raw.description || ''), fr: String(raw.description || '') };

  const access: PlanAccess = {
    lessonVideos: raw.access?.lessonVideos !== undefined ? Boolean(raw.access.lessonVideos) : true,
    trafficRules: raw.access?.trafficRules !== undefined ? Boolean(raw.access.trafficRules) : true,
    exams: raw.access?.exams !== undefined ? Boolean(raw.access.exams) : true,
  };

  return {
    id,
    name,
    description,
    price: typeof raw.price === 'number' ? raw.price : 1000,
    durationDays: typeof raw.durationDays === 'number' && raw.durationDays >= 0 ? raw.durationDays : 0,
    access,
    examLimit: raw.examLimit === undefined ? null : (raw.examLimit === null ? null : Number(raw.examLimit)),
    isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
    isRecommended: Boolean(raw.isRecommended),
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : 0,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

/**
 * Normalizes subscription data from Firestore, preserving copied plan rules.
 */
export function normalizeSubscription(raw: any, id: string): Subscription {
  const access: PlanAccess = {
    lessonVideos: raw.access?.lessonVideos !== undefined ? Boolean(raw.access.lessonVideos) : true,
    trafficRules: raw.access?.trafficRules !== undefined ? Boolean(raw.access.trafficRules) : true,
    exams: raw.access?.exams !== undefined ? Boolean(raw.access.exams) : true,
  };

  return {
    id,
    userId: raw.userId || '',
    planId: raw.planId || '',
    planName: raw.planName || 'Standard Pass',
    price: typeof raw.price === 'number' ? raw.price : 0,
    durationDays: typeof raw.durationDays === 'number' ? raw.durationDays : 0,
    startDate: raw.startDate || new Date().toISOString(),
    endDate: raw.endDate || null,
    access,
    examLimit: raw.examLimit === undefined ? null : (raw.examLimit === null ? null : Number(raw.examLimit)),
    examsUsed: typeof raw.examsUsed === 'number' ? raw.examsUsed : 0,
    status: raw.status || 'active',
    source: raw.source || 'payment',
    grantedBy: raw.grantedBy || null,
  };
}

/**
 * Evaluates access enforcement by combining all active, unexpired subscriptions:
 * - No active, unexpired subscription: free preview only (all features locked).
 * - lessonVideos false: video lessons locked.
 * - trafficRules false: rules content locked.
 * - exams false: exams locked.
 * - If multiple active subscriptions:
 *     allow a feature if ANY active one allows it.
 *     for exams, use the subscription with the most exams remaining (unlimited > highest remaining).
 */
export function getCombinedAccess(subscriptions: Subscription[]): CombinedAccess {
  const now = new Date();
  
  // Filter active subscriptions:
  // - Study plans (has lessonVideos or trafficRules) expire by time
  // - Exams-only plans (limited by number of exams) never expire by time
  const activeSubs = subscriptions.filter(sub => {
    const status = String(sub.status || 'active').toLowerCase();
    if (status !== 'active' && status !== 'approved' && status !== 'completed' && status !== 'success') return false;
    const isStudy = Boolean(sub.access?.lessonVideos || sub.access?.trafficRules);
    if (!isStudy) {
      const allowed = typeof sub.examLimit === 'number' ? sub.examLimit : 5;
      const used = sub.examsUsed || 0;
      return (allowed - used) > 0;
    }
    if (!sub.endDate) return true;
    const end = new Date(sub.endDate);
    return !isNaN(end.getTime()) && end > now;
  });

  if (activeSubs.length === 0) {
    return {
      hasActiveSubscription: false,
      lessonVideos: false,
      trafficRules: false,
      exams: false,
      isUnlimitedExams: false,
      totalExamsAllowed: 0,
      examsUsed: 0,
      examsRemaining: 0,
      activeSubscriptionId: null,
      activePlanName: null,
      earliestExpiryDate: null,
      latestExpiryDate: null,
      activeSubscriptions: [],
    };
  }

  // Feature allowed if ANY active subscription allows it
  const lessonVideos = activeSubs.some(s => s.access?.lessonVideos === true);
  const trafficRules = activeSubs.some(s => s.access?.trafficRules === true);
  const exams = activeSubs.some(s => s.access?.exams === true);

  // Subscriptions that allow exams
  const examSubs = activeSubs.filter(s => s.access?.exams === true);

  let isUnlimitedExams = false;
  let totalExamsAllowed: number | null = null;
  let examsUsed = 0;
  let examsRemaining: number | null = 0;
  let activeSubscriptionId: string | null = null;
  let activePlanName: string | Record<Language, string> | null = activeSubs[0]?.planName || null;

  if (exams && examSubs.length > 0) {
    // If any active study plan allows exams, it gives unlimited exams!
    const studyExamSub = examSubs.find(s => Boolean(s.access?.lessonVideos || s.access?.trafficRules));
    const unlimitedSub = examSubs.find(s => s.examLimit === null || s.examLimit === undefined);
    
    if (studyExamSub || unlimitedSub) {
      const best = studyExamSub || unlimitedSub!;
      isUnlimitedExams = true;
      totalExamsAllowed = null;
      examsUsed = best.examsUsed || 0;
      examsRemaining = null;
      activeSubscriptionId = best.id;
      activePlanName = best.planName;
    } else {
      // Find the subscription with the most exams remaining
      let bestSub = examSubs[0];
      let maxRemaining = Math.max(0, (bestSub.examLimit || 0) - (bestSub.examsUsed || 0));

      for (let i = 1; i < examSubs.length; i++) {
        const sub = examSubs[i];
        const rem = Math.max(0, (sub.examLimit || 0) - (sub.examsUsed || 0));
        if (rem > maxRemaining) {
          maxRemaining = rem;
          bestSub = sub;
        }
      }

      isUnlimitedExams = false;
      totalExamsAllowed = bestSub.examLimit || 0;
      examsUsed = bestSub.examsUsed || 0;
      examsRemaining = maxRemaining;
      activeSubscriptionId = bestSub.id;
      activePlanName = bestSub.planName;
    }
  } else if (activeSubs.length > 0) {
    activeSubscriptionId = activeSubs[0].id;
    activePlanName = activeSubs[0].planName;
  }

  // Calculate expiry dates (from study plans that have an expiry)
  const sortedDates = activeSubs
    .filter(s => Boolean(s.access?.lessonVideos || s.access?.trafficRules) && s.endDate)
    .map(s => new Date(s.endDate!).getTime())
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b);

  const earliestExpiryDate = sortedDates.length > 0 ? new Date(sortedDates[0]).toISOString() : null;
  const latestExpiryDate = sortedDates.length > 0 ? new Date(sortedDates[sortedDates.length - 1]).toISOString() : null;

  return {
    hasActiveSubscription: true,
    lessonVideos,
    trafficRules,
    exams,
    isUnlimitedExams,
    totalExamsAllowed,
    examsUsed,
    examsRemaining,
    activeSubscriptionId,
    activePlanName,
    earliestExpiryDate,
    latestExpiryDate,
    activeSubscriptions: activeSubs,
  };
}
