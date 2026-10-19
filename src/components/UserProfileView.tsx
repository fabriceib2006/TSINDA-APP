import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../i18n/translations';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { User, Phone, Mail, Shield, Save, CheckCircle, ArrowLeft } from 'lucide-react';
import { normalizePhone, validatePhone } from '../lib/phoneUtils';

export const UserProfileView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { userProfile } = useAuth();
  const { language } = useLanguage();
  const dict = t[language];

  const [name, setName] = useState(userProfile?.name || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEditable = userProfile?.role === 'learner';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !isEditable) return;
    setSaving(true);
    setSuccessMessage(false);
    setErrorMessage(null);

    try {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone || !validatePhone(normalizedPhone)) {
        setErrorMessage("Please enter a valid Rwandan MTN (078/079) or Airtel (072/073) phone number.");
        setSaving(false);
        return;
      }
      await updateDoc(doc(db, 'users', userProfile.uid), {
        name,
        phone: normalizedPhone
      }).catch(err => {
        handleFirestoreError(err, OperationType.UPDATE, `users/${userProfile.uid}`);
      });
      setSuccessMessage(true);
      setTimeout(() => setSuccessMessage(false), 3000);
    } catch (err) {
      console.error("Error updating profile:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <button 
          onClick={onBack} 
          className="min-h-[44px] inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> 
          <span>Back to Dashboard</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-600 text-white text-xl sm:text-2xl font-bold rounded-xl flex items-center justify-center shadow-xs shrink-0">
            {userProfile?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate" title={userProfile?.name}>
              {userProfile?.name}
            </h2>
            <p className="text-xs text-blue-600 font-semibold capitalize flex items-center gap-1 mt-1">
              <Shield className="w-3.5 h-3.5 shrink-0" /> 
              <span>{userProfile?.role} Account</span>
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="flex items-center gap-2.5 p-4 bg-red-50 text-red-800 rounded-[10px] text-sm font-medium border border-red-200">
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2.5 p-4 bg-emerald-50 text-emerald-800 rounded-[10px] text-sm font-medium border border-emerald-200">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Profile successfully updated!</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {dict.fullName}
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                required
                disabled={!isEditable}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-[10px] border border-slate-200 text-base sm:text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {dict.phoneNumber}
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="tel"
                required
                disabled={!isEditable}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-[10px] border border-slate-200 text-base sm:text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Example: 0788123456</span>
            {phone && !validatePhone(phone) && (
              <p className="text-xs text-red-500 mt-1">Please enter a valid Rwandan MTN or Airtel phone number.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Email Address (Read-Only)
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="email"
                disabled
                value={userProfile?.email || ''}
                className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-[10px] border border-slate-200 text-base sm:text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          {!isEditable && (
            <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-[10px] border border-amber-200 leading-relaxed">
              Administrator accounts have read-only profile details for security verification.
            </p>
          )}

          {isEditable && (
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] flex items-center justify-center gap-2 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] shadow-sm transition-colors text-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
