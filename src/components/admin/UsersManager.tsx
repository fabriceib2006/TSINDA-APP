import React, { useEffect, useState, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { useAuth } from '../../context/AuthContext';
import { UserProfile, Subscription, Plan } from '../../types';
import { normalizeSubscription, normalizePlan } from '../../lib/subscriptionUtils';
import { Search, Shield, Ban, CheckCircle, Trash2, Users, ChevronRight, ChevronLeft } from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';
import { UserDetails } from './UserDetails';

export const UsersManager: React.FC = () => {
  const { getIdToken, firebaseUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Server-side cursor pagination state
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchUsers = useCallback(async (targetCursor: string | null = null, search: string = '') => {
    setLoading(true);
    try {
      const token = typeof getIdToken === 'function' ? await getIdToken() : (firebaseUser ? await firebaseUser.getIdToken() : '');
      const url = `/api/admin/users?limit=20${targetCursor ? `&cursor=${targetCursor}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (res.ok) {
        const data = await res.json();
        const loadedUsers = (data.users || []) as UserProfile[];
        setUsers(loadedUsers);
        setNextCursor(data.nextCursor || null);
        setHasMore(Boolean(data.hasMore));

        // Load subscriptions only for the current 20 users
        if (loadedUsers.length > 0) {
          const uids = loadedUsers.map(u => u.uid).filter(Boolean);
          const subsSnap = await getDocs(query(
            collection(db, 'subscriptions'),
            where('userId', 'in', uids.slice(0, 30))
          )).catch(() => null);

          if (subsSnap) {
            setSubscriptions(subsSnap.docs.map(d => normalizeSubscription(d.data(), d.id)));
          }
        } else {
          setSubscriptions([]);
        }
      }
    } catch (err) {
      console.error("Error fetching users page:", err);
    } finally {
      setLoading(false);
    }
  }, [getIdToken, firebaseUser]);

  useEffect(() => {
    fetchUsers(null, searchQuery);
    // Fetch plans once
    fetch('/api/plans')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.plans)) setPlans(d.plans.map((p: any) => normalizePlan(p, p.id)));
      })
      .catch(() => {});
  }, [fetchUsers]);

  const handleNextPage = () => {
    if (!nextCursor || !hasMore) return;
    const nextIdx = currentPageIndex + 1;
    setCursorHistory(prev => [...prev.slice(0, nextIdx), nextCursor]);
    setCurrentPageIndex(nextIdx);
    fetchUsers(nextCursor, searchQuery);
  };

  const handlePrevPage = () => {
    if (currentPageIndex <= 0) return;
    const prevIdx = currentPageIndex - 1;
    const prevCursor = cursorHistory[prevIdx] || null;
    setCurrentPageIndex(prevIdx);
    fetchUsers(prevCursor, searchQuery);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPageIndex(0);
    setCursorHistory([null]);
    fetchUsers(null, searchQuery);
  };

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
      <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, phone... (Enter to search)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-[10px] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-2xs"
          />
        </div>
        <div className="flex gap-2">
            <button type="submit" className="min-h-[44px] px-4 py-2 bg-blue-600 text-white font-semibold rounded-[10px] text-sm hover:bg-blue-700 transition-colors">
              Search
            </button>
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
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
            <div className="p-10 text-center text-slate-500">Loading learners...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No learners found matching criteria.</div>
        ) : (
          <div>
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

            {/* Server-side Pagination Controls */}
            <div className="p-4 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Page {currentPageIndex + 1} (showing {filteredUsers.length} learners per page)
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={currentPageIndex === 0 || loading}
                  className="min-h-[36px] px-3.5 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors shadow-2xs text-xs font-semibold"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>
                <span className="text-xs font-bold px-2 text-slate-700">
                  Page {currentPageIndex + 1}
                </span>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!hasMore || !nextCursor || loading}
                  className="min-h-[36px] px-3.5 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors shadow-2xs text-xs font-semibold"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmModal isOpen={!!userToDelete} title="Delete Learner" message="Are you sure?" confirmText="Delete" onConfirm={handleDeleteUser} onClose={() => setUserToDelete(null)} />
    </div>
  );
};
