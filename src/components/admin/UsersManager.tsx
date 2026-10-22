import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { UserProfile, Subscription, Plan } from '../../types';
import { normalizeSubscription, normalizePlan } from '../../lib/subscriptionUtils';
import { Search, Shield, Ban, CheckCircle, Trash2, Users, ChevronRight } from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';
import { UserDetails } from './UserDetails';

export const UsersManager: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  const fetchData = async () => {
    try {
      const [usersSnap, subsSnap, plansSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'subscriptions')),
        getDocs(collection(db, 'plans'))
      ]);

      setUsers(usersSnap.docs.map(d => d.data() as UserProfile));
      setSubscriptions(subsSnap.docs.map(d => normalizeSubscription(d.data(), d.id)));
      setPlans(plansSnap.docs.map(d => normalizePlan(d.data(), d.id)));
    } catch (err) {
      console.error("Error fetching user data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleSuspend = async (user: UserProfile) => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    try {
      await updateDoc(doc(db, 'users', user.uid), { status: newStatus });
      setUsers(users.map(u => u.uid === user.uid ? { ...u, status: newStatus } : u));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      const subsSnap = await getDocs(query(collection(db, 'subscriptions'), where('userId', '==', userToDelete.uid))).catch(() => null);
      if (subsSnap) {
        for (const sDoc of subsSnap.docs) {
          await deleteDoc(sDoc.ref).catch(() => {});
        }
      }
      await deleteDoc(doc(db, 'users', userToDelete.uid));
      setUsers(users.filter(u => u.uid !== userToDelete.uid));
      setUserToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userToDelete.uid}`);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone.toLowerCase().includes(searchQuery.toLowerCase());
    
    const userSubs = subscriptions.filter(s => s.userId === u.uid && s.status === 'active');
    const currentSub = userSubs.sort((a, b) => {
      const aTime = a.endDate ? new Date(a.endDate).getTime() : Infinity;
      const bTime = b.endDate ? new Date(b.endDate).getTime() : Infinity;
      return bTime - aTime;
    })[0];
    
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    const matchesPlan = planFilter === 'all' || (currentSub ? currentSub.planId === planFilter : planFilter === 'none');

    return matchesSearch && matchesStatus && matchesPlan;
  });

  if (selectedUser) {
    return <UserDetails user={selectedUser} onBack={() => setSelectedUser(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-[10px] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-2xs"
          />
        </div>
        <div className="flex gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-[10px] text-sm focus:outline-none">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
            </select>
            <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-[10px] text-sm focus:outline-none">
                <option value="all">All Plans</option>
                <option value="none">No Plan</option>
                {plans.map(p => <option key={p.id} value={p.id}>{typeof p.name === 'string' ? p.name : (p.name.en || p.name.rw || p.id)}</option>)}
            </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
            <div className="p-6 text-center text-slate-500">Loading...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No learners found matching criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                  <th className="py-3.5 px-6">Learner</th>
                  <th className="py-3.5 px-6">Plan</th>
                  <th className="py-3.5 px-6">Expiry</th>
                  <th className="py-3.5 px-6">Exams</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredUsers.map((user) => {
                    const userSubs = subscriptions.filter(s => s.userId === user.uid && s.status === 'active');
                    const currentSub = userSubs.sort((a, b) => {
                      const aTime = a.endDate ? new Date(a.endDate).getTime() : Infinity;
                      const bTime = b.endDate ? new Date(b.endDate).getTime() : Infinity;
                      return bTime - aTime;
                    })[0];
                    return (
                        <tr key={user.uid} className="hover:bg-slate-50/60 transition-colors cursor-pointer" onClick={() => setSelectedUser(user)}>
                            <td className="py-4 px-6">
                                <div className="font-semibold text-slate-900">{user.name}</div>
                                <div className="text-xs text-slate-500">{user.email}</div>
                            </td>
                            <td className="py-4 px-6">{currentSub ? (typeof currentSub.planName === 'string' ? currentSub.planName : (currentSub.planName.en || currentSub.planName.rw)) : '-'}</td>
                            <td className="py-4 px-6">{currentSub ? (currentSub.endDate ? new Date(currentSub.endDate).toLocaleDateString() : 'No expiry') : '-'}</td>
                            <td className="py-4 px-6">{currentSub ? `${currentSub.examsUsed} / ${currentSub.examLimit || '∞'}` : '-'}</td>
                            <td className="py-4 px-6">
                                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                    {user.status}
                                </span>
                            </td>
                            <td className="py-4 px-6 text-right" onClick={e => e.stopPropagation()}>
                                <button onClick={() => handleToggleSuspend(user)} className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs mr-2">Suspend</button>
                                <button onClick={() => setSelectedUser(user)} className="p-2 text-slate-400 hover:text-blue-600"><ChevronRight className="w-4 h-4"/></button>
                            </td>
                        </tr>
                    );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmModal isOpen={!!userToDelete} title="Delete Learner" message="Are you sure?" confirmText="Delete" onConfirm={handleDeleteUser} onClose={() => setUserToDelete(null)} />
    </div>
  );
};
