export type Role = 'learner' | 'admin';
export type Language = 'rw' | 'en' | 'fr';

export interface UserProfile {
  uid: string;
  name: string;
  phone: string;
  email: string;
  role: Role;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface PlanAccess {
  lessonVideos: boolean;
  trafficRules: boolean;
  exams: boolean;
}

export interface Plan {
  id: string;
  name: Record<Language, string>;
  description: Record<Language, string>;
  price: number; // RWF
  durationDays: number;
  access: PlanAccess;
  examLimit: number | null; // number of completed exams allowed, or null for unlimited (only used when exams access is true)
  isActive: boolean;
  isRecommended: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  planName: Record<Language, string> | string;
  price: number;
  durationDays: number;
  startDate: string;
  endDate: string;
  access: PlanAccess;
  examLimit: number | null;
  examsUsed: number;
  status: 'active' | 'expired' | 'cancelled';
  source: 'payment' | 'admin_grant';
  grantedBy: string | null;
}

export interface ExamAttempt {
  id: string;
  userId: string;
  subscriptionId: string;
  startedAt: string;
  finishedAt: string | null;
  score: number;
  passed: boolean;
  status: 'in_progress' | 'completed';
  questionIds?: string[];
  userAnswers?: Record<number, number>;
  durationMinutes?: number;
}

export interface CombinedAccess {
  hasActiveSubscription: boolean;
  lessonVideos: boolean;
  trafficRules: boolean;
  exams: boolean;
  isUnlimitedExams: boolean;
  totalExamsAllowed: number | null;
  examsUsed: number;
  examsRemaining: number | null;
  activeSubscriptionId: string | null;
  earliestExpiryDate: string | null;
  latestExpiryDate: string | null;
  activeSubscriptions: Subscription[];
}

export interface Payment {
  id: string;
  paypackRef?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  planId: string;
  planName?: string;
  amount: number;
  phone?: string;
  network?: 'MTN' | 'Airtel' | string;
  kind?: string;
  method?: string;
  status: 'successful' | 'success' | 'pending' | 'failed';
  failureReason?: string | null;
  subscriptionId?: string | null;
  reference?: string;
  createdAt: string | any;
  updatedAt?: string | any;
}

export interface CategoryItem {
  id: string;
  name: Record<Language, string> | string;
  order?: number;
}

export interface Lesson {
  id: string;
  title: Record<Language, string>;
  body: Record<Language, string>;
  category: string;
  images?: string[];
  gazetteReference?: string | null;
  order: number;
  isPublished: boolean;
  isFreePreview?: boolean;
  createdAt?: string | any;
  updatedAt?: string | any;
}

export interface VideoLesson {
  id: string;
  title: Record<Language, string>;
  description: Record<Language, string>;
  category: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  thumbnail: string;
  order: number;
  isPublished: boolean;
  isFreePreview?: boolean;
  createdAt?: string | any;
  updatedAt?: string | any;
}

export interface Question {
  id: string;
  text: Record<Language, string>;
  options: string[];
  correctIndex: number;
  explanation: string;
  category: string;
  imageUrl?: string;
  isPublished: boolean;
}

export interface ExamSettings {
  id: string;
  numQuestions: number;
  durationMinutes: number;
  passMark: number;
}

export interface Promotion {
  id: string;
  planId: string; // 'all' or specific plan ID
  label: Record<Language, string> | string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  startAt: string;
  endAt: string;
  isActive: boolean;
  createdAt: string;
}

