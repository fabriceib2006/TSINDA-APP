import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { Users, CreditCard, Award, TrendingUp, BookOpen, HelpCircle } from 'lucide-react';
import { Subscription, Payment } from '../../types';

export const AdminDashboard: React.FC = () => {
  const [usersCount, setUsersCount] = useState<number>(0);
  const [activeSubsCount, setActiveSubsCount] = useState<number>(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // Fetch users
        const usersSnap = await getDocs(collection(db, 'users')).catch(err => {
          handleFirestoreError(err, OperationType.LIST, 'users');
          return null;
        });
        if (usersSnap) setUsersCount(usersSnap.size);

        // Fetch subscriptions
        const subsSnap = await getDocs(collection(db, 'subscriptions')).catch(err => {
          handleFirestoreError(err, OperationType.LIST, 'subscriptions');
          return null;
        });
        if (subsSnap) {
          const now = new Date();
          const active = subsSnap.docs.filter(d => {
            const s = d.data() as Subscription;
            return s.status === 'active' && new Date(s.endDate) > now;
          }).length;
          setActiveSubsCount(active);
        }

        // Fetch payments
        const paymentsSnap = await getDocs(collection(db, 'payments')).catch(err => {
          handleFirestoreError(err, OperationType.LIST, 'payments');
          return null;
        });
        if (paymentsSnap) {
          let total = 0;
          paymentsSnap.docs.forEach(d => {
            const p = d.data() as Payment;
            if (p.status === 'successful' || p.status === 'success') {
              total += p.amount || 0;
            }
          });
          setMonthlyRevenue(total);
        }
      } catch (err) {
        console.error("Error loading dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3 animate-pulse">
              <div className="flex justify-between items-center">
                <div className="h-4 bg-slate-200 rounded w-24"></div>
                <div className="w-8 h-8 bg-slate-200 rounded-lg"></div>
              </div>
              <div className="h-8 bg-slate-200 rounded w-28"></div>
              <div className="h-3 bg-slate-100 rounded w-36"></div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3 animate-pulse">
          <div className="h-5 bg-slate-200 rounded w-48"></div>
          <div className="h-4 bg-slate-100 rounded w-full"></div>
          <div className="h-4 bg-slate-100 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Total Users Metric Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-slate-500 text-sm font-semibold">
            <span>Total Learners</span>
            <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">{usersCount}</div>
          <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Active registered learners</span>
          </div>
        </div>

        {/* Active Subscriptions Metric Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-slate-500 text-sm font-semibold">
            <span>Active Subscriptions</span>
            <div className="w-9 h-9 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">{activeSubsCount}</div>
          <div className="text-xs text-slate-500 font-medium">Verified active study passes</div>
        </div>

        {/* Monthly Revenue Metric Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-slate-500 text-sm font-semibold">
            <span>Monthly Revenue</span>
            <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            RWF {monthlyRevenue.toLocaleString()}
          </div>
          <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Verified MoMo & Card payments</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-2">
        <h3 className="text-base sm:text-lg font-bold text-slate-900">TSINDA Administrative Overview</h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          Welcome to the TSINDA administrative control center. Use the sidebar to manage subscription plans, learner accounts, traffic rules lessons, question bank items, national exam parameters, and payment verifications according to the official Rwanda National Gazette regulations.
        </p>
      </div>
    </div>
  );
};
