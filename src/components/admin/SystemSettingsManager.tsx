import React, { useState, useEffect } from 'react';
import { db, auth } from '../../lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { 
  Settings, 
  Layout, 
  Megaphone, 
  Menu, 
  Image as ImageIcon, 
  ExternalLink, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  ArrowUp, 
  ArrowDown, 
  Eye, 
  EyeOff, 
  Pin, 
  Check, 
  AlertCircle,
  Upload,
  Globe
} from 'lucide-react';
import { Language } from '../../types';
import { seedSystemSettingsIfNeeded } from '../../lib/seedSystemSettings';

export const SystemSettingsManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'sections' | 'announcements' | 'footer' | 'media'>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // General settings state
  const [settings, setSettings] = useState({
    appName: 'TSINDA',
    tagline: { rw: '', en: '', fr: '' },
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#2563eb',
    contact: { phone: '', whatsapp: '', email: '', address: '' },
    seo: { title: '', description: '' },
    maintenanceMode: false
  });

  // Homepage sections & items
  const [sections, setSections] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [selectedSectionForItems, setSelectedSectionForItems] = useState<string | null>(null);

  // Announcements state
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [currentAnnouncement, setCurrentAnnouncement] = useState<any | null>(null);

  // Footer state
  const [footerGroups, setFooterGroups] = useState<any[]>([]);
  const [footerLinks, setFooterLinks] = useState<any[]>([]);
  const [socialLinks, setSocialLinks] = useState<any[]>([]);

  // Media library state
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Confirmation modal state
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: string; title: string } | null>(null);

  useEffect(() => {
    fetchAllData();
  }, []);

  const logAdminAction = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, 'adminLogs'), {
        adminEmail: auth.currentUser?.email || 'admin',
        action,
        details,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error logging admin action:', err);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await seedSystemSettingsIfNeeded().catch(err => console.log('Seed note:', err));

      // 1. Site Settings
      const setSnap = await getDoc(doc(db, 'siteSettings', 'config')).catch(err => {
        handleFirestoreError(err, OperationType.GET, 'siteSettings/config');
        return null;
      });
      if (setSnap && setSnap.exists()) {
        setSettings(setSnap.data() as any);
      }

      // 2. Sections
      const secSnap = await getDocs(collection(db, 'homepageSections')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, 'homepageSections');
        return null;
      });
      if (secSnap) {
        const list = secSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        setSections(list);
        if (list.length > 0 && !selectedSectionForItems) {
          setSelectedSectionForItems(list[0].id);
        }
      }

      // 3. Items
      const itemSnap = await getDocs(collection(db, 'homepageItems')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, 'homepageItems');
        return null;
      });
      if (itemSnap) {
        setItems(itemSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      // 4. Announcements
      const annSnap = await getDocs(collection(db, 'announcements')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, 'announcements');
        return null;
      });
      if (annSnap) {
        setAnnouncements(annSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      // 5. Footer & Social
      const fgSnap = await getDocs(collection(db, 'footerGroups')).catch(err => null);
      if (fgSnap) setFooterGroups(fgSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const flSnap = await getDocs(collection(db, 'footerLinks')).catch(err => null);
      if (flSnap) setFooterLinks(flSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const socSnap = await getDocs(collection(db, 'socialLinks')).catch(err => null);
      if (socSnap) setSocialLinks(socSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // 6. Media
      const medSnap = await getDocs(collection(db, 'siteMedia')).catch(err => null);
      if (medSnap) setMediaList(medSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (err) {
      console.error('Error fetching system settings data:', err);
      setError('Failed to load system settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await setDoc(doc(db, 'siteSettings', 'config'), settings);
      await logAdminAction('UPDATE_SITE_SETTINGS', 'Updated general site settings & SEO');
      setSuccessMsg('General settings saved successfully.');
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSectionVisibility = async (sec: any) => {
    try {
      const newVis = !sec.isVisible;
      await updateDoc(doc(db, 'homepageSections', sec.id), { isVisible: newVis });
      setSections(sections.map(s => s.id === sec.id ? { ...s, isVisible: newVis } : s));
      await logAdminAction('TOGGLE_SECTION', `Toggled section ${sec.type} visibility to ${newVis}`);
    } catch (err) {
      console.error('Error toggling section:', err);
    }
  };

  const handleMoveSection = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;
    const newSections = [...sections];
    const temp = newSections[index];
    newSections[index] = newSections[targetIndex];
    newSections[targetIndex] = temp;

    // Update order numbers
    try {
      for (let i = 0; i < newSections.length; i++) {
        await updateDoc(doc(db, 'homepageSections', newSections[i].id), { order: i + 1 });
        newSections[i].order = i + 1;
      }
      setSections(newSections);
      await logAdminAction('REORDER_SECTIONS', 'Reordered homepage sections');
    } catch (err) {
      console.error('Error reordering sections:', err);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'announcements', id));
      setAnnouncements(announcements.filter(a => a.id !== id));
      setConfirmDelete(null);
      await logAdminAction('DELETE_ANNOUNCEMENT', `Deleted announcement ${id}`);
    } catch (err) {
      console.error('Error deleting announcement:', err);
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAnnouncement) return;
    try {
      if (currentAnnouncement.id) {
        const { id, ...data } = currentAnnouncement;
        await updateDoc(doc(db, 'announcements', id), data);
        setAnnouncements(announcements.map(a => a.id === id ? currentAnnouncement : a));
        await logAdminAction('UPDATE_ANNOUNCEMENT', `Updated announcement ${id}`);
      } else {
        const newDocData = { ...currentAnnouncement, createdAt: new Date().toISOString() };
        const docRef = await addDoc(collection(db, 'announcements'), newDocData);
        setAnnouncements([{ id: docRef.id, ...newDocData }, ...announcements]);
        await logAdminAction('CREATE_ANNOUNCEMENT', `Created announcement ${docRef.id}`);
      }
      setAnnouncementModalOpen(false);
      setCurrentAnnouncement(null);
      setSuccessMsg('Announcement saved successfully.');
    } catch (err: any) {
      console.error('Error saving announcement:', err);
      setError(err.message || 'Failed to save announcement.');
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingMedia(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // For preview / demo without cloud storage limits, use FileReader data URL or mock upload
        const reader = new FileReader();
        reader.onload = async (event) => {
          const url = event.target?.result as string;
          const mediaData = {
            url,
            name: file.name,
            altText: { rw: file.name, en: file.name, fr: file.name },
            createdAt: new Date().toISOString()
          };
          const ref = await addDoc(collection(db, 'siteMedia'), mediaData);
          setMediaList(prev => [{ id: ref.id, ...mediaData }, ...prev]);
        };
        reader.readAsDataURL(file);
      }
      await logAdminAction('UPLOAD_MEDIA', `Uploaded ${files.length} file(s) to media library`);
      setSuccessMsg('Media uploaded successfully.');
    } catch (err: any) {
      console.error('Error uploading media:', err);
      setError('Failed to upload media.');
    } finally {
      setUploadingMedia(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Live Preview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">System & Homepage Settings</h2>
          <p className="text-xs text-slate-500 mt-1">Manage global app configuration, dynamic homepage sections, announcements, and media library.</p>
        </div>
        <button
          onClick={() => window.open('/', '_blank')}
          className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Live Preview Homepage</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200 flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">&times;</button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-900 rounded-xl text-xs font-medium border border-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900 font-bold">&times;</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-2 border-b border-slate-200 pb-2">
        {[
          { id: 'general', label: 'General & SEO', icon: Settings },
          { id: 'sections', label: 'Homepage Sections', icon: Layout },
          { id: 'announcements', label: 'Announcements', icon: Megaphone },
          { id: 'footer', label: 'Footer & Social', icon: Menu },
          { id: 'media', label: 'Media Library', icon: ImageIcon },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`min-h-[44px] flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm shrink-0 transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: GENERAL & SEO */}
      {activeTab === 'general' && (
        <form onSubmit={handleSaveGeneral} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <h3 className="text-base font-bold text-slate-900">General Configuration & Branding</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Application Name</label>
              <input
                type="text"
                required
                value={settings.appName}
                onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Primary Brand Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={settings.primaryColor}
                  onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  className="w-11 h-11 rounded-xl border border-slate-200 cursor-pointer p-1"
                />
                <input
                  type="text"
                  value={settings.primaryColor}
                  onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  className="flex-1 min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-mono"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700 uppercase">Tagline (3 Languages)</label>
            {(['rw', 'en', 'fr'] as Language[]).map((lang) => (
              <div key={lang} className="flex items-center gap-3">
                <span className="w-10 uppercase text-xs font-extrabold text-blue-600 bg-blue-50 py-2 text-center rounded-lg">{lang}</span>
                <input
                  type="text"
                  value={settings.tagline[lang] || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    tagline: { ...settings.tagline, [lang]: e.target.value }
                  })}
                  placeholder={`Tagline in ${lang.toUpperCase()}`}
                  className="flex-1 min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Logo URL</label>
              <input
                type="text"
                value={settings.logoUrl}
                onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                placeholder="https://.../logo.png"
                className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Favicon URL</label>
              <input
                type="text"
                value={settings.faviconUrl}
                onChange={(e) => setSettings({ ...settings, faviconUrl: e.target.value })}
                placeholder="https://.../favicon.ico"
                className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-900">Contact Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Phone Number</label>
                <input
                  type="text"
                  value={settings.contact.phone}
                  onChange={(e) => setSettings({ ...settings, contact: { ...settings.contact, phone: e.target.value } })}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">WhatsApp Number</label>
                <input
                  type="text"
                  value={settings.contact.whatsapp}
                  onChange={(e) => setSettings({ ...settings, contact: { ...settings.contact, whatsapp: e.target.value } })}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Support Email</label>
                <input
                  type="email"
                  value={settings.contact.email}
                  onChange={(e) => setSettings({ ...settings, contact: { ...settings.contact, email: e.target.value } })}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Physical Address</label>
                <input
                  type="text"
                  value={settings.contact.address}
                  onChange={(e) => setSettings({ ...settings, contact: { ...settings.contact, address: e.target.value } })}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-900">SEO Meta Tags</h4>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">SEO Title</label>
              <input
                type="text"
                value={settings.seo.title}
                onChange={(e) => setSettings({ ...settings, seo: { ...settings.seo, title: e.target.value } })}
                className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">SEO Description</label>
              <textarea
                rows={3}
                value={settings.seo.description}
                onChange={(e) => setSettings({ ...settings, seo: { ...settings.seo, description: e.target.value } })}
                className="w-full p-3 rounded-xl border border-slate-200 text-xs sm:text-sm"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Maintenance Mode</h4>
              <p className="text-xs text-slate-500">When enabled, visitors see a maintenance notice while admin retains full access.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.maintenanceMode}
                onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save General Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: HOMEPAGE SECTIONS */}
      {activeTab === 'sections' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">Homepage Sections Management</h3>
            <p className="text-xs text-slate-500">Reorder sections up/down, toggle visibility, and edit multilingual titles.</p>

            <div className="divide-y divide-slate-100">
              {sections.map((sec, idx) => (
                <div key={sec.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center text-xs font-mono font-bold">
                      {sec.order}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{sec.type}</h4>
                      <p className="text-xs text-slate-500">{sec.title?.en || sec.title?.rw || 'No title'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleMoveSection(idx, 'up')}
                      disabled={idx === 0}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30"
                      title="Move Up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMoveSection(idx, 'down')}
                      disabled={idx === sections.length - 1}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30"
                      title="Move Down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleSectionVisibility(sec)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                        sec.isVisible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {sec.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>{sec.isVisible ? 'Visible' : 'Hidden'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Announcements</h3>
              <p className="text-xs text-slate-500">Create and manage active announcement banners for learners.</p>
            </div>
            <button
              onClick={() => {
                setCurrentAnnouncement({
                  title: { rw: '', en: '', fr: '' },
                  body: { rw: '', en: '', fr: '' },
                  type: 'info',
                  imageUrl: '',
                  linkUrl: '',
                  isPinned: false,
                  isActive: true,
                  startAt: new Date().toISOString(),
                  endAt: new Date(Date.now() + 7*24*60*60*1000).toISOString()
                });
                setAnnouncementModalOpen(true);
              }}
              className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Announcement</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {announcements.map((ann) => (
              <div key={ann.id} className="p-4 rounded-xl border border-slate-200 space-y-3 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                    ann.type === 'promo' ? 'bg-purple-100 text-purple-700' :
                    ann.type === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {ann.type}
                  </span>
                  <div className="flex items-center gap-1">
                    {ann.isPinned && <Pin className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />}
                    <button
                      onClick={() => {
                        setCurrentAnnouncement(ann);
                        setAnnouncementModalOpen(true);
                      }}
                      className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-lg"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ type: 'announcements', id: ann.id, title: ann.title?.en || 'Announcement' })}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h4 className="text-sm font-bold text-slate-900">{ann.title?.en || ann.title?.rw}</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{ann.body?.en || ann.body?.rw}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: FOOTER & SOCIAL */}
      {activeTab === 'footer' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <h3 className="text-base font-bold text-slate-900">Footer Groups & Social Links</h3>
          <p className="text-xs text-slate-500">Manage footer column groups, footer navigation links, and social media links.</p>

          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-800">Social Media Links</h4>
            <div className="flex flex-wrap gap-3">
              {socialLinks.map((soc) => (
                <div key={soc.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
                  <span>{soc.platform}:</span>
                  <span className="text-blue-600 truncate max-w-[150px]">{soc.url}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: MEDIA LIBRARY */}
      {activeTab === 'media' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Site Media Library</h3>
              <p className="text-xs text-slate-500">Upload and manage images used across the homepage and lessons.</p>
            </div>
            <label className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              <span>{uploadingMedia ? 'Uploading...' : 'Upload Media'}</span>
              <input type="file" multiple accept="image/*" onChange={handleMediaUpload} className="hidden" />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {mediaList.map((m) => (
              <div key={m.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 space-y-2 p-2">
                <img src={m.url} alt={m.name} className="w-full h-28 object-cover rounded-lg" />
                <div className="text-xs font-medium text-slate-800 truncate px-1">{m.name}</div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(m.url);
                    setSuccessMsg('Media URL copied to clipboard!');
                  }}
                  className="w-full py-1.5 bg-white border border-slate-200 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-50"
                >
                  Copy URL
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Announcement Modal */}
      {announcementModalOpen && currentAnnouncement && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              {currentAnnouncement.id ? 'Edit Announcement' : 'New Announcement'}
            </h3>

            <form onSubmit={handleSaveAnnouncement} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Type</label>
                <select
                  value={currentAnnouncement.type}
                  onChange={(e) => setCurrentAnnouncement({ ...currentAnnouncement, type: e.target.value })}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                >
                  <option value="info">Info</option>
                  <option value="promo">Promo</option>
                  <option value="warning">Warning</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Title (English)</label>
                <input
                  type="text"
                  required
                  value={currentAnnouncement.title?.en || ''}
                  onChange={(e) => setCurrentAnnouncement({
                    ...currentAnnouncement,
                    title: { ...currentAnnouncement.title, en: e.target.value, rw: e.target.value, fr: e.target.value }
                  })}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Body (English)</label>
                <textarea
                  rows={3}
                  required
                  value={currentAnnouncement.body?.en || ''}
                  onChange={(e) => setCurrentAnnouncement({
                    ...currentAnnouncement,
                    body: { ...currentAnnouncement.body, en: e.target.value, rw: e.target.value, fr: e.target.value }
                  })}
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={currentAnnouncement.isPinned}
                  onChange={(e) => setCurrentAnnouncement({ ...currentAnnouncement, isPinned: e.target.checked })}
                  id="pinnedCheck"
                  className="w-4 h-4 text-blue-600 rounded border-slate-300"
                />
                <label htmlFor="pinnedCheck" className="text-xs font-semibold text-slate-700">Pin to top</label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAnnouncementModalOpen(false)}
                  className="min-h-[44px] px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold shadow-sm"
                >
                  Save Announcement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Confirm Deletion</h3>
            <p className="text-xs text-slate-600">Are you sure you want to delete "{confirmDelete.title}"? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="min-h-[44px] px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.type === 'announcements') {
                    handleDeleteAnnouncement(confirmDelete.id);
                  }
                }}
                className="min-h-[44px] px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
