import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { useAuth } from '../../context/AuthContext';
import { Award, ArrowLeft, CheckCircle2, XCircle, Calendar } from 'lucide-react';

export const ResultsHistoryView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { userProfile } = useAuth();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchResults() {
      if (!userProfile) return;
      try {
        const q = query(collection(db, 'examResults'), where('userId', '==', userProfile.uid));
        const snap = await getDocs(q).catch(err => {
          handleFirestoreError(err, OperationType.LIST, 'examResults');
          return null;
        });
        if (snap) {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setResults(list.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        }
      } catch (err) {
        console.error("Error fetching results history:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [userProfile]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="min-h-[44px] flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> 
          <span>Back to Dashboard</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="h-6 bg-slate-100 rounded w-48 mb-4 animate-pulse"></div>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between py-3.5 border-b border-slate-100 animate-pulse">
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-32"></div>
                  <div className="h-3 bg-slate-100 rounded w-20"></div>
                </div>
                <div className="h-4 bg-slate-200 rounded w-20"></div>
                <div className="h-6 bg-slate-100 rounded-full w-16"></div>
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="p-10 sm:p-14 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto">
              <Award className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">No mock exam attempts yet</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Take your first official mock exam simulation to test your traffic knowledge and see your score history here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">Score</th>
                  <th className="py-3.5 px-6">Pass Mark</th>
                  <th className="py-3.5 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {results.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6 text-slate-600 text-xs flex items-center gap-2 whitespace-nowrap">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span>{new Date(r.date).toLocaleString()}</span>
                    </td>
                    <td className="py-4 px-6 font-bold text-slate-900 whitespace-nowrap">{r.score} / {r.total}</td>
                    <td className="py-4 px-6 font-semibold text-blue-600 whitespace-nowrap">{r.passMark}</td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        r.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {r.passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span>{r.passed ? 'PASS' : 'FAIL'}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
