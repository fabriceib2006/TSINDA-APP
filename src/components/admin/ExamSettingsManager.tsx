import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { ExamSettings } from '../../types';
import { Settings, Save, CheckCircle } from 'lucide-react';

export const ExamSettingsManager: React.FC = () => {
  const [settingsId, setSettingsId] = useState<string>('global-settings');
  const [numQuestions, setNumQuestions] = useState<number>(20);
  const [durationMinutes, setDurationMinutes] = useState<number>(20);
  const [passMark, setPassMark] = useState<number>(12);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const snap = await getDocs(collection(db, 'examSettings')).catch(err => {
          handleFirestoreError(err, OperationType.LIST, 'examSettings');
          return null;
        });
        if (snap && !snap.empty) {
          const docData = snap.docs[0];
          setSettingsId(docData.id);
          const data = docData.data() as ExamSettings;
          setNumQuestions(data.numQuestions || 20);
          setDurationMinutes(data.durationMinutes || 20);
          setPassMark(data.passMark || 12);
        }
      } catch (err) {
        console.error("Error fetching exam settings:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage(false);
    const data: ExamSettings = {
      id: settingsId,
      numQuestions: Number(numQuestions),
      durationMinutes: Number(durationMinutes),
      passMark: Number(passMark)
    };

    try {
      await setDoc(doc(db, 'examSettings', settingsId), data).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, `examSettings/${settingsId}`);
      });
      setSuccessMessage(true);
      setTimeout(() => setSuccessMessage(false), 3000);
    } catch (err) {
      console.error("Error saving exam settings:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl bg-white rounded-xl border border-slate-200 p-8 space-y-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-48"></div>
        <div className="space-y-4">
          <div className="h-10 bg-slate-100 rounded-[10px]"></div>
          <div className="h-10 bg-slate-100 rounded-[10px]"></div>
          <div className="h-10 bg-slate-100 rounded-[10px]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
      <div className="flex items-center gap-3 pb-6 border-b border-slate-100">
        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-[10px] flex items-center justify-center">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">National Exam Configuration</h3>
          <p className="text-xs sm:text-sm text-slate-500">Configure parameters for Rwanda National Gazette theory exams.</p>
        </div>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2.5 p-4 bg-emerald-50 text-emerald-800 rounded-[10px] text-sm font-medium border border-emerald-200">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>Exam settings successfully updated!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
            Number of Questions per Exam
          </label>
          <input
            type="number"
            required
            min={5}
            max={100}
            value={numQuestions}
            onChange={(e) => setNumQuestions(Number(e.target.value))}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] border border-slate-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <p className="text-xs text-slate-400 mt-1">Standard Rwanda driving test has 20 questions.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
            Exam Duration (Minutes)
          </label>
          <input
            type="number"
            required
            min={5}
            max={120}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] border border-slate-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <p className="text-xs text-slate-400 mt-1">Standard duration is 20 minutes.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
            Passing Mark (Minimum Correct Answers)
          </label>
          <input
            type="number"
            required
            min={1}
            max={numQuestions}
            value={passMark}
            onChange={(e) => setPassMark(Number(e.target.value))}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] border border-slate-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <p className="text-xs text-slate-400 mt-1">Standard pass mark is 12 out of 20 (60%).</p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="min-h-[44px] flex items-center justify-center gap-2 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] shadow-sm transition-colors text-sm disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Exam Settings'}</span>
        </button>
      </form>
    </div>
  );
};
