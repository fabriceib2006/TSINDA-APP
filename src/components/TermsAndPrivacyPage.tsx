import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../i18n/translations';
import { ShieldCheck, FileText, Lock, ArrowLeft, Home, Globe } from 'lucide-react';
import { Language } from '../types';

export const TermsAndPrivacyPage: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const dict = t[language];
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>('terms');
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadConfig() {
      try {
        const snap = await getDoc(doc(db, 'siteSettings', 'config'));
        if (snap.exists()) {
          setSettings(snap.data());
        }
      } catch (err) {
        console.error('Error loading site settings:', err);
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'privacy') {
      setActiveTab('privacy');
    }
  }, []);

  const appName = settings?.appName || 'TSINDA';

  const defaultTerms = {
    en: `1. Acceptance of Terms\nBy accessing or using ${appName}, you agree to comply with and be bound by these Terms and Conditions.\n\n2. Use of Study Materials\nAll Rwanda National Gazette traffic rules, lessons, and mock exam questions are provided for personal study and driver license preparation in Rwanda.\n\n3. Subscription & Payments\nAccess to premium study materials and exam attempts requires an active subscription purchased via secure Mobile Money (MTN or Airtel) or points redemption.\n\n4. User Accounts\nYou are responsible for maintaining the confidentiality of your account credentials and phone number.`,
    rw: `1. Kwemera Amategeko\nMu kugera kuri cyangwa gukoresha ${appName}, wemeye kugengwa n'aya mategeko n'amabwiriza.\n\n2. Gukoresha Ibikoresho byo Kwiga\nAmategeko y'umuhanda yose y'Igazeti ya Leta, amasomo n'ibizamini by'igeragezo bitangirwa kwiga no kwitegura uruhushya rwo gutwara ibinyabiziga mu Rwanda.\n\n3. Fatabuguzi no Kwishyura\nKugera ku masomo yihariye bisaba ifatabuguzi ryishyurwa binyuze muri Mobile Money (MTN cyangwa Airtel) cyangwa gucungura amanota.\n\n4. Konti y'Umunyeshuri\nUfite inshingano zo kurinda umutekano w'amakuru ya konti yawe na nimero ya telefoni.`,
    fr: `1. Acceptation des conditions\nEn accédant à ${appName}, vous acceptez d'être lié par ces conditions générales.\n\n2. Utilisation du matériel\nToutes les règles du code de la route du Journal Officiel du Rwanda sont fournies pour l'étude personnelle.\n\n3. Abonnement et paiements\nL'accès au matériel d'étude premium nécessite un abonnement actif payé via Mobile Money (MTN ou Airtel).\n\n4. Comptes utilisateurs\nVous êtes responsable du maintien de la confidentialité des informations de votre compte.`
  };

  const defaultPrivacy = {
    en: `1. Information We Collect\nWe collect information you provide during registration, including your name, phone number, email address, and learning progress.\n\n2. How We Use Information\nYour information is used to manage your study progress, process mobile money subscriptions, and communicate important updates regarding your account.\n\n3. Data Security\nWe implement robust security measures to protect your personal information against unauthorized access.\n\n4. Contact Us\nIf you have any questions regarding our Privacy Policy, please contact our support team.`,
    rw: `1. Amakuru Dukoresha\nTwakira amakuru utanga wiyandikisha, harimo amazina yawe, nimero ya telefoni, imeri, n'intambwe wateye mu kwiga.\n\n2. Uburyo Dukoresha Amakuru\nAmakuru yawe akoreshwa mu gukurikirana imyigire yawe, kwakira amafaranga ya fatabuguzi, no kumenyekanisha amakuru ya konti.\n\n3. Umutekano w'Amakuru\nTushyiraho ingamba z'umutekano zo kurinda amakuru yawe bwite.\n\n4. Twandikire\nNiba ufite ikibazo cyerekeranye n'Ubutanga bw'Amakuru (Privacy), nyamuneka twandikire.`,
    fr: `1. Informations collectées\nNous collectons les informations fournies lors de l'inscription (nom, téléphone, e-mail).\n\n2. Utilisation des données\nVos informations sont utilisées pour gérer votre progression et vos abonnements.\n\n3. Sécurité des données\nNous protégeons vos informations personnelles contre tout accès non autorisé.\n\n4. Contactez-nous\nPour toute question concernant notre politique de confidentialité, contactez notre support.`
  };

  const termsContent = settings?.termsContent?.[language] || settings?.termsContent?.en || defaultTerms[language] || defaultTerms.en;
  const privacyContent = settings?.privacyContent?.[language] || settings?.privacyContent?.en || defaultPrivacy[language] || defaultPrivacy.en;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Navbar */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2">
              <div className="w-10 h-10 bg-blue-600 text-white font-black rounded-xl flex items-center justify-center shadow-xs">
                {appName[0]}
              </div>
              <span className="text-lg font-extrabold tracking-tight text-slate-900">{appName}</span>
            </a>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {(['en', 'rw', 'fr'] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-colors ${
                    language === lang ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            <a
              href="/"
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
            >
              <Home className="w-4 h-4 text-blue-600" />
              <span>{language === 'rw' ? 'Ahabanza' : language === 'fr' ? 'Accueil' : 'Home'}</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {activeTab === 'terms' ? (language === 'rw' ? "Amategeko n'Amabwiriza" : language === 'fr' ? "Termes et Conditions" : "Terms & Conditions") : (language === 'rw' ? "Politiki y'Ubwitege" : language === 'fr' ? "Politique de Confidentialité" : "Privacy Policy")}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {appName} Rwanda National Driving Theory Prep Platform
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-200/80 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('terms')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'terms' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {language === 'rw' ? "Amategeko" : language === 'fr' ? "Conditions" : "Terms"}
            </button>
            <button
              onClick={() => setActiveTab('privacy')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'privacy' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {language === 'rw' ? "Ubwitege" : language === 'fr' ? "Confidentialité" : "Privacy"}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="prose prose-slate max-w-none text-sm leading-relaxed whitespace-pre-line text-slate-700">
            {activeTab === 'terms' ? termsContent : privacyContent}
          </div>

          <div className="pt-6 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Last updated: October 2026</span>
            <a href="/student?mode=signup" className="text-blue-600 font-bold hover:underline">
              {language === 'rw' ? "Subira aho kwiyandikisha" : language === 'fr' ? "Retour à l'inscription" : "Return to Registration"} &rarr;
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#0B132B] text-slate-400 py-8 text-center text-xs">
        &copy; {new Date().getFullYear()} {appName}. All rights reserved.
      </footer>
    </div>
  );
};
