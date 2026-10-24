import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../i18n/translations';
import { db, auth } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { User, Phone, Mail, Shield, Save, CheckCircle, ArrowLeft, Copy, Check, Gift, History } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);

  const [stats, setStats] = useState<{
    referralCode?: string;
    referralLink?: string;
    pointsBalance?: number;
    pointValueRwf?: number;
    referredCount?: number;
    history?: any[];
  } | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const res = await fetch('/api/referral/stats', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        console.warn('Error fetching referral stats in profile:', e);
      }
    };
    fetchStats();
  }, [userProfile]);

  const isEditable = userProfile?.role === 'student' || userProfile?.role === 'learner';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !isEditable) return;
    setSaving(true);
    setSuccessMessage(false);
    setErrorMessage(null);

    try {
      await updateDoc(doc(db, 'users', userProfile.uid), {
        name
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
          <span>
            {{
              en: "Back to Dashboard",
              rw: "Subira ku Ncamake",
              fr: "Retour au tableau de bord"
            }[language] || "Back to Dashboard"}
          </span>
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
              <span>
                {userProfile?.role === 'admin' 
                  ? 'Admin' 
                  : (language === 'rw' ? 'Umunyeshuri' : language === 'fr' ? 'Étudiant' : 'Student')}{' '}
                {{ en: "Account", rw: "Konti", fr: "Compte" }[language] || "Account"}
              </span>
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
            <span>
              {{
                en: "Profile successfully updated!",
                rw: "Porayili yavuguruwe neza!",
                fr: "Profil mis à jour avec succès !"
              }[language] || "Profile successfully updated!"}
            </span>
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
              {dict.phoneNumber} ({{ en: "Read-Only", rw: "Ntihindurwa", fr: "Lecture seule" }[language] || "Read-Only"})
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="tel"
                disabled
                value={phone}
                className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-[10px] border border-slate-200 text-base sm:text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              {{
                en: "Phone number is tied to your account identity and cannot be changed.",
                rw: "Nimero ya telefoni ihuriye na konti yawe kandi ntihindurwa.",
                fr: "Le numéro de téléphone est lié à votre identité de compte."
              }[language] || "Phone number is tied to your account identity and cannot be changed."}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {{
                en: "Email Address (Read-Only)",
                rw: "Aderesi ya Imeri (Ntihindurwa)",
                fr: "Adresse e-mail (Lecture seule)"
              }[language] || "Email Address (Read-Only)"}
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
              {{
                en: "Administrator accounts have read-only profile details for security verification.",
                rw: "Konti z'abayobozi zifite imiterirere idahindurwa ku mpamvu z'umutekano.",
                fr: "Les comptes administrateur ont des détails en lecture seule pour des raisons de sécurité."
              }[language] || "Administrator accounts have read-only profile details for security verification."}
            </p>
          )}

          {isEditable && (
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] flex items-center justify-center gap-2 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] shadow-sm transition-colors text-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>
                {saving 
                  ? ({ en: 'Saving...', rw: 'Birimo kubikwa...', fr: 'Enregistrement...' }[language] || 'Saving...') 
                  : ({ en: 'Save Changes', rw: 'Bika Impinduka', fr: 'Enregistrer les modifications' }[language] || 'Save Changes')}
              </span>
            </button>
          )}
        </form>
      </div>

      {/* Referral Program & Coins Section */}
      {isEditable && stats && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold text-xl">
                🪙
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {{
                    en: "Referral Program & TSINDA Coins",
                    rw: "Gahunda yo Gutumira n'Amanota ya TSINDA",
                    fr: "Programme de parrainage & Pièces TSINDA"
                  }[language] || "Referral Program & TSINDA Coins"}
                </h3>
                <p className="text-xs text-slate-500">
                  {{
                    en: "Earn coins when friends sign up and study. Redeem coins for free plans!",
                    rw: "Wunguke amanota igihe inshuti ziyandikishije kandi ziga. Gura amapaki ku buntu!",
                    fr: "Gagnez des pièces lorsque vos amis s'inscrivent et étudient !"
                  }[language] || "Earn coins when friends sign up and study."}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-lg sm:text-xl font-extrabold text-amber-600">
                {stats.pointsBalance || 0} {{ en: "Coins", rw: "Amanota", fr: "Pièces" }[language] || "Coins"}
              </span>
              <div className="text-[11px] text-slate-500">
                ≈ {(stats.pointsBalance || 0) * (stats.pointValueRwf || 1)} RWF
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100">
              <div className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-1">
                {{ en: "Your Referral Code", rw: "Kode yawe yo Gutumira", fr: "Votre code de parrainage" }[language] || "Your Referral Code"}
              </div>
              <div className="text-xl font-mono font-extrabold text-blue-700 tracking-wider">
                {stats.referralCode || userProfile?.referralCode || 'TSINDA'}
              </div>
              <div className="text-xs text-blue-600 mt-1">
                {{ en: "Friends referred:", rw: "Inshuti zatumiwe:", fr: "Amis parrainés :" }[language] || "Friends referred:"}{' '}
                <strong className="font-bold">{stats.referredCount || 0} {{ en: "students", rw: "abanyeshuri", fr: "étudiants" }[language] || "students"}</strong>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                {{ en: "Share Your Link", rw: "Sangiza Link Yawe", fr: "Partagez votre lien" }[language] || "Share Your Link"}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={stats.referralLink || ''}
                  className="bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono flex-1 min-w-0"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (stats.referralLink) {
                      navigator.clipboard.writeText(stats.referralLink);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2500);
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-bold shrink-0 flex items-center gap-1 shadow-xs"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>
                    {copied 
                      ? ({ en: 'Copied', rw: 'Byakopiwe', fr: 'Copié' }[language] || 'Copied') 
                      : ({ en: 'Copy', rw: 'Kopiye', fr: 'Copier' }[language] || 'Copy')}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Points Ledger History */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {{ en: "Coins Activity History", rw: "Amateka y'Amanota", fr: "Historique des pièces" }[language] || "Coins Activity History"}
              </h4>
            </div>

            {(!stats.history || stats.history.length === 0) ? (
              <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                {{
                  en: "No coin activity yet. Share your link to start earning coins!",
                  rw: "Nta mateka y'amanota ararangwa. Sangiza link yawe utangire kwiga!",
                  fr: "Aucune activité pour l'instant. Partagez votre lien !"
                }[language] || "No coin activity yet. Share your link to start earning coins!"}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white text-xs">
                {stats.history.map((item: any) => {
                  const isEarn = item.type === 'earn';
                  const dateStr = item.createdAt?.toDate 
                    ? item.createdAt.toDate().toLocaleDateString() 
                    : item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '';

                  return (
                    <div key={item.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {item.description || (isEarn 
                            ? ({ en: 'Referral Reward', rw: 'Ihembo ryo Gutumira', fr: 'Récompense de parrainage' }[language] || 'Referral Reward') 
                            : ({ en: 'Coins Redeemed', rw: 'Amanota Yakoreshejwe', fr: 'Pièces utilisées' }[language] || 'Coins Redeemed'))}
                        </div>
                        <div className="text-[11px] text-slate-400">{dateStr}</div>
                      </div>
                      <div className={`font-bold shrink-0 text-sm ${isEarn ? 'text-emerald-600' : 'text-slate-700'}`}>
                        {isEarn ? `+${Math.abs(item.amount || item.points)}` : `-${Math.abs(item.amount || item.points)}`} {{ en: "Coins", rw: "Amanota", fr: "Pièces" }[language] || "Coins"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
