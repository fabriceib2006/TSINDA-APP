import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n/translations';
import { Navbar } from './Navbar';
import { AdminDashboard } from './admin/AdminDashboard';
import { UsersManager } from './admin/UsersManager';
import { PlansManager } from './admin/PlansManager';
import { PaymentsManager } from './admin/PaymentsManager';
import { ContentManager } from './admin/ContentManager';
import { ExamsManager } from './admin/ExamsManager';
import { SystemSettingsManager } from './admin/SystemSettingsManager';
import { UserProfileView } from './UserProfileView';
import { 
  LayoutDashboard, 
  Users, 
  Tag, 
  CreditCard, 
  BookOpen, 
  Settings, 
  Globe,
  X, 
  ShieldCheck 
} from 'lucide-react';

type AdminTab = 'dashboard' | 'users' | 'plans' | 'payments' | 'content' | 'exams' | 'systemSettings' | 'profile';

export const AdminLayout: React.FC = () => {
  const { language } = useAuth();
  const dict = t[language];
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { id: 'dashboard' as AdminTab, label: dict.dashboard, icon: LayoutDashboard },
    { id: 'users' as AdminTab, label: dict.users, icon: Users },
    { id: 'plans' as AdminTab, label: dict.plans, icon: Tag },
    { id: 'payments' as AdminTab, label: dict.payments, icon: CreditCard },
    { id: 'content' as AdminTab, label: dict.content, icon: BookOpen },
    { id: 'exams' as AdminTab, label: dict.exams, icon: Settings },
    { id: 'systemSettings' as AdminTab, label: 'System Settings', icon: Globe },
  ];

  const handleSelectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col overflow-x-hidden">
      <Navbar 
        onOpenProfile={() => setActiveTab('profile')} 
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        isSidebarOpen={sidebarOpen}
      />

      <div className="flex-1 flex w-full relative">
        {/* Dark overlay for mobile/tablet drawer (< 1024px) */}
        {sidebarOpen && (
          <div 
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden transition-opacity duration-200"
            aria-hidden="true"
          />
        )}

        {/* Sidebar: Fixed 240px sticky on desktop (>=1024px), Slide-in drawer below 1024px */}
        <aside
          className={`fixed lg:sticky lg:top-16 inset-y-0 left-0 z-50 w-[240px] shrink-0 bg-white border-r border-slate-200 flex flex-col lg:h-[calc(100vh-4rem)] lg:self-start transform transition-transform duration-200 ease-in-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Drawer Header on Mobile/Tablet */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
              <ShieldCheck className="w-5 h-5" />
              <span>{dict.adminPanel}</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-[10px] text-slate-500 hover:bg-slate-100 transition-colors"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Desktop Navigation Section Header */}
          <div className="px-5 pt-5 pb-2 hidden lg:block">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Admin Menu
            </span>
          </div>

          {/* Nav Items */}
          <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content Area - Single vertical scrollbar on page */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-7xl mx-auto space-y-6">
            {activeTab === 'dashboard' && <AdminDashboard />}
            {activeTab === 'users' && <UsersManager />}
            {activeTab === 'plans' && <PlansManager />}
            {activeTab === 'payments' && <PaymentsManager />}
            {activeTab === 'content' && <ContentManager />}
            {activeTab === 'exams' && <ExamsManager />}
            {activeTab === 'systemSettings' && <SystemSettingsManager />}
            {activeTab === 'profile' && <UserProfileView onBack={() => setActiveTab('dashboard')} />}
          </div>
        </main>
      </div>
    </div>
  );
};
