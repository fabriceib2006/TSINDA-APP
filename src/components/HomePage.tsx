import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Language } from '../types';
import { t, homepageT } from '../i18n/translations';
import { 
  BookOpen, Award, Play, UserPlus, CreditCard, CheckCircle2, TrendingUp, Users, ShieldCheck, Globe, Star,
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
  const [stats, setStats] = useState({ questions: 0, lessons: 0, videos: 0 });

  // Auth overlay
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>([]);

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
        setStats({
            questions: statsData?.questionsCount ?? 500,
            lessons: statsData?.lessonsCount ?? (lSnap ? lSnap.size : 24),
            videos: statsData?.videosCount ?? (vSnap ? vSnap.size : 12)
        });

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

          <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">{getText(homepageT.features, language)}</a>
            <a href="#howItWorks" className="hover:text-blue-600 transition-colors">{getText(homepageT.howItWorks, language)}</a>
            <a href="#plans" className="hover:text-blue-600 transition-colors">{getText(homepageT.pricing, language)}</a>
            <a href="#faq" className="hover:text-blue-600 transition-colors">{getText(homepageT.faq, language)}</a>
          </div>

          <div className="flex items-center gap-3">
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
                {t[language].dashboard || 'Dashboard'} ({userProfile.role === 'admin' ? (t[language].roleAdmin || 'Admin') : (t[language].roleLearner || 'Student')})
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
                        <div className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-700 shadow-2xs flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                          <span>{stats.questions} {t[language].questionsLabel || 'Published Questions'}</span>
                        </div>
                        <div className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-700 shadow-2xs flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                          <span>{stats.lessons} {t[language].lessonsLabel || 'Gazette Lessons'}</span>
                        </div>
                        <div className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-700 shadow-2xs flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                          <span>{stats.videos} {t[language].videosLabel || 'Video Explanations'}</span>
                        </div>
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
            const secItems = getSectionItems('features');
            const featureIconMap: Record<string, React.ElementType> = {
              BookOpen, Award, Play, UserPlus, CreditCard, CheckCircle2, TrendingUp, Users, ShieldCheck, Globe, Star
            };
            return (
              <section key={section.id} id="features" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900">{section.title?.[language] || section.title?.en}</h2>
                  <p className="text-sm text-slate-600 max-w-lg mx-auto">{section.subtitle?.[language] || section.subtitle?.en}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {secItems.map((item, idx) => {
                    const IconComponent = featureIconMap[item.iconName] || Star;
                    const slotKey = idx === 0 ? 'feature-lessons' : idx === 1 ? 'feature-exams' : idx === 2 ? 'feature-videos' : null;
                    const cardImg = (slotKey && imageSlots[slotKey]) || item.imageUrl;
                    return (
                      <div key={item.id || idx} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4 hover:-translate-y-1 transition-all duration-300 hover:shadow-md">
                        {cardImg ? (
                          <img src={cardImg} alt="" className="w-12 h-12 rounded-2xl object-cover border border-slate-200" />
                        ) : (
                          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <IconComponent className="w-6 h-6" />
                          </div>
                        )}
                        <h3 className="text-lg font-bold text-slate-900">{item.title?.[language] || item.title?.en}</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">{item.description?.[language] || item.description?.en}</p>
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

          if (section.type === 'stats') {
            const secItems = getSectionItems('stats');
            return (
              <section key={section.id} className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto my-12">
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-3xl p-8 sm:p-12 shadow-xl relative overflow-hidden grid grid-cols-1 md:grid-cols-3 gap-8 items-center text-center md:text-left">
                  { [
                    { value: stats.questions, label: t[language].questionsLabel || 'Published Questions', icon: Award },
                    { value: stats.lessons, label: t[language].lessonsLabel || 'Gazette Lessons', icon: BookOpen },
                    { value: stats.videos, label: t[language].videosLabel || 'Video Lessons', icon: Play },
                  ].filter(stat => stat.value > 0).length === 0 ? null : (
                    [
                      { value: stats.questions, label: t[language].questionsLabel || 'Published Questions', icon: Award },
                      { value: stats.lessons, label: t[language].lessonsLabel || 'Gazette Lessons', icon: BookOpen },
                      { value: stats.videos, label: t[language].videosLabel || 'Video Lessons', icon: Play },
                    ].filter(stat => stat.value > 0).map((stat, i) => (
                      <div key={i} className="flex flex-col md:flex-row items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-white/10 text-white flex items-center justify-center shrink-0">
                          <stat.icon className="w-7 h-7" />
                        </div>
                        <div>
                          <div className="text-4xl sm:text-5xl font-black">{stat.value}</div>
                          <div className="text-sm font-medium text-blue-100 mt-1">{stat.label}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            );
          }
          
          if (section.type === 'plans') {
              const sortedPlans = [...plans].sort((a,b) => a.sortOrder - b.sortOrder);
              return (
                <section key={section.id} id="plans" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900">{section.title?.[language] || section.title?.en}</h2>
                    <p className="text-sm text-slate-600">{section.subtitle?.[language] || section.subtitle?.en}</p>
                  </div>

                  {activeSub && (
                    <div className="max-w-2xl mx-auto p-4 bg-emerald-50 text-emerald-800 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-3 border border-emerald-200 text-center shadow-xs">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span>
                        {language === 'rw'
                          ? `Ufite ifatabuguzi rikora kugeza ${formatCatDate(activeSub.endDate)}`
                          : language === 'fr'
                          ? `Vous avez un abonnement actif jusqu'au ${formatCatDate(activeSub.endDate)}`
                          : `You have an active plan until ${formatCatDate(activeSub.endDate)}`}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                    {sortedPlans.map(plan => {
                        const promoInfo = getBestPromotion(plan.id, plan.price, promotions);
                        const isRecommended = plan.isRecommended;
                        return (
                            <div key={plan.id} className={`bg-white p-8 rounded-2xl border ${isRecommended ? 'border-2 border-blue-600 shadow-lg' : 'border-slate-200 shadow-xs'} relative flex flex-col justify-between transition-all`}>
                                {isRecommended && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider shadow-sm">
                                        {getText(homepageT.recommended, language)}
                                    </div>
                                )}
                                {promoInfo.hasPromotion && (
                                    <div className="absolute -top-3 right-4 bg-rose-600 text-white text-[11px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1">
                                        <span>🔥 {promoInfo.discountBadge} OFF</span>
                                    </div>
                                )}
                                <div className="space-y-4">
                                    <h3 className="text-xl font-black text-slate-900">{plan.name[language] || plan.name.en}</h3>
                                    {plan.description && getText(plan.description, language) && (
                                        <p className="text-sm text-slate-600">{getText(plan.description, language)}</p>
                                    )}
                                    
                                    <div className="space-y-1">
                                        {promoInfo.hasPromotion ? (
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-2xl font-black text-blue-600">RWF {promoInfo.discountedPrice.toLocaleString()}</span>
                                                <span className="text-sm text-slate-400 line-through">RWF {plan.price.toLocaleString()}</span>
                                            </div>
                                        ) : (
                                            <div className="text-2xl font-black text-slate-900">RWF {plan.price.toLocaleString()}</div>
                                        )}
                                        <div className="text-xs font-medium text-slate-500">
                                            {plan.durationDays === 1 ? getText(homepageT.daysSingular, language).replace('{n}', '1') : getText(homepageT.daysPlural, language).replace('{n}', plan.durationDays?.toString() || '30')}
                                        </div>
                                        {promoInfo.hasPromotion && promoInfo.activePromo && (
                                            <div className="pt-1">
                                                <span className="inline-block bg-rose-50 text-rose-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-rose-200">
                                                    Special Promo Active ({promoInfo.discountBadge})
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-3 pt-4 border-t border-slate-100 text-sm text-slate-700">
                                        <div className="flex items-center gap-3">
                                            {plan.access?.lessonVideos ? (
                                                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">✓</span>
                                            ) : (
                                                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-xs">✕</span>
                                            )}
                                            <span className={plan.access?.lessonVideos ? 'font-medium text-slate-900' : 'text-slate-400'}>{getText(homepageT.videoLessons, language)}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {plan.access?.trafficRules ? (
                                                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">✓</span>
                                            ) : (
                                                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-xs">✕</span>
                                            )}
                                            <span className={plan.access?.trafficRules ? 'font-medium text-slate-900' : 'text-slate-400'}>{getText(homepageT.trafficRules, language)}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {plan.access?.exams ? (
                                                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">✓</span>
                                            ) : (
                                                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-xs">✕</span>
                                            )}
                                            <span className={plan.access?.exams ? 'font-medium text-slate-900' : 'text-slate-400'}>
                                                {plan.access?.exams ? (plan.examLimit ? (plan.examLimit === 1 ? getText(homepageT.examCountSingular, language).replace('{n}', '1') : getText(homepageT.examCountPlural, language).replace('{n}', plan.examLimit.toString())) : getText(homepageT.unlimitedExams, language)) : getText(homepageT.exams, language)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                  disabled={!!activeSub}
                                  onClick={() => {
                                    if (activeSub) return;
                                    window.location.href = userProfile ? '/student' : `/signup?plan=${plan.id}`;
                                  }}
                                  className={`w-full py-3 mt-6 rounded-xl font-bold shadow-sm transition-colors ${
                                    activeSub
                                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                                  }`}
                                >
                                  {activeSub
                                    ? (language === 'rw' ? 'Ufite ifatabuguzi rikora' : language === 'fr' ? 'Abonnement actif en cours' : 'Active Plan in Progress')
                                    : getText(homepageT.choosePlan, language)}
                                </button>
                            </div>
                        )
                    })}
                  </div>
                </section>
              )
          }

          if (section.type === 'testimonials') {
            const secItems = getSectionItems('testimonials');
            return (
              <section key={section.id} className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900">{section.title?.[language] || section.title?.en}</h2>
                  <p className="text-sm text-slate-600 max-w-lg mx-auto">{section.subtitle?.[language] || section.subtitle?.en}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {secItems.map((tItem, idx) => (
                    <div key={tItem.id || idx} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                      <p className="text-sm text-slate-700 italic leading-relaxed">"{tItem.description?.[language] || tItem.description?.en}"</p>
                      <div className="font-bold text-slate-900 text-sm">- {tItem.title?.[language] || tItem.title?.en}</div>
                    </div>
                  ))}
                </div>
              </section>
            );
          }

          if (section.type === 'faq') {
            const secItems = getSectionItems('faq');
            return (
              <section key={section.id} id="faq" className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-10">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900">{section.title?.[language] || section.title?.en}</h2>
                  <p className="text-sm text-slate-600">{section.subtitle?.[language] || section.subtitle?.en}</p>
                </div>

                <div className="space-y-4">
                  {secItems.map((faq, idx) => (
                    <div key={faq.id || idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base">{faq.title?.[language] || faq.title?.en}</h3>
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{faq.description?.[language] || faq.description?.en}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          }

          if (section.type === 'cta') {
            return (
              <section key={section.id} className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
                <div className="bg-slate-900 text-white rounded-3xl p-10 sm:p-16 space-y-6 shadow-xl">
                  <h2 className="text-2xl sm:text-4xl font-black">{section.title?.[language] || section.title?.en}</h2>
                  <p className="text-sm text-slate-300 max-w-xl mx-auto">{section.subtitle?.[language] || section.subtitle?.en}</p>
                  <a
                    href="/student?mode=signup"
                    className="min-h-[48px] px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-sm transition-all inline-flex items-center gap-2"
                  >
                    <span>{t[language].getStarted || 'Start Learning Now'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </section>
            );
          }

          return null;
        })}
      </main>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-800">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white font-extrabold text-lg">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                {appName[0]}
              </div>
              <span>{appName}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{tagline}</p>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">{getText(homepageT.contact, language)}</h4>
            <ul className="space-y-2 text-xs">
              <li>{getText(homepageT.phone, language)}: {siteSettings?.contact?.phone || '+250 780 000 000'}</li>
              <li>{getText(homepageT.email, language)}: {siteSettings?.contact?.email || 'info@tsinda.app'}</li>
              <li>{getText(homepageT.address, language)}: {siteSettings?.contact?.address || 'Kigali, Rwanda'}</li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">{getText(homepageT.quickLinks, language)}</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="/student" className="hover:text-white">{t[language].signIn || 'Student Sign In'}</a></li>
              <li><a href="/student?mode=signup" className="hover:text-white">{getText(homepageT.studentRegistration, language)}</a></li>
              <li><a href="/admin/login" className="hover:text-white">{getText(homepageT.adminLogin, language)}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">{getText(homepageT.socialMedia, language)}</h4>
            <div className="flex gap-3">
              {socialLinks.map((s, idx) => (
                <a key={s.id || idx} href={s.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg">
                  {s.platform}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} {appName}. {getText(homepageT.rightsReserved, language)}
        </div>
      </footer>


    </div>
  );
};
