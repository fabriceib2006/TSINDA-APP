import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Language } from '../types';
import { t, homepageT } from '../i18n/translations';
import { 
  BookOpen, Award, Play, UserPlus, CreditCard, CheckCircle2, TrendingUp, Users, ShieldCheck, Globe, Star, Gift, Sparkles,
  ArrowRight, Mail, Phone, X, Menu, ChevronDown, AlertCircle,
  Instagram, Facebook, Twitter, Youtube, Linkedin, MessageCircle, MapPin
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getText } from '../lib/i18n';
import { getBestPromotion } from '../lib/promotionUtils';
import { formatCountdown } from '../lib/timeUtils';

export const HomePage: React.FC = () => {
  const { userProfile } = useAuth();
  const { language, setLanguage } = useLanguage();
  const dict = t[language];

  const [siteSettings, setSiteSettings] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [footerGroups, setFooterGroups] = useState<any[]>([]);
  const [footerLinks, setFooterLinks] = useState<any[]>([]);
  const [socialLinks, setSocialLinks] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [activeSub, setActiveSub] = useState<{ planName: string; endDate: string } | null>(null);
  const [imageSlots, setImageSlots] = useState<Record<string, string>>({});
  const [heroPreview, setHeroPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);


  // Auth overlay
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>([]);
  const [openFaqIds, setOpenFaqIds] = useState<string[]>([]);
  const toggleFaq = (id: string) => {
    setOpenFaqIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const formatCatDate = (dateInput: string | Date | number): string => {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
    if (!d || isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Kigali',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);

    const day = parts.find(p => p.type === 'day')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const year = parts.find(p => p.type === 'year')?.value || '';
    const hour = parts.find(p => p.type === 'hour')?.value || '';
    const minute = parts.find(p => p.type === 'minute')?.value || '';

    return `${day}/${month}/${year} ${hour}:${minute} CAT`;
  };

  useEffect(() => {
    if (!userProfile?.uid) {
      setActiveSub(null);
      return;
    }
    const subsQuery = query(
      collection(db, 'subscriptions'),
      where('userId', '==', userProfile.uid),
      where('status', '==', 'active')
    );
    const unsub = onSnapshot(subsQuery, (snap) => {
      const now = new Date();
      const active = snap.docs
        .map(d => d.data())
        .find(s => s.endDate && new Date(s.endDate) > now);
      if (active) {
        setActiveSub({
          planName: active.planName || 'Active Plan',
          endDate: active.endDate,
        });
      } else {
        setActiveSub(null);
      }
    }, (err) => {
      console.warn("Could not load user active subscription:", err);
      setActiveSub(null);
    });
    return () => unsub();
  }, [userProfile]);

  useEffect(() => {
    const faviconUrl = imageSlots['favicon'] || siteSettings?.faviconUrl;
    if (faviconUrl) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = faviconUrl;
    }
  }, [imageSlots, siteSettings]);

  useEffect(() => {
    async function fetchHomeData() {
      try {
        // Fetch site settings and SEO
        const setSnap = await getDoc(doc(db, 'siteSettings', 'config')).catch(() => null);
        if (setSnap && setSnap.exists()) {
          const settings = setSnap.data();
          setSiteSettings(settings);
          document.title = settings.seo?.title || settings.appName;
          const metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc) metaDesc.setAttribute('content', settings.seo?.description || '');
        }

        // Fetch trust stats, sections, items, announcements, footer, social, promotions, imageSlots
        const [statsSnap, lSnap, vSnap, secSnap, itemSnap, annSnap, fgSnap, flSnap, socSnap, promoSnap, slotSnap] = await Promise.all([
            getDoc(doc(db, 'siteStats', 'summary')).catch((err) => { console.warn('Could not load siteStats:', err); return null; }),
            getDocs(collection(db, 'lessons')).catch((err) => { console.warn('Could not load lessons count:', err); return null; }),
            getDocs(collection(db, 'videos')).catch((err) => { console.warn('Could not load videos count:', err); return null; }),
            getDocs(collection(db, 'homepageSections')).catch((err) => { console.warn('Could not load homepageSections:', err); return null; }),
            getDocs(collection(db, 'homepageItems')).catch((err) => { console.warn('Could not load homepageItems:', err); return null; }),
            getDocs(collection(db, 'announcements')).catch((err) => { console.warn('Could not load announcements:', err); return null; }),
            getDocs(collection(db, 'footerGroups')).catch((err) => { console.warn('Could not load footerGroups:', err); return null; }),
            getDocs(collection(db, 'footerLinks')).catch((err) => { console.warn('Could not load footerLinks:', err); return null; }),
            getDocs(collection(db, 'socialLinks')).catch((err) => { console.warn('Could not load socialLinks:', err); return null; }),
            getDocs(collection(db, 'promotions')).catch((err) => { console.warn('Could not load promotions:', err); return null; }),
            getDocs(collection(db, 'imageSlots')).catch((err) => { console.warn('Could not load imageSlots:', err); return null; }),
        ]);

        const statsData = statsSnap && statsSnap.exists() ? statsSnap.data() : null;


        if (secSnap) setSections(secSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((s: any) => s.isVisible).sort((a: any, b: any) => (a.order || 0) - (b.order || 0)));
        if (itemSnap) setItems(itemSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((i: any) => i.isVisible));
        if (annSnap) setAnnouncements(annSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => a.isActive));
        if (fgSnap) setFooterGroups(fgSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((g: any) => g.isVisible).sort((a: any, b: any) => (a.order || 0) - (b.order || 0)));
        if (flSnap) setFooterLinks(flSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((l: any) => l.isVisible).sort((a: any, b: any) => (a.order || 0) - (b.order || 0)));
        if (socSnap) setSocialLinks(socSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((s: any) => s.isVisible).sort((a: any, b: any) => (a.order || 0) - (b.order || 0)));
        if (promoSnap) setPromotions(promoSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((p: any) => p.isActive));
        if (slotSnap) {
          const slotsMap: Record<string, string> = {};
          slotSnap.docs.forEach(d => {
            const data = d.data();
            if (data.slotKey && data.imageUrl) {
              slotsMap[data.slotKey] = data.imageUrl;
            }
          });
          setImageSlots(slotsMap);
        }
        
        const previewSnap = await getDoc(doc(db, 'homepageItems', 'heroPreview')).catch(() => null);
        if (previewSnap && previewSnap.exists()) {
            setHeroPreview(previewSnap.data());
        }

      } catch (err) {
        console.error('Error loading homepage data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchHomeData();
    const plansQuery = query(collection(db, 'plans'), where('isActive', '==', true));
    const unsubscribePlans = onSnapshot(plansQuery, (snap) => {
        const plansList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        plansList.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
        setPlans(plansList);
    }, (err) => {
        console.warn('Error fetching plans in HomePage:', err);
    });
    return () => unsubscribePlans();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-600">Loading TSINDA Homepage...</p>
        </div>
      </div>
    );
  }

  // Maintenance mode check
  if (siteSettings?.maintenanceMode) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4">
          <div className="w-16 h-16 bg-blue-600/20 text-blue-500 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
            T
          </div>
          <h1 className="text-2xl font-extrabold">{siteSettings.appName || 'TSINDA'} is under maintenance</h1>
          <p className="text-sm text-slate-400">We are currently updating our study materials in accordance with the Rwanda National Gazette. Please check back soon.</p>
          <button
            onClick={() => {
              window.location.href = '/admin/login';
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs"
          >
            Admin Login
          </button>
        </div>
      </div>
    );
  }

  const appName = siteSettings?.appName || 'TSINDA';
  const tagline = siteSettings?.tagline?.[language] || siteSettings?.tagline?.en || 'Master your Rwandan driving theory and exam prep';
  const primaryColor = siteSettings?.primaryColor || '#2563eb';

  const getSectionItems = (sectionType: string) => {
    return items.filter(i => {
      // match sectionId to section type or id
      const sec = sections.find(s => s.type === sectionType || s.id === i.sectionId);
      return sec && (i.sectionId === sec.id || i.sectionId === sec.type);
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* NAVBAR */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Toggle mobile menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              {imageSlots['logo'] || siteSettings?.logoUrl ? (
                <img src={imageSlots['logo'] || siteSettings?.logoUrl} alt={appName} className="w-10 h-10 object-cover rounded-xl shadow-sm" />
              ) : (
                <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-extrabold text-lg shadow-sm">
                  {appName[0]}
                </div>
              )}
              <span className="text-lg font-black tracking-tight text-slate-900">{appName}</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">{getText(homepageT.features, language)}</a>
            <a href="#howItWorks" className="hover:text-blue-600 transition-colors">{getText(homepageT.howItWorks, language)}</a>
            <a href="#plans" className="hover:text-blue-600 transition-colors">{getText(homepageT.pricing, language)}</a>
            <a href="#faq" className="hover:text-blue-600 transition-colors">{getText(homepageT.faq, language)}</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {/* Language Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {(['en', 'rw', 'fr'] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase transition-colors ${
                    language === lang ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            {userProfile ? (
              <button
                onClick={() => {
                  window.location.href = userProfile.role === 'admin' ? '/admin' : '/student';
                }}
                className="min-h-[38px] px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                {t[language].dashboard || 'Dashboard'}
              </button>
            ) : (
              <>
                <a
                  href="/student"
                  className="hidden sm:flex min-h-[38px] px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors items-center gap-1.5"
                >
                  {t[language].signIn || 'Sign In'}
                </a>

                <a
                  href="/student?mode=signup"
                  className="min-h-[38px] px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                >
                  {t[language].getStarted || 'Get Started'}
                </a>
              </>
            )}
          </div>
        </div>

        {/* Mobile Navigation Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-200 px-4 py-4 space-y-4 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Language Switcher in Mobile Menu */}
            <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2">Language</span>
              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                {(['en', 'rw', 'fr'] as Language[]).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      setLanguage(lang);
                    }}
                    className={`px-3 py-1 rounded-md text-xs font-bold uppercase transition-colors ${
                      language === lang ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            <nav className="flex flex-col space-y-1 text-sm font-bold text-slate-700">
              <a 
                href="#features" 
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-800 transition-colors"
              >
                {getText(homepageT.features, language)}
              </a>
              <a 
                href="#howItWorks" 
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-800 transition-colors"
              >
                {getText(homepageT.howItWorks, language)}
              </a>
              <a 
                href="#plans" 
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-800 transition-colors"
              >
                {getText(homepageT.pricing, language)}
              </a>
              <a 
                href="#faq" 
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-800 transition-colors"
              >
                {getText(homepageT.faq, language)}
              </a>
            </nav>

            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              {userProfile ? (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    window.location.href = userProfile.role === 'admin' ? '/admin' : '/student';
                  }}
                  className="w-full text-center py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-sm transition-colors flex items-center justify-center gap-2"
                >
                  <span>{t[language].dashboard || 'Dashboard'}</span>
                </button>
              ) : (
                <>
                  <a
                    href="/student"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition-colors"
                  >
                    {t[language].signIn || 'Sign In'}
                  </a>
                  <a
                    href="/student?mode=signup"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-sm transition-colors"
                  >
                    {t[language].getStarted || 'Get Started'}
                  </a>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ACTIVE ANNOUNCEMENTS BANNER */}
      {announcements.filter(a => !dismissedAnnouncements.includes(a.id)).map(ann => (
        <div key={ann.id} className="bg-blue-600 text-white px-4 py-2.5 text-xs font-medium text-center flex items-center justify-center gap-2">
          <span className="bg-white/20 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider text-[10px]">{ann.type}</span>
          <span>{ann.title?.[language] || ann.title?.en}: {ann.body?.[language] || ann.body?.en}</span>
          <button onClick={() => setDismissedAnnouncements([...dismissedAnnouncements, ann.id])} className="hover:text-white/80"><X className="w-4 h-4" /></button>
        </div>
      ))}



      {/* MAIN SECTIONS FROM FIRESTORE */}
      <main className="flex-1">
        {sections.map((section) => {
          if (section.type === 'hero') {
            return (
              <section key={section.id} className="relative py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-50/80 via-indigo-50/20 to-white overflow-hidden">
                  {/* Two-column hero */}
                  <div className="flex flex-col lg:flex-row items-center justify-between gap-12 max-w-7xl mx-auto py-12 lg:py-16">
                    <div className="flex-1 text-center lg:text-left space-y-6">
                      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-200 shadow-2xs">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        <span>{t[language].certifiedBadge || 'Rwanda National Gazette Certified'}</span>
                      </div>
                      <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
                        {section.title?.[language] || section.title?.en || tagline}
                      </h1>
                      <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                        {section.subtitle?.[language] || section.subtitle?.en}
                      </p>

                      {/* Three small trust chips */}
                      <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-2">
                      </div>

                      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
                        <a
                          href="/student?mode=signup"
                          className="w-full sm:w-auto min-h-[48px] px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition-all"
                        >
                          <span>{t[language].getStarted || 'Start Learning Now'}</span>
                          <ArrowRight className="w-4 h-4" />
                        </a>
                        <a
                          href="/student"
                          className="w-full sm:w-auto min-h-[48px] px-8 py-3.5 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-sm border border-slate-200 transition-all text-center flex items-center justify-center"
                        >
                          {t[language].signIn || 'Student Sign In'}
                        </a>
                      </div>
                    </div>

                    {/* Right column: image slot or phone preview */}
                    <div className="flex-none flex justify-center w-full lg:w-auto">
                      {imageSlots['hero'] || section.imageUrl ? (
                        <img src={imageSlots['hero'] || section.imageUrl} alt="Hero" className="max-w-full lg:max-w-md h-auto rounded-3xl shadow-xl border border-slate-200" />
                      ) : (
                        <div className="w-full max-w-[280px] lg:max-w-sm bg-slate-900 rounded-[40px] p-4 shadow-2xl border-4 border-slate-800 transform lg:rotate-1 lg:hover:rotate-0 transition-transform duration-300">
                          <div className="w-32 h-4 bg-slate-800 rounded-full mx-auto mb-4"></div>
                          <div className="bg-white rounded-[28px] p-5 text-left space-y-4 shadow-inner">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                              <div>
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">{heroPreview?.label?.[language] || heroPreview?.label?.en || t[language].provisionalExam || 'Provisional Exam'}</span>
                                <div className="text-xs font-bold text-slate-900 mt-1">{heroPreview?.questionNumber?.[language] || heroPreview?.questionNumber?.en || t[language].questionLabel || 'Question 5 of 20'}</div>
                              </div>
                              <div className="flex items-center gap-1.5 bg-rose-50 text-rose-600 px-3 py-1.5 rounded-xl text-xs font-mono font-bold">
                                <span>⏱ 20:00</span>
                              </div>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div className="bg-blue-600 h-full w-1/4 rounded-full"></div>
                            </div>
                            <p className="text-xs sm:text-sm font-bold text-slate-800 leading-snug">
                              {heroPreview?.question?.[language] || heroPreview?.question?.en || t[language].sampleQuestion || 'When approaching a roundabout where traffic is already circulating, you must:'}
                            </p>
                            <div className="space-y-2">
                              {['A', 'B', 'C', 'D'].map((opt) => {
                                const isCorrect = heroPreview?.correctOption === opt;
                                return (
                                  <div key={opt} className={`p-3 rounded-xl border ${isCorrect ? 'border-2 border-blue-600 bg-blue-50/60 text-blue-900' : 'border-slate-200 text-slate-700 bg-slate-50/50'} text-xs font-bold flex items-center justify-between`}>
                                    <span>{opt}. {heroPreview?.[`option${opt}` as keyof typeof heroPreview]?.[language] || heroPreview?.[`option${opt}` as keyof typeof heroPreview]?.en || (t[language] as any)[`option${opt}`] || 'Option'}</span>
                                    {isCorrect && <span className="w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px]">✓</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="w-28 h-1 bg-slate-700 rounded-full mx-auto mt-4"></div>
                        </div>
                      )}
                    </div>
                  </div>
              </section>
            );
          }

          if (section.type === 'features') {
            const rawItems = getSectionItems('features');
            const secItems = [...rawItems];
            if (!secItems.some(i => i.iconName === 'Gift' || (i.title?.en && i.title.en.toLowerCase().includes('refer')))) {
              secItems.push({
                id: 'feature-referral',
                title: {
                  en: 'Refer & Earn Free Plans',
                  rw: 'Sangiza Bagenzi Wunguke Amanota',
                  fr: 'Parrainez & Gagnez Gratuitement'
                },
                description: {
                  en: 'Share your personal referral link with friends. Earn reward points on every confirmed subscription and redeem them to buy plans 100% free without paying money!',
                  rw: 'Sangiza inshuti zawe link yawe, uzigame amanota kuri buri fatabuguzi maze uyakoreshe ugura amapaki ku buntu nta mafaranga utanze!',
                  fr: 'Invitez vos amis avec votre lien de parrainage. Gagnez des points sur chaque abonnement et échangez-les pour obtenir des plans d\'étude 100% gratuits !'
                },
                iconName: 'Gift',
                order: 4,
                isVisible: true,
                isReferralCard: true
              });
            }

            const featureIconMap: Record<string, React.ElementType> = {
              BookOpen, Award, Play, UserPlus, CreditCard, CheckCircle2, TrendingUp, Users, ShieldCheck, Globe, Star, Gift, Sparkles
            };
            return (
              <section key={section.id} id="features" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900">{section.title?.[language] || section.title?.en}</h2>
                  <p className="text-sm text-slate-600 max-w-lg mx-auto">{section.subtitle?.[language] || section.subtitle?.en}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {secItems.map((item, idx) => {
                    const IconComponent = featureIconMap[item.iconName] || Star;
                    const slotKey = idx === 0 ? 'feature-lessons' : idx === 1 ? 'feature-exams' : idx === 2 ? 'feature-videos' : null;
                    const cardImg = (slotKey && imageSlots[slotKey]) || item.imageUrl;
                    const isPromoCard = Boolean((item as any).isReferralCard || item.iconName === 'Gift');

                    return (
                      <div 
                        key={item.id || idx} 
                        className={`p-8 rounded-2xl border shadow-xs space-y-4 hover:-translate-y-1 transition-all duration-300 hover:shadow-md relative flex flex-col justify-between ${
                          isPromoCard 
                            ? 'bg-gradient-to-b from-amber-50/70 to-white border-amber-300 ring-1 ring-amber-200' 
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        {isPromoCard && (
                          <div className="absolute -top-3 right-4 bg-amber-500 text-white text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            <span>100% Free Pass</span>
                          </div>
                        )}
                        <div className="space-y-4">
                          {cardImg ? (
                            <img src={cardImg} alt="" className="w-12 h-12 rounded-2xl object-cover border border-slate-200" />
                          ) : (
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                              isPromoCard ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'
                            }`}>
                              <IconComponent className="w-6 h-6" />
                            </div>
                          )}
                          <h3 className="text-lg font-bold text-slate-900">{item.title?.[language] || item.title?.en}</h3>
                          <p className="text-sm text-slate-600 leading-relaxed">{item.description?.[language] || item.description?.en}</p>
                        </div>

                        {isPromoCard && (
                          <div className="pt-2">
                            <a
                              href={userProfile ? '/student' : '/student?mode=signup'}
                              className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800 transition-colors"
                            >
                              <span>{language === 'rw' ? 'Tangira Gutsindira Amapaki' : language === 'fr' ? 'Commencer à Parrainer' : 'Start Referring & Earning'}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          }

          if (section.type === 'howItWorks') {
            const secItems = getSectionItems('howItWorks').sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
            return (
              <section key={section.id} id="howItWorks" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto bg-slate-100/70 rounded-3xl my-10 space-y-12 relative overflow-hidden">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900">{section.title?.[language] || section.title?.en}</h2>
                  <p className="text-sm text-slate-600 max-w-lg mx-auto">{section.subtitle?.[language] || section.subtitle?.en}</p>
                </div>

                <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Connecting line on desktop and vertical line on mobile */}
                  <div className="hidden md:block absolute top-1/2 left-16 right-16 h-0.5 bg-blue-200 -translate-y-8 z-0"></div>
                  <div className="md:hidden absolute top-12 bottom-12 left-1/2 w-0.5 bg-blue-200 -translate-x-1/2 z-0"></div>

                  {secItems.map((item, idx) => {
                    const rawTitle = item.title?.[language] || item.title?.en || '';
                    const cleanTitle = rawTitle.replace(/^\d+[\.\-\)]\s*/, '');
                    return (
                      <div key={item.id || idx} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4 relative z-10 flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-bold text-base shadow-md">
                          {idx + 1}
                        </div>
                        <h3 className="text-lg font-bold text-slate-900">{cleanTitle}</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">{item.description?.[language] || item.description?.en}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          }

          
          if (section.type === 'plans') {
            const sortedPlans = [...plans].sort((a,b) => a.sortOrder - b.sortOrder);
            return (
              <section key={section.id} id="plans" className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
                <div className="text-center space-y-1.5">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {section.title?.[language] || section.title?.en || getText(homepageT.pricing, language)}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
                    {section.subtitle?.[language] || section.subtitle?.en || (language === 'rw' ? 'Hitamo gahunda igufasha gutsinda' : language === 'fr' ? 'Choisissez un plan d\'étude adapté à vos objectifs' : 'Choose a study plan that fits your goals')}
                  </p>
                </div>

                {activeSub && (
                  <div className="max-w-fit mx-auto px-5 py-2 bg-emerald-50 text-emerald-800 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 border border-emerald-200/90 shadow-2xs mb-4">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {language === 'rw'
                        ? `Ufite ifatabuguzi rikora kugeza ${formatCatDate(activeSub.endDate)}`
                        : language === 'fr'
                        ? `Vous avez un abonnement actif jusqu'au ${formatCatDate(activeSub.endDate)}`
                        : `You have an active plan until ${formatCatDate(activeSub.endDate)}`}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch max-w-6xl mx-auto pt-2">
                  {sortedPlans.map((plan) => {
                    const promoInfo = getBestPromotion(plan.id, plan.price, promotions);
                    const isRecommended = plan.isRecommended;

                    return (
                      <div
                        key={plan.id}
                        className={`bg-white p-7 rounded-2xl relative flex flex-col justify-between transition-all ${
                          isRecommended
                            ? 'border-2 border-blue-600 shadow-sm'
                            : 'border border-slate-200 shadow-2xs'
                        }`}
                      >
                        {isRecommended && (
                          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-bold px-3.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs whitespace-nowrap">
                            {getText(homepageT.recommended, language)}
                          </div>
                        )}
                        {promoInfo.hasPromotion && (
                          <div className="absolute -top-3.5 right-4 bg-rose-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs flex items-center gap-1">
                            <span>🔥 {promoInfo.discountBadge} OFF</span>
                          </div>
                        )}

                        <div className="space-y-4">
                          <div>
                            <h3 className="text-base sm:text-lg font-bold text-slate-900">
                              {plan.name[language] || plan.name.en}
                            </h3>
                            <div className="mt-1">
                              {promoInfo.hasPromotion ? (
                                <div className="flex items-baseline gap-2">
                                  <span className="text-2xl sm:text-3xl font-black text-slate-900">
                                    RWF {promoInfo.discountedPrice.toLocaleString()}
                                  </span>
                                  <span className="text-xs text-slate-400 line-through">
                                    RWF {plan.price.toLocaleString()}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-2xl sm:text-3xl font-black text-slate-900">
                                  RWF {plan.price.toLocaleString()}
                                </div>
                              )}
                              <div className="text-xs font-medium text-slate-400 mt-0.5">
                                {plan.durationDays === 1 
                                  ? getText(homepageT.daysSingular, language).replace('{n}', '1') 
                                  : getText(homepageT.daysPlural, language).replace('{n}', plan.durationDays?.toString() || '30')}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3 pt-5 border-t border-slate-100 text-xs sm:text-sm text-slate-700">
                            <div className="flex items-center gap-2.5">
                              {plan.access?.lessonVideos ? (
                                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0">✓</span>
                              ) : (
                                <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-[10px] shrink-0">✕</span>
                              )}
                              <span className={plan.access?.lessonVideos ? 'font-medium text-slate-900' : 'text-slate-400'}>
                                {getText(homepageT.videoLessons, language)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2.5">
                              {plan.access?.trafficRules ? (
                                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0">✓</span>
                              ) : (
                                <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-[10px] shrink-0">✕</span>
                              )}
                              <span className={plan.access?.trafficRules ? 'font-medium text-slate-900' : 'text-slate-400'}>
                                {getText(homepageT.trafficRules, language)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2.5">
                              {plan.access?.exams ? (
                                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0">✓</span>
                              ) : (
                                <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-[10px] shrink-0">✕</span>
                              )}
                              <span className={plan.access?.exams ? 'font-medium text-slate-900' : 'text-slate-400'}>
                                {plan.access?.exams 
                                  ? (plan.examLimit 
                                      ? (plan.examLimit === 1 ? getText(homepageT.examCountSingular, language).replace('{n}', '1') : getText(homepageT.examCountPlural, language).replace('{n}', plan.examLimit.toString())) 
                                      : getText(homepageT.unlimitedExams, language)) 
                                  : getText(homepageT.exams, language)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-6">
                          <button
                            disabled={!!activeSub}
                            onClick={() => {
                              if (activeSub) return;
                              window.location.href = userProfile ? '/student' : `/signup?plan=${plan.id}`;
                            }}
                            className={`w-full py-3 rounded-xl font-bold text-xs sm:text-sm transition-colors text-center ${
                              activeSub
                                ? isRecommended
                                  ? 'bg-blue-600 text-white cursor-default shadow-xs'
                                  : 'bg-slate-200/90 text-slate-500 cursor-not-allowed'
                                : isRecommended
                                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                                : 'bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-800'
                            }`}
                          >
                            {activeSub
                              ? (language === 'rw' ? 'Gahunda Iri Gukora' : language === 'fr' ? 'Abonnement actif en cours' : 'Active Plan in Progress')
                              : getText(homepageT.choosePlan, language)}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          }

          if (section.type === 'testimonials') {
            const defaultTestimonials = [
              {
                id: 't-1',
                name: 'Jean Pierre N.',
                role: 'Passed Provisional Test (98%)',
                avatar: '/src/assets/images/avatar_jean_pierre_1793142909650.jpg',
                stars: 5,
                text: {
                  en: 'I passed my provisional driving test on the first attempt with 98% score thanks to official lessons in Kinyarwanda and English on TSINDA.',
                  rw: 'Natsinze ikizamini cya provisional ku nshuro ya mbere n\'amanota 98% kubera kwitoza mu Kinyarwanda no mu Cyongereza kuri TSINDA.',
                  fr: 'J\'ai réussi mon examen provisoire du premier coup avec 98% de score grâce aux leçons officielles sur TSINDA.'
                }
              },
              {
                id: 't-2',
                name: 'Marie Claire U.',
                role: 'Passed with 95%',
                avatar: '/src/assets/images/avatar_marie_claire_1793142909484.jpg',
                stars: 5,
                text: {
                  en: 'The timed mock exams gave me the exact confidence needed for the Police exam room. Highly recommended for every learner driver!',
                  rw: 'Ibizamini bipimwe igihe byampaye ikizere nyacyo nari nkeneye mu cyumba cy\'ibizamini bya Polisi.',
                  fr: 'Les examens blancs chronométrés m\'ont donné la confiance exacte requise pour la salle d\'examen.'
                }
              },
              {
                id: 't-3',
                name: 'Eric Mugabo',
                role: 'First Attempt Success',
                avatar: '/src/assets/images/avatar_jean_pierre_1793142909650.jpg',
                stars: 5,
                text: {
                  en: 'Mobile money payment was instant, and studying road signs on my phone saved me weeks of time. Amazing platform!',
                  rw: 'Kwishyura na Mobile Money byari byoroshye, kwigira kuri telefone byamfashije kuzigama igihe kinini.',
                  fr: 'Le paiement mobile money était instantané et étudier sur mon mobile m\'a fait gagner un temps précieux.'
                }
              },
              {
                id: 't-4',
                name: 'Diane Uwase',
                role: 'Scored 19/20',
                avatar: '/src/assets/images/avatar_marie_claire_1793142909484.jpg',
                stars: 5,
                text: {
                  en: 'The referral program even let me earn free study access by inviting my classmates. TSINDA is a game changer!',
                  rw: 'Gahunda y\'abatumirwa yamfashije kubona ifatabuguzi ryiza ku buntu nyuma yo gutumira abandi banyeshuri.',
                  fr: 'Le programme de parrainage m\'a même permis d\'obtenir un accès gratuit en invitant mes camarades.'
                }
              }
            ];

            return (
              <section key={section.id} className="py-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-10">
                <div className="text-center space-y-3 max-w-2xl mx-auto">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold tracking-wide border border-blue-100 shadow-2xs">
                    <span>🌟 Verified Success Stories</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                    {section.title?.[language] || section.title?.en || (language === 'rw' ? 'Ubuhamya bw\'Abatsinze' : language === 'fr' ? 'Témoignages' : 'Success Stories')}
                  </h2>
                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                    {section.subtitle?.[language] || section.subtitle?.en || (language === 'rw' ? 'Icyo abanyeshuri bacu batsinze bavuga kuri TSINDA' : language === 'fr' ? 'Ce que disent nos apprenants' : 'Read how thousands of Rwandan drivers passed on their first try')}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  {defaultTestimonials.map((tItem) => (
                    <div
                      key={tItem.id}
                      className="bg-white p-7 sm:p-8 rounded-3xl border border-slate-200/90 shadow-xs hover:shadow-lg transition-all duration-300 space-y-5 flex flex-col justify-between group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform"></div>
                      <div className="space-y-4 relative z-10">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={tItem.avatar}
                              alt={tItem.name}
                              className="w-12 h-12 rounded-2xl object-cover shadow-sm border-2 border-white ring-2 ring-blue-100"
                            />
                            <div>
                              <h4 className="font-extrabold text-slate-900 text-sm sm:text-base">{tItem.name}</h4>
                              <p className="text-xs font-medium text-blue-600">{tItem.role}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200/60">
                            {[...Array(tItem.stars)].map((_, i) => (
                              <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            ))}
                          </div>
                        </div>

                        <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-normal italic">
                          "{tItem.text[language] || tItem.text.en}"
                        </p>
                      </div>

                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-400 relative z-10">
                        <span>Rwanda National Police Exam Prep</span>
                        <span className="text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verified Pass
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          }

          if (section.type === 'faq') {
            const faqList = [
              {
                id: 'faq-1',
                title: {
                  en: 'Can I pay using Mobile Money?',
                  rw: 'Ese nshobora kwishyura nkoresheje Mobile Money?',
                  fr: 'Puis-je payer avec Mobile Money ?'
                },
                description: {
                  en: 'Yes! You can instantly pay securely using MTN Mobile Money or Airtel Money directly on the platform.',
                  rw: 'Yego rwose! Ushobora kwishyura ukoresheje MTN Mobile Money cyangwa Airtel Money ako kanya.',
                  fr: 'Oui ! Vous pouvez payer instantanément et en toute sécurité via MTN Mobile Money ou Airtel Money.'
                }
              },
              {
                id: 'faq-2',
                title: {
                  en: 'Are the lessons aligned with Rwandan laws?',
                  rw: 'Ese amasomo ahuye n\'amategeko y\'u Rwanda?',
                  fr: 'Les leçons sont-elles conformes aux lois rwandaises ?'
                },
                description: {
                  en: 'All lessons and mock questions strictly follow the official Rwanda National Gazette traffic regulations.',
                  rw: 'Amasomo yose n\'ibibazo by\'ikizamini bikurikiza Amategeko y\'Umuhanda yemejwe mu Igazeti ya Leta y\'u Rwanda.',
                  fr: 'Toutes les leçons et questions suivent strictement la réglementation du Journal Officiel du Rwanda.'
                }
              },
              {
                id: 'faq-3',
                title: {
                  en: 'How do I track my progress?',
                  rw: 'Nkurikirana nte imyigire yanjye?',
                  fr: 'Comment suivre ma progression ?'
                },
                description: {
                  en: 'You can view your detailed exam scores and performance breakdown on your dashboard under Results History.',
                  rw: 'Ushobora kureba amanota n\'uburyo utera imbere kuri Dashboard yawe mu gice cy\'Amateka y\'Ibisubizo.',
                  fr: 'Vous pouvez consulter vos scores détaillés et votre progression dans l\'Historique des résultats.'
                }
              },
              {
                id: 'faq-4',
                title: {
                  en: 'Are the study materials updated?',
                  rw: 'Ese ibikoresho byo kwiga biravuguruye?',
                  fr: 'Le matériel d\'étude est-il à jour ?'
                },
                description: {
                  en: 'Yes, we continuously update our questions and explanations in accordance with the Rwanda National Police theory syllabus.',
                  rw: 'Yego, tuvugurura ibibazo n\'ibisobanuro buri gihe dukurikije amategeko n\'ibizamini bya Polisi y\'u Rwanda.',
                  fr: 'Oui, nous mettons régulièrement à jour nos questions selon les directives officielles de la Police Nationale.'
                }
              },
              {
                id: 'faq-5',
                title: {
                  en: 'Can I access this on mobile?',
                  rw: 'Ese nshobora gukoresha uru rubuga kuri telefoni?',
                  fr: 'Puis-je accéder à ceci sur mobile ?'
                },
                description: {
                  en: 'Absolutely! TSINDA is 100% responsive and optimized for smartphones, tablets, and computers with no app download needed.',
                  rw: 'Yego rwose! TSINDA ikora neza 100% kuri telefone, mudasobwa na tablets nta porogaramu yindi ubanje gushyiramo.',
                  fr: 'Absolument ! TSINDA est 100% responsive et optimisée pour tous les smartphones, tablettes et ordinateurs.'
                }
              },
              {
                id: 'faq-6',
                title: {
                  en: 'How many marks are required to pass the provisional driving test?',
                  rw: 'Ni amanota angahe asabwa kugira ngo wtsinde ikizamini cya provisional?',
                  fr: 'Combien de points faut-il pour réussir l\'examen provisoire ?'
                },
                description: {
                  en: 'In Rwanda, you need at least 12 out of 20 correct answers (60%) to pass the provisional driving theory test. TSINDA mock exams use the exact same passing criteria.',
                  rw: 'Mu Rwanda, ukeneye nibura ibibazo 12 kuri 20 by\'ukuri (60%) kugira ngo wtsinde ikizamini cya provisional.',
                  fr: 'Au Rwanda, vous avez besoin d\'au moins 12 bonnes réponses sur 20 (60%) pour réussir.'
                }
              },
              {
                id: 'faq-7',
                title: {
                  en: 'How do referral points and free plans work?',
                  rw: 'Nshobora nte kwiteza imbere nkoresha amanota y\'abatumirwa?',
                  fr: 'Comment fonctionnent les points de parrainage ?'
                },
                description: {
                  en: 'Share your unique invite link with friends. When they subscribe, you earn points redeemable for 100% free study plans without paying any money.',
                  rw: 'Sangiza inshuti zawe link yihariye. Ziramutse ziguze ifatabuguzi, watsindira amanota yo guhahira amapaki ku buntu.',
                  fr: 'Partagez votre lien d\'invitation. Lorsqu\'ils s\'abonnent, vous gagnez des points échangeables contre des plans gratuits.'
                }
              },
              {
                id: 'faq-8',
                title: {
                  en: 'Do I need to download any mobile app from the App Store?',
                  rw: 'Ese ngomba gukurura porogaramu muri App Store?',
                  fr: 'Dois-je télécharger une application mobile ?'
                },
                description: {
                  en: 'No! TSINDA is a fast web application that works instantly on any smartphone browser, tablet, or PC without taking up phone storage.',
                  rw: 'Oya! TSINDA ni urubuga rwihuta cyane rukorera kuri browser ya telefone cyangwa mudasobwa nta yindi porogaramu usabwa gushyiramo.',
                  fr: 'Non ! TSINDA fonctionne instantanément sur n\'importe quel navigateur mobile ou PC sans téléchargement.'
                }
              },
              {
                id: 'faq-9',
                title: {
                  en: 'Can I retake mock exams as many times as I want?',
                  rw: 'Ese nshobora gusubira mu kizamini cy\'igeragezo incuro zose nshaka?',
                  fr: 'Puis-je refaire les examens blancs autant de fois que je veux ?'
                },
                description: {
                  en: 'Yes! With an active subscription or exam pass, you can take unlimited practice exams with randomized questions to ensure you are fully prepared.',
                  rw: 'Yego rwose! Ufite ifatabuguzi rikora cyangwa se amapaka y\'ibizamini, ushobora gukora ibizamini bitagira umubare wagenwe.',
                  fr: 'Oui ! Avec un abonnement actif, vous pouvez passer des examens blancs illimités avec des questions aléatoires.'
                }
              },
              {
                id: 'faq-10',
                title: {
                  en: 'What language options are available during the tests?',
                  rw: 'Ni izihe ndimi ziboneka mu gihe cy\'ibizamini?',
                  fr: 'Quelles langues sont disponibles pendant les tests ?'
                },
                description: {
                  en: 'TSINDA offers questions and lessons fully translated in English, Kinyarwanda, and French matching the official Rwanda Police exam options.',
                  rw: 'TSINDA itanga ibibazo n\'amasomo byose byahinduwe mu Cyongereza, mu Kinyarwanda no mu Faransa nk\'uko biri mu Polisi.',
                  fr: 'TSINDA propose des questions et des leçons entièrement traduites en anglais, kinyarwanda et français.'
                }
              },
              {
                id: 'faq-11',
                title: {
                  en: 'How do I get fully prepared for the official Police provisional exam?',
                  rw: 'Nitegura nte neza ikizamini cya Polisi cya burundu cyangwa se icya provisional?',
                  fr: 'Comment me préparer pleinement à l\'examen provisoire officiel de la Police ?'
                },
                description: {
                  en: 'By studying our 162 official Gazette traffic articles and scoring consistently above 85% on our timed mock exams, you will be 100% prepared to pass on your first try.',
                  rw: 'Mu gusoma ingingo z\'amategeko y\'umuhanda 162 no gutsinda hejuru ya 85% mu bizamini byacu by\'igeragezo, uzatsinda ku nshuro ya mbere.',
                  fr: 'En étudiant nos 162 articles officiels du code de la route et en réussissant nos examens blancs.'
                }
              }
            ];

            return (
              <section key={section.id} id="faq" className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-10">
                <div className="text-center space-y-3 max-w-2xl mx-auto">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold tracking-wide border border-blue-100 shadow-2xs">
                    <span>💡 Got Questions? We Have Answers</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                    {section.title?.[language] || section.title?.en || (language === 'rw' ? 'Ibibazo Bikunze Kubazwa' : language === 'fr' ? 'Questions Fréquentes' : 'Frequently Asked Questions')}
                  </h2>
                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                    {section.subtitle?.[language] || section.subtitle?.en || (language === 'rw' ? 'Ibisubizo ku bibazo byose waba wibaza kuri TSINDA' : language === 'fr' ? 'Tout ce que vous devez savoir sur notre plateforme' : 'Everything you need to know about preparing for your driving test')}
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  {faqList.map((faq, index) => {
                    const isOpen = openFaqIds.includes(faq.id);
                    return (
                      <div
                        key={faq.id}
                        className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden shadow-2xs ${
                          isOpen ? 'border-blue-400 ring-2 ring-blue-50 shadow-md' : 'border-slate-200/90 hover:border-slate-300'
                        }`}
                      >
                        <button
                          onClick={() => toggleFaq(faq.id)}
                          className="w-full px-6 py-5 flex items-center justify-between text-left font-bold text-slate-900 text-sm sm:text-base hover:bg-slate-50/80 transition-colors"
                        >
                          <div className="flex items-center gap-3 pr-4">
                            <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-mono text-xs font-bold shrink-0">
                              0{index + 1}
                            </span>
                            <span>{faq.title[language] || faq.title.en}</span>
                          </div>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${isOpen ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-300 ${
                                isOpen ? 'rotate-180' : ''
                              }`}
                            />
                          </div>
                        </button>
                        {isOpen && (
                          <div className="px-6 pb-6 pt-2 text-sm sm:text-base text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/40">
                            {faq.description[language] || faq.description.en}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          }

          if (section.type === 'cta') {
            return (
              <section key={section.id} className="pb-16 sm:pb-20 max-w-3xl mx-auto px-4">
                <div className="bg-[#0B132B] text-white rounded-3xl p-8 sm:p-10 text-center shadow-xl border border-slate-800">
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {section.title?.[language] || section.title?.en || (language === 'rw' ? 'Tangira Kwiga Ubu' : language === 'fr' ? 'Commencez à apprendre dès aujourd\'hui' : 'Start Learning Today')}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-md mx-auto">
                    {section.subtitle?.[language] || section.subtitle?.en || (language === 'rw' ? 'Injira muri TSINDA witegure neza' : language === 'fr' ? 'Rejoignez des milliers de conducteurs au Rwanda' : 'Join thousands of successful drivers in Rwanda')}
                  </p>
                  <div className="mt-5">
                    <a
                      href="/student?mode=signup"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md transition-all hover:scale-105"
                    >
                      <span>{t[language].getStarted || 'Start Learning Now'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </section>
            );
          }

          return null;
        })}

        {/* Fallback floating CTA if not present in sections */}
        {!sections.some(s => s.type === 'cta') && (
          <section className="pb-16 sm:pb-20 max-w-3xl mx-auto px-4">
            <div className="bg-[#0B132B] text-white rounded-3xl p-8 sm:p-10 text-center shadow-xl border border-slate-800">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {language === 'rw' ? 'Tangira Kwiga Ubu' : language === 'fr' ? 'Commencez à apprendre dès aujourd\'hui' : 'Start Learning Today'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-md mx-auto">
                {language === 'rw' ? 'Injira muri TSINDA witegure neza' : language === 'fr' ? 'Rejoignez des milliers de conducteurs au Rwanda' : 'Join thousands of successful drivers in Rwanda'}
              </p>
              <div className="mt-5">
                <a
                  href="/student?mode=signup"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md transition-all hover:scale-105"
                >
                  <span>{t[language].getStarted || 'Start Learning Now'}</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-[#0B132B] text-slate-400 py-12 sm:py-16 px-4 sm:px-6 lg:px-8 border-t border-slate-800">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 text-white font-extrabold text-lg">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-base shadow-xs">
                T
              </div>
              <span className="tracking-tight">{appName}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">{tagline}</p>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-white mb-3">{getText(homepageT.contact, language)}</h4>
            <ul className="space-y-2 text-xs">
              <li>{getText(homepageT.phone, language)}: {siteSettings?.contact?.phone || '+250788700484'}</li>
              <li>{getText(homepageT.email, language)}: {siteSettings?.contact?.email || 'info@tsinda.app'}</li>
              <li>{getText(homepageT.address, language)}: {siteSettings?.contact?.address || 'Kigali, Rwanda'}</li>
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-white mb-3">{getText(homepageT.quickLinks, language)}</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="/student" className="hover:text-white transition-colors">{t[language].signIn || 'Student Sign In'}</a></li>
              <li><a href="/student?mode=signup" className="hover:text-white transition-colors">{getText(homepageT.studentRegistration, language)}</a></li>
              <li><a href="/admin/login" className="hover:text-white transition-colors">{getText(homepageT.adminLogin, language)}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-white mb-3">{getText(homepageT.socialMedia, language)}</h4>
            <div className="flex flex-wrap gap-2">
              <a
                href={siteSettings?.contact?.whatsapp ? `https://wa.me/${siteSettings.contact.whatsapp.replace(/[^0-9]/g, '')}` : 'https://wa.me/250788700484'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition-colors shadow-2xs"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>WhatsApp</span>
              </a>
              <a
                href={socialLinks.find(s => s.platform?.toLowerCase().includes('twit') || s.platform?.toLowerCase().includes('x'))?.url || 'https://twitter.com'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition-colors shadow-2xs"
              >
                <Twitter className="w-3.5 h-3.5 text-sky-400" />
                <span>Twitter / X</span>
              </a>
              <a
                href={socialLinks.find(s => s.platform?.toLowerCase().includes('tube'))?.url || 'https://youtube.com'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition-colors shadow-2xs"
              >
                <Youtube className="w-3.5 h-3.5 text-rose-500" />
                <span>YouTube</span>
              </a>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-slate-800/80 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} {appName}. {getText(homepageT.rightsReserved, language)}
        </div>
      </footer>


    </div>
  );
};
