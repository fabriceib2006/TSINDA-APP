import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../i18n/translations';
import { Globe, LogOut, ShieldCheck, User as UserIcon, Menu, ChevronDown, Check, Home } from 'lucide-react';
import { Language } from '../types';

interface NavbarProps {
  onOpenProfile?: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  onOpenProfile, 
  onToggleSidebar,
  isSidebarOpen 
}) => {
  const { userProfile, signOut } = useAuth();
  const { language, setLanguage } = useLanguage();
  const dict = t[language];
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute user initials
  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const languages: { code: Language; label: string; full: string }[] = [
    { code: 'en', label: 'EN', full: 'English' },
    { code: 'rw', label: 'RW', full: 'Kinyarwanda' },
    { code: 'fr', label: 'FR', full: 'Français' },
  ];

  const currentLangLabel = languages.find(l => l.code === language)?.label || 'EN';

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs transition-all">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-6">
        
        {/* Left: Hamburger (Tablet/Mobile for admin/drawer) + Logo & App Name */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
              aria-expanded={isSidebarOpen}
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <a 
            href="/" 
            className="flex items-center gap-2.5 min-h-[44px] py-1 focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xl group transition-transform active:scale-98"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 text-white font-black rounded-xl flex items-center justify-center shadow-xs shrink-0 text-base sm:text-lg tracking-wider group-hover:shadow-md transition-shadow">
              T
            </div>
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 leading-tight">
                  {dict.appName}
                </span>
                {userProfile?.role === 'admin' && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/70 tracking-wide uppercase">
                    <ShieldCheck className="w-3 h-3 text-blue-600" />
                    <span>Admin</span>
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 hidden sm:block leading-none mt-0.5 font-medium whitespace-nowrap">
                {dict.subtitle}
              </span>
            </div>
          </a>
        </div>

        {/* Right Section: Home Link + Language Switcher + User Profile Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
          <a
            href="/"
            className="min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200/80 border border-slate-200/70 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
            title="Return to Homepage"
          >
            <Home className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">{language === 'rw' ? 'Ahabanza' : language === 'fr' ? 'Accueil' : 'Home'}</span>
          </a>
          
          {/* Desktop Segmented Language Switcher (>= 1024px) */}
          <div className="hidden lg:flex items-center bg-slate-100/90 border border-slate-200/70 p-0.5 rounded-xl shadow-2xs">
            <div className="pl-2 pr-1.5 text-slate-400 flex items-center">
              <Globe className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-0.5">
              {languages.map((l) => {
                const isActive = language === l.code;
                return (
                  <button
                    key={l.code}
                    onClick={() => setLanguage(l.code)}
                    className={`min-h-[34px] px-3 py-1 rounded-[8px] text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-white text-blue-700 shadow-xs scale-100'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tablet & Mobile Language Dropdown (< 1024px) */}
          <div className="relative lg:hidden" ref={langRef}>
            <button
              onClick={() => setLangDropdownOpen(!langDropdownOpen)}
              className="min-h-[44px] px-3 py-2 bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/70 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
              aria-label="Select language"
              aria-haspopup="true"
              aria-expanded={langDropdownOpen}
            >
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span>{currentLangLabel}</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${langDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {langDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2.5 py-1">
                  Select Language
                </div>
                {languages.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => {
                      setLanguage(l.code);
                      setLangDropdownOpen(false);
                    }}
                    className={`w-full min-h-[40px] px-2.5 py-1.5 text-left text-xs rounded-lg flex items-center justify-between transition-colors ${
                      language === l.code
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{l.full}</span>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">{l.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User Account Menu with Polished Unified Trigger & Dropdown */}
          {userProfile && (
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className={`min-h-[44px] flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-xl border transition-all ${
                  profileDropdownOpen
                    ? 'bg-blue-50/60 border-blue-200 shadow-2xs'
                    : 'bg-white border-slate-200/80 hover:bg-slate-50/90 hover:border-slate-300 shadow-2xs'
                }`}
                aria-label="User account menu"
                aria-haspopup="true"
                aria-expanded={profileDropdownOpen}
              >
                {/* Initials Avatar */}
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0 tracking-wider">
                  {getInitials(userProfile.name)}
                </div>

                {/* Name & Role (Visible on Tablet/Laptop/Desktop) */}
                <div className="hidden sm:flex flex-col text-left leading-tight pr-1">
                  <span className="text-xs font-bold text-slate-900 truncate max-w-[150px] lg:max-w-[190px]" title={userProfile.name}>
                    {userProfile.name}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 capitalize flex items-center gap-1">
                    {userProfile.role === 'admin' ? (
                      <span className="text-blue-600 font-bold">Admin</span>
                    ) : (
                      <span>{language === 'rw' ? 'Umunyeshuri' : language === 'fr' ? 'Étudiant' : 'Student'}</span>
                    )}
                  </span>
                </div>

                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${profileDropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
              </button>

              {/* Elevated Dropdown Menu */}
              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  {/* Account Summary */}
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-xs shrink-0">
                      {getInitials(userProfile.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 truncate" title={userProfile.name}>
                        {userProfile.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate" title={userProfile.email}>
                        {userProfile.email}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          userProfile.role === 'admin'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                        }`}>
                          <ShieldCheck className="w-3 h-3" />
                          <span className="capitalize">{userProfile.role === 'admin' ? 'Admin' : (language === 'rw' ? 'Umunyeshuri' : language === 'fr' ? 'Étudiant' : 'Student')}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-1.5 space-y-0.5">
                    {onOpenProfile && (
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          onOpenProfile();
                        }}
                        className="w-full min-h-[44px] px-3.5 py-2.5 text-left text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 rounded-xl flex items-center gap-2.5 transition-colors"
                      >
                        <UserIcon className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                        <span>
                          {{
                            en: "My Profile & Account",
                            rw: "Porayili Yanjye na Konti",
                            fr: "Mon Profil & Compte"
                          }[language] || "My Profile & Account"}
                        </span>
                      </button>
                    )}

                    <div className="pt-1 mt-1 border-t border-slate-100">
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          signOut();
                        }}
                        className="w-full min-h-[44px] px-3.5 py-2.5 text-left text-xs sm:text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2.5 transition-colors"
                      >
                        <LogOut className="w-4 h-4 text-red-500" />
                        <span>{dict.logout}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
