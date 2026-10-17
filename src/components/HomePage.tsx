import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { Language } from '../types';
import { t } from '../i18n/translations';
import { 
  BookOpen, 
  Award, 
  Play, 
  UserPlus, 
  CreditCard, 
  CheckCircle2, 
  TrendingUp, 
  Users, 
  ShieldCheck, 
  Globe, 
  ArrowRight, 
  Lock, 
  Mail, 
  Phone, 
  X, 
  Menu,
  ChevronDown,
  AlertCircle
} from 'lucide-react';
import { AuthScreen } from './AuthScreen';
import { useAuth } from '../context/AuthContext';
import { getBestPromotion } from '../lib/promotionUtils';
import { formatCountdown } from '../lib/timeUtils';

export const HomePage: React.FC = () => {
  const { userProfile } = useAuth();
  const [language, setLanguage] = useState<Language>('en');
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
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ questions: 0, lessons: 0, videos: 0 });

  // Modal / Auth overlay
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'admin'>('signin');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>([]);

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

        // Fetch trust stats, sections, items, announcements, footer, social, plans, promotions
        const [qSnap, lSnap, vSnap, secSnap, itemSnap, annSnap, fgSnap, flSnap, socSnap, planSnap, promoSnap] = await Promise.all([
            getDocs(collection(db, 'questions')),
            getDocs(collection(db, 'lessons')),
            getDocs(collection(db, 'videos')),
            getDocs(collection(db, 'homepageSections')),
            getDocs(collection(db, 'homepageItems')),
            getDocs(collection(db, 'announcements')),
            getDocs(collection(db, 'footerGroups')),
            getDocs(collection(db, 'footerLinks')),
            getDocs(collection(db, 'socialLinks')),
            getDocs(collection(db, 'plans')),
            getDocs(collection(db, 'promotions')),
        ]);

        setStats({
            questions: qSnap.size,
            lessons: lSnap.size,
            videos: vSnap.size
        });

        if (secSnap) {
          const list = secSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          list.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
          setSections(list.filter((s: any) => s.isVisible));
        }

        if (itemSnap) setItems(itemSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((i: any) => i.isVisible));
        if (annSnap) setAnnouncements(annSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => a.isActive));
        if (fgSnap) setFooterGroups(fgSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((g: any) => g.isVisible));
        if (flSnap) setFooterLinks(flSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((l: any) => l.isVisible));
        if (socSnap) setSocialLinks(socSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((s: any) => s.isVisible));
        if (planSnap) setPlans(planSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((p: any) => p.isActive));
        if (promoSnap) setPromotions(promoSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((p: any) => p.isActive));

        if (secSnap) {
          const list = secSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          list.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
          setSections(list.filter((s: any) => s.isVisible));
        }

        const itemSnap2 = await getDocs(collection(db, 'homepageItems')).catch(() => null);
        if (itemSnap2) {
          setItems(itemSnap2.docs.map(d => ({ id: d.id, ...d.data() })).filter((i: any) => i.isVisible));
        }

        const annSnap2 = await getDocs(collection(db, 'announcements')).catch(() => null);
        if (annSnap2) {
          setAnnouncements(annSnap2.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => a.isActive));
        }

        const fgSnap2 = await getDocs(collection(db, 'footerGroups')).catch(() => null);
        if (fgSnap2) setFooterGroups(fgSnap2.docs.map(d => ({ id: d.id, ...d.data() })).filter((g: any) => g.isVisible));

        const flSnap2 = await getDocs(collection(db, 'footerLinks')).catch(() => null);
        if (flSnap2) setFooterLinks(flSnap2.docs.map(d => ({ id: d.id, ...d.data() })).filter((l: any) => l.isVisible));

        const socSnap2 = await getDocs(collection(db, 'socialLinks')).catch(() => null);
        if (socSnap2) setSocialLinks(socSnap2.docs.map(d => ({ id: d.id, ...d.data() })).filter((s: any) => s.isVisible));

      } catch (err) {
        console.error('Error loading homepage data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchHomeData();
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
            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-extrabold text-lg shadow-sm">
              {appName[0]}
            </div>
            <span className="text-lg font-black tracking-tight text-slate-900">{appName}</span>
          </div>

          <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#howItWorks" className="hover:text-blue-600 transition-colors">How It Works</a>
            <a href="#plans" className="hover:text-blue-600 transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-blue-600 transition-colors">FAQ</a>
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
                Go to Dashboard ({userProfile.role === 'admin' ? 'Admin' : 'Student'})
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setAuthMode('signin');
                    setAuthModalOpen(true);
                  }}
                  className="hidden sm:flex min-h-[38px] px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors items-center gap-1.5"
                >
                  Sign In
                </button>

                <button
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthModalOpen(true);
                  }}
                  className="min-h-[38px] px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                >
                  Get Started
                </button>
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
              <section key={section.id} className="relative py-20 lg:py-28 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-50/50 to-white overflow-hidden">
                <div className="max-w-5xl mx-auto text-center space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-200 shadow-xs">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <span>Rwanda National Gazette Certified</span>
                  </div>
                  <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
                    {section.title?.[language] || section.title?.en || tagline}
                  </h1>
                  <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                    {section.subtitle?.[language] || section.subtitle?.en}
                  </p>
                  <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      onClick={() => {
                        setAuthMode('signup');
                        setAuthModalOpen(true);
                      }}
                      className="w-full sm:w-auto min-h-[48px] px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition-all"
                    >
                      <span>Start Learning Now</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setAuthMode('signin');
                        setAuthModalOpen(true);
                      }}
                      className="w-full sm:w-auto min-h-[48px] px-8 py-3.5 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-sm border border-slate-200 transition-all"
                    >
                      Student Sign In
                    </button>
                  </div>
                </div>
              </section>
            );
          }

          if (section.type === 'features') {
            const secItems = getSectionItems('features');
            return (
              <section key={section.id} id="features" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900">{section.title?.[language] || section.title?.en}</h2>
                  <p className="text-sm text-slate-600 max-w-lg mx-auto">{section.subtitle?.[language] || section.subtitle?.en}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {secItems.map((item, idx) => (
                    <div key={item.id || idx} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4 hover:shadow-md transition-shadow">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">{item.title?.[language] || item.title?.en}</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{item.description?.[language] || item.description?.en}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          }

          if (section.type === 'howItWorks') {
            const secItems = getSectionItems('howItWorks');
            return (
              <section key={section.id} id="howItWorks" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto bg-slate-100/70 rounded-3xl my-10 space-y-12">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900">{section.title?.[language] || section.title?.en}</h2>
                  <p className="text-sm text-slate-600 max-w-lg mx-auto">{section.subtitle?.[language] || section.subtitle?.en}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {secItems.map((item, idx) => (
                    <div key={item.id || idx} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                      <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-sm">
                        {idx + 1}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">{item.title?.[language] || item.title?.en}</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{item.description?.[language] || item.description?.en}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          }

          if (section.type === 'stats') {
            const secItems = getSectionItems('stats');
            return (
              <section key={section.id} className="py-16 bg-blue-600 text-white my-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                  <div className="space-y-2">
                    <div className="text-4xl sm:text-5xl font-black">{stats.questions}</div>
                    <div className="text-sm font-medium text-blue-100">Exam Questions</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-4xl sm:text-5xl font-black">{stats.lessons}</div>
                    <div className="text-sm font-medium text-blue-100">Gazette Lessons</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-4xl sm:text-5xl font-black">{stats.videos}</div>
                    <div className="text-sm font-medium text-blue-100">Video Lessons</div>
                  </div>
                </div>
              </section>
            );
          }
          
          if (section.type === 'plans') {
              const sortedPlans = [...plans].sort((a,b) => a.sortOrder - b.sortOrder);
              return (
                <section key={section.id} id="plans" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900">{section.title?.[language] || section.title?.en}</h2>
                    <p className="text-sm text-slate-600">{section.subtitle?.[language] || section.subtitle?.en}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {sortedPlans.map(plan => {
                        const promoInfo = getBestPromotion(plan.id, plan.price, promotions);
                        return (
                            <div key={plan.id} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                                <h3 className="text-lg font-bold text-slate-900">{plan.name[language] || plan.name.en}</h3>
                                <div className="text-2xl font-black">{promoInfo.discountedPrice} RWF</div>
                                {promoInfo.hasPromotion && promoInfo.activePromo && <div className="text-xs text-rose-500 font-bold">{promoInfo.discountBadge} {formatCountdown(promoInfo.activePromo.endAt)}</div>}
                                <button onClick={() => window.location.href = userProfile ? '/student' : `/signup?plan=${plan.id}`} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold">Choose Plan</button>
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
                  <button
                    onClick={() => {
                      setAuthMode('signup');
                      setAuthModalOpen(true);
                    }}
                    className="min-h-[48px] px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-sm transition-all inline-flex items-center gap-2"
                  >
                    <span>Create Free Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </section>
            );
          }

          return null;



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
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Contact</h4>
            <ul className="space-y-2 text-xs">
              <li>Phone: {siteSettings?.contact?.phone || '+250 780 000 000'}</li>
              <li>Email: {siteSettings?.contact?.email || 'info@tsinda.app'}</li>
              <li>Address: {siteSettings?.contact?.address || 'Kigali, Rwanda'}</li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Quick Links</h4>
            <ul className="space-y-2 text-xs">
              <li><button onClick={() => { setAuthMode('signin'); setAuthModalOpen(true); }} className="hover:text-white">Student Sign In</button></li>
              <li><button onClick={() => { setAuthMode('signup'); setAuthModalOpen(true); }} className="hover:text-white">Student Registration</button></li>
              <li><a href="/admin/login" className="hover:text-white">Admin Login</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Social Media</h4>
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
          &copy; {new Date().getFullYear()} {appName}. All rights reserved. Rwanda National Gazette compliant.
        </div>
      </footer>

      {/* AUTH MODAL OVERLAY */}
      {authModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 relative shadow-2xl my-8">
            <button
              onClick={() => setAuthModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Embedded AuthScreen or modal content */}
            <AuthScreen />
          </div>
        </div>
      )}
    </div>
  );
};
