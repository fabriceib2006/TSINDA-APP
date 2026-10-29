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
  Globe,
  Search,
  Copy,
  CheckCheck
} from 'lucide-react';
import { Language } from '../../types';
import { seedSystemSettingsIfNeeded } from '../../lib/seedSystemSettings';
import { compressImage } from '../../lib/imageUtils';

export const SystemSettingsManager: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'sections' | 'announcements' | 'footer' | 'media' | 'referral'>('general');

  // General settings state
  const [settings, setSettings] = useState({
    appName: 'TSINDA',
    tagline: { rw: '', en: '', fr: '' },
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#2563eb',
    footerDescription: { rw: '', en: '', fr: '' },
    copyrightText: '',
    contact: { phone: '', whatsapp: '', email: '', address: '' },
    seo: { title: '', description: '' },
    maintenanceMode: false,
    termsContent: { rw: '', en: '', fr: '' },
    privacyContent: { rw: '', en: '', fr: '' }
  });

  const [referralSettings, setReferralSettings] = useState({
    active: false,
    baseDomain: 'https://tsinda.app',
    pointsPercent: 10,
    pointValueRwf: 100
  });

  const [rewardsList, setRewardsList] = useState<any[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [reversingRewardId, setReversingRewardId] = useState<string | null>(null);
  const [rewardsPage, setRewardsPage] = useState<number>(1);
  const rewardsPerPage = 5;

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
  
  // Modals for Footer/Social editing
  const [socialModalOpen, setSocialModalOpen] = useState(false);
  const [currentSocial, setCurrentSocial] = useState<any | null>(null);

  const [footerGroupModalOpen, setFooterGroupModalOpen] = useState(false);
  const [currentFooterGroup, setCurrentFooterGroup] = useState<any | null>(null);

  const [footerLinkModalOpen, setFooterLinkModalOpen] = useState(false);
  const [currentFooterLink, setCurrentFooterLink] = useState<any | null>(null);

  // Media library & image slots state
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [imageSlots, setImageSlots] = useState<any[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaSearch, setMediaSearch] = useState('');
  const [editingMediaAlt, setEditingMediaAlt] = useState<any | null>(null);
  
  // Media Picker Modal
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTargetSetter, setMediaPickerTargetSetter] = useState<((url: string) => void) | null>(null);

  // Confirmation modal state
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: string; title: string; extraWarning?: string } | null>(null);

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

      const [setSnap, secSnap, itemSnap, annSnap, fgSnap, flSnap, socSnap, medSnap, slotSnap, refSnap] = await Promise.all([
        getDoc(doc(db, 'siteSettings', 'config')),
        getDocs(collection(db, 'homepageSections')),
        getDocs(collection(db, 'homepageItems')),
        getDocs(collection(db, 'announcements')),
        getDocs(collection(db, 'footerGroups')),
        getDocs(collection(db, 'footerLinks')),
        getDocs(collection(db, 'socialLinks')),
        getDocs(collection(db, 'siteMedia')),
        getDocs(collection(db, 'imageSlots')),
        getDoc(doc(db, 'siteSettings', 'referral')),
      ]);

      if (setSnap.exists()) {
        setSettings(prev => ({ ...prev, ...setSnap.data() }));
      }
      if (refSnap.exists()) {
        setReferralSettings(refSnap.data() as any);
      }
      if (secSnap) {
        const list = secSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        setSections(list);
        if (list.length > 0 && !selectedSectionForItems) setSelectedSectionForItems(list[0].id);
      }
      if (itemSnap) setItems(itemSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (annSnap) setAnnouncements(annSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (fgSnap) {
        const list = fgSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        setFooterGroups(list);
      }
      if (flSnap) {
        const list = flSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        setFooterLinks(list);
      }
      if (socSnap) {
        const list = socSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        setSocialLinks(list);
      }
      if (medSnap) {
        setMediaList(medSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      if (slotSnap) {
        setImageSlots(slotSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
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
      await logAdminAction('UPDATE_SITE_SETTINGS', 'Updated general site settings & footer text');
      setSuccessMsg('General settings saved successfully.');
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await setDoc(doc(db, 'siteSettings', 'referral'), referralSettings);
      await logAdminAction('UPDATE_REFERRAL_SETTINGS', 'Updated referral system configuration');
      setSuccessMsg('Referral settings saved successfully.');
    } catch (err: any) {
      console.error('Error saving referral settings:', err);
      setError(err.message || 'Failed to save referral settings.');
    } finally {
      setSaving(false);
    }
  };

  const fetchRewards = async () => {
    try {
      setLoadingRewards(true);
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) return;
      const res = await fetch('/api/admin/referral/rewards', {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRewardsList(data.rewards || []);
      }
    } catch (e) {
      console.warn('Error fetching referral rewards:', e);
    } finally {
      setLoadingRewards(false);
    }
  };

  const handleReverseReward = async (rewardId: string) => {
    const reason = window.prompt('Enter reason for reversing this reward:', 'Administrative review');
    if (reason === null) return;
    try {
      setReversingRewardId(rewardId);
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/referral/reverse-reward', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ rewardId, reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reverse reward');
      setSuccessMsg('Referral reward reversed successfully.');
      fetchRewards();
    } catch (err: any) {
      setError(err.message || 'Error reversing reward');
    } finally {
      setReversingRewardId(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'referral') {
      fetchRewards();
    }
  }, [activeTab]);

  // Social Links Handlers
  const handleSaveSocial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSocial) return;
    if (!currentSocial.url.startsWith('https://')) {
      setError('Social media URL must be a valid https:// link.');
      return;
    }
    setError(null);
    try {
      if (currentSocial.id) {
        const { id, ...data } = currentSocial;
        await updateDoc(doc(db, 'socialLinks', id), data);
        setSocialLinks(socialLinks.map(s => s.id === id ? currentSocial : s));
        await logAdminAction('UPDATE_SOCIAL_LINK', `Updated social link ${currentSocial.platform}`);
      } else {
        const newDoc = { ...currentSocial, order: socialLinks.length + 1, isVisible: true };
        const ref = await addDoc(collection(db, 'socialLinks'), newDoc);
        setSocialLinks([...socialLinks, { id: ref.id, ...newDoc }]);
        await logAdminAction('CREATE_SOCIAL_LINK', `Created social link ${currentSocial.platform}`);
      }
      setSocialModalOpen(false);
      setCurrentSocial(null);
      setSuccessMsg('Social link saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save social link.');
    }
  };

  const handleDeleteSocial = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'socialLinks', id));
      setSocialLinks(socialLinks.filter(s => s.id !== id));
      setConfirmDelete(null);
      await logAdminAction('DELETE_SOCIAL_LINK', `Deleted social link ${id}`);
      setSuccessMsg('Social link deleted.');
    } catch (err) {
      setError('Failed to delete social link.');
    }
  };

  // Footer Groups Handlers
  const handleSaveFooterGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFooterGroup) return;
    try {
      if (currentFooterGroup.id) {
        const { id, ...data } = currentFooterGroup;
        await updateDoc(doc(db, 'footerGroups', id), data);
        setFooterGroups(footerGroups.map(g => g.id === id ? currentFooterGroup : g));
        await logAdminAction('UPDATE_FOOTER_GROUP', `Updated footer group`);
      } else {
        const newDoc = { ...currentFooterGroup, order: footerGroups.length + 1, isVisible: true };
        const ref = await addDoc(collection(db, 'footerGroups'), newDoc);
        setFooterGroups([...footerGroups, { id: ref.id, ...newDoc }]);
        await logAdminAction('CREATE_FOOTER_GROUP', `Created footer group`);
      }
      setFooterGroupModalOpen(false);
      setCurrentFooterGroup(null);
      setSuccessMsg('Footer group saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save footer group.');
    }
  };

  const handleDeleteFooterGroup = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'footerGroups', id));
      setFooterGroups(footerGroups.filter(g => g.id !== id));
      // Also delete associated links
      const linksToDelete = footerLinks.filter(l => l.groupId === id);
      for (const l of linksToDelete) {
        await deleteDoc(doc(db, 'footerLinks', l.id));
      }
      setFooterLinks(footerLinks.filter(l => l.groupId !== id));
      setConfirmDelete(null);
      await logAdminAction('DELETE_FOOTER_GROUP', `Deleted footer group and links`);
      setSuccessMsg('Footer group deleted.');
    } catch (err) {
      setError('Failed to delete footer group.');
    }
  };

  // Footer Links Handlers
  const handleSaveFooterLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFooterLink) return;
    try {
      if (currentFooterLink.id) {
        const { id, ...data } = currentFooterLink;
        await updateDoc(doc(db, 'footerLinks', id), data);
        setFooterLinks(footerLinks.map(l => l.id === id ? currentFooterLink : l));
        await logAdminAction('UPDATE_FOOTER_LINK', `Updated footer link`);
      } else {
        const newDoc = { ...currentFooterLink, order: footerLinks.filter(l => l.groupId === currentFooterLink.groupId).length + 1, isVisible: true };
        const ref = await addDoc(collection(db, 'footerLinks'), newDoc);
        setFooterLinks([...footerLinks, { id: ref.id, ...newDoc }]);
        await logAdminAction('CREATE_FOOTER_LINK', `Created footer link`);
      }
      setFooterLinkModalOpen(false);
      setCurrentFooterLink(null);
      setSuccessMsg('Footer link saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save footer link.');
    }
  };

  const handleDeleteFooterLink = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'footerLinks', id));
      setFooterLinks(footerLinks.filter(l => l.id !== id));
      setConfirmDelete(null);
      await logAdminAction('DELETE_FOOTER_LINK', `Deleted footer link`);
      setSuccessMsg('Footer link deleted.');
    } catch (err) {
      setError('Failed to delete footer link.');
    }
  };

  // Media Library & Image Slots Handlers
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingMedia(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const url = await compressImage(file);
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '').toLowerCase();
        
        const matchingSlot = imageSlots.find(s => s.slotKey.toLowerCase() === nameWithoutExt);
        if (matchingSlot) {
          await updateDoc(doc(db, 'imageSlots', matchingSlot.id), {
            imageUrl: url,
            updatedAt: new Date().toISOString()
          });
          setImageSlots(prev => prev.map(s => s.id === matchingSlot.id ? { ...s, imageUrl: url, updatedAt: new Date().toISOString() } : s));
        }

        const mediaData = {
          url,
          name: file.name,
          size: `${(file.size / 1024).toFixed(1)} KB`,
          altText: { rw: file.name, en: file.name, fr: file.name },
          createdAt: new Date().toISOString()
        };
        const ref = await addDoc(collection(db, 'siteMedia'), mediaData);
        setMediaList(prev => [{ id: ref.id, ...mediaData }, ...prev]);
      }
      await logAdminAction('UPLOAD_MEDIA', `Uploaded ${files.length} file(s) to media library`);
      setSuccessMsg('Media uploaded successfully.');
    } catch (err: any) {
      setError('Failed to upload media: ' + (err.message || ''));
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleRemoveSlotImage = async (slotId: string) => {
    try {
      await updateDoc(doc(db, 'imageSlots', slotId), { imageUrl: '', updatedAt: new Date().toISOString() });
      setImageSlots(imageSlots.map(s => s.id === slotId ? { ...s, imageUrl: '', updatedAt: new Date().toISOString() } : s));
      setSuccessMsg('Slot image removed.');
    } catch (err) {
      setError('Failed to remove slot image.');
    }
  };

  const handleReplaceSlotImage = async (slotId: string, file: File) => {
    try {
      const url = await compressImage(file);
      await updateDoc(doc(db, 'imageSlots', slotId), { imageUrl: url, updatedAt: new Date().toISOString() });
      setImageSlots(imageSlots.map(s => s.id === slotId ? { ...s, imageUrl: url, updatedAt: new Date().toISOString() } : s));
      const mediaData = { url, name: file.name, size: `${(file.size / 1024).toFixed(1)} KB`, altText: { rw: file.name, en: file.name, fr: file.name }, createdAt: new Date().toISOString() };
      const ref = await addDoc(collection(db, 'siteMedia'), mediaData);
      setMediaList(prev => [{ id: ref.id, ...mediaData }, ...prev]);
      setSuccessMsg('Slot image replaced successfully.');
    } catch (err: any) {
      setError('Failed to replace slot image: ' + (err.message || ''));
    }
  };

  const handleDeleteMedia = async (media: any) => {
    // Check where media is used
    let usageCount = 0;
    if (settings.logoUrl === media.url || settings.faviconUrl === media.url) usageCount++;
    announcements.forEach(a => { if (a.imageUrl === media.url) usageCount++; });
    items.forEach(i => { if (i.imageUrl === media.url) usageCount++; });

    if (usageCount > 0) {
      setConfirmDelete({
        type: 'media',
        id: media.id,
        title: media.name,
        extraWarning: `Warning: This image is currently in use in ${usageCount} place(s) on the site.`
      });
      return;
    }

    executeDeleteMedia(media.id);
  };

  const executeDeleteMedia = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'siteMedia', id));
      setMediaList(mediaList.filter(m => m.id !== id));
      setConfirmDelete(null);
      await logAdminAction('DELETE_MEDIA', `Deleted media item ${id}`);
      setSuccessMsg('Media deleted successfully.');
    } catch (err) {
      setError('Failed to delete media.');
    }
  };

  const handleUpdateMediaAlt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMediaAlt) return;
    try {
      await updateDoc(doc(db, 'siteMedia', editingMediaAlt.id), { altText: editingMediaAlt.altText });
      setMediaList(mediaList.map(m => m.id === editingMediaAlt.id ? editingMediaAlt : m));
      setEditingMediaAlt(null);
      setSuccessMsg('Media alt text updated.');
    } catch (err) {
      setError('Failed to update media alt text.');
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
          <p className="text-xs text-slate-500 mt-1">Manage global app configuration, footer, social links, and media library.</p>
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
          { id: 'referral', label: 'Referral System', icon: Globe },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`min-h-[44px] flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm shrink-0 transition-all ${
                isActive ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
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
                  value={settings.tagline?.[lang] || ''}
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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.logoUrl}
                  onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                  placeholder="https://.../logo.png"
                  className="flex-1 min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    setMediaPickerTargetSetter(() => (url: string) => setSettings(s => ({ ...s, logoUrl: url })));
                    setMediaPickerOpen(true);
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Choose from library
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Favicon URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.faviconUrl}
                  onChange={(e) => setSettings({ ...settings, faviconUrl: e.target.value })}
                  placeholder="https://.../favicon.ico"
                  className="flex-1 min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    setMediaPickerTargetSetter(() => (url: string) => setSettings(s => ({ ...s, faviconUrl: url })));
                    setMediaPickerOpen(true);
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Choose from library
                </button>
              </div>
            </div>
          </div>

          {/* Footer Text & Copyright in General/Footer settings */}
          <div className="border-t border-slate-100 pt-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-900">Footer Texts</h4>
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700 uppercase">Footer Description (3 Languages)</label>
              {(['rw', 'en', 'fr'] as Language[]).map((lang) => (
                <div key={lang} className="flex items-center gap-3">
                  <span className="w-10 uppercase text-xs font-extrabold text-blue-600 bg-blue-50 py-2 text-center rounded-lg">{lang}</span>
                  <input
                    type="text"
                    value={settings.footerDescription?.[lang] || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      footerDescription: { ...settings.footerDescription, [lang]: e.target.value }
                    })}
                    className="flex-1 min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Copyright Text</label>
              <input
                type="text"
                value={settings.copyrightText || ''}
                onChange={(e) => setSettings({ ...settings, copyrightText: e.target.value })}
                placeholder="e.g. © 2026 TSINDA. All rights reserved."
                className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
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

          <div className="border-t border-slate-100 pt-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-900">Terms & Conditions Content (3 Languages)</h4>
            {(['rw', 'en', 'fr'] as Language[]).map((lang) => (
              <div key={lang} className="space-y-1">
                <label className="block text-xs font-bold uppercase text-blue-600">{lang.toUpperCase()} Terms & Conditions</label>
                <textarea
                  rows={4}
                  value={settings.termsContent?.[lang] || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    termsContent: { ...settings.termsContent, [lang]: e.target.value }
                  })}
                  placeholder={`Terms and conditions in ${lang.toUpperCase()}`}
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs sm:text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-900">Privacy Policy Content (3 Languages)</h4>
            {(['rw', 'en', 'fr'] as Language[]).map((lang) => (
              <div key={lang} className="space-y-1">
                <label className="block text-xs font-bold uppercase text-blue-600">{lang.toUpperCase()} Privacy Policy</label>
                <textarea
                  rows={4}
                  value={settings.privacyContent?.[lang] || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    privacyContent: { ...settings.privacyContent, [lang]: e.target.value }
                  })}
                  placeholder={`Privacy policy in ${lang.toUpperCase()}`}
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs sm:text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            ))}
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
                      onClick={async () => {
                        const targetIndex = idx - 1;
                        if (targetIndex < 0) return;
                        const newSections = [...sections];
                        const temp = newSections[idx];
                        newSections[idx] = newSections[targetIndex];
                        newSections[targetIndex] = temp;
                        for (let i = 0; i < newSections.length; i++) {
                          await updateDoc(doc(db, 'homepageSections', newSections[i].id), { order: i + 1 });
                          newSections[i].order = i + 1;
                        }
                        setSections(newSections);
                      }}
                      disabled={idx === 0}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        const targetIndex = idx + 1;
                        if (targetIndex >= sections.length) return;
                        const newSections = [...sections];
                        const temp = newSections[idx];
                        newSections[idx] = newSections[targetIndex];
                        newSections[targetIndex] = temp;
                        for (let i = 0; i < newSections.length; i++) {
                          await updateDoc(doc(db, 'homepageSections', newSections[i].id), { order: i + 1 });
                          newSections[i].order = i + 1;
                        }
                        setSections(newSections);
                      }}
                      disabled={idx === sections.length - 1}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        const newVis = !sec.isVisible;
                        await updateDoc(doc(db, 'homepageSections', sec.id), { isVisible: newVis });
                        setSections(sections.map(s => s.id === sec.id ? { ...s, isVisible: newVis } : s));
                      }}
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
              className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-2"
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
        <div className="space-y-6">
          {/* Social Media Links Section */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Social Media Links</h3>
                <p className="text-xs text-slate-500">Manage social channel links (validated as https:// links).</p>
              </div>
              <button
                onClick={() => {
                  setCurrentSocial({ platform: 'WhatsApp', url: 'https://', isVisible: true });
                  setSocialModalOpen(true);
                }}
                className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Social Link</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {socialLinks.map((soc, idx) => (
                <div key={soc.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{soc.platform}</span>
                    <a href={soc.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline truncate max-w-[180px] block">{soc.url}</a>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={async () => {
                        const newVis = !soc.isVisible;
                        await updateDoc(doc(db, 'socialLinks', soc.id), { isVisible: newVis });
                        setSocialLinks(socialLinks.map(s => s.id === soc.id ? { ...s, isVisible: newVis } : s));
                      }}
                      className={`p-1.5 rounded-lg text-xs ${soc.isVisible ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 bg-slate-100'}`}
                    >
                      {soc.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setCurrentSocial(soc);
                        setSocialModalOpen(true);
                      }}
                      className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-lg"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ type: 'socialLinks', id: soc.id, title: soc.platform })}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Groups & Links Section */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Footer Groups & Links</h3>
                <p className="text-xs text-slate-500">Manage footer column groups and links in 3 languages.</p>
              </div>
              <button
                onClick={() => {
                  setCurrentFooterGroup({ title: { rw: '', en: '', fr: '' } });
                  setFooterGroupModalOpen(true);
                }}
                className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Footer Group</span>
              </button>
            </div>

            <div className="space-y-6">
              {footerGroups.map((group) => {
                const groupLinks = footerLinks.filter(l => l.groupId === group.id).sort((a,b) => (a.order || 0) - (b.order || 0));
                return (
                  <div key={group.id} className="p-5 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{group.title?.en || group.title?.rw || 'Unnamed Group'}</h4>
                        <span className="text-[10px] text-slate-500 uppercase">{group.isVisible ? 'Visible' : 'Hidden'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setCurrentFooterLink({ groupId: group.id, label: { rw: '', en: '', fr: '' }, url: 'https://' });
                            setFooterLinkModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-semibold flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Link
                        </button>
                        <button
                          onClick={() => {
                            setCurrentFooterGroup(group);
                            setFooterGroupModalOpen(true);
                          }}
                          className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-lg"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ type: 'footerGroups', id: group.id, title: group.title?.en || 'Group' })}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {groupLinks.map((link) => (
                        <div key={link.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-slate-800">{link.label?.en || link.label?.rw}</span>
                            <span className="text-xs text-blue-600 block truncate max-w-[250px]">{link.url}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setCurrentFooterLink(link);
                                setFooterLinkModalOpen(true);
                              }}
                              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete({ type: 'footerLinks', id: link.id, title: link.label?.en || 'Link' })}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {groupLinks.length === 0 && (
                        <p className="text-xs text-slate-400 italic">No links in this group yet.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: MEDIA LIBRARY */}
      {activeTab === 'media' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Site Media Library</h3>
              <p className="text-xs text-slate-500">Upload and manage images used across homepage sections, announcements, and lessons.</p>
              <p className="text-[11px] text-blue-600 font-medium mt-1">Note: Images uploaded here can be chosen in the homepage sections, announcements, and lessons.</p>
              <p className="text-[11px] text-slate-600 font-semibold mt-1">File names to use for auto-assignment: hero.jpg, feature-exams.jpg, feature-lessons.jpg, feature-videos.jpg, feature-languages.jpg, feature-progress.jpg, announcement.jpg, logo.png, favicon.png</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search media..."
                  value={mediaSearch}
                  onChange={(e) => setMediaSearch(e.target.value)}
                  className="pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <label className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-colors">
                <Upload className="w-4 h-4" />
                <span>{uploadingMedia ? 'Uploading...' : 'Upload Media'}</span>
                <input type="file" multiple accept="image/*" onChange={handleMediaUpload} className="hidden" />
              </label>
            </div>
          </div>

          {/* Slots Table */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <h4 className="text-sm font-bold text-slate-900">Image Slots</h4>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="p-3">Slot Name / Key</th>
                    <th className="p-3">Thumbnail</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {imageSlots.map(slot => (
                    <tr key={slot.id} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{slot.label}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{slot.slotKey}</div>
                      </td>
                      <td className="p-3">
                        {slot.imageUrl ? (
                          <img src={slot.imageUrl} alt={slot.label} className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Empty (Fallback)</span>
                        )}
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <label className="px-2.5 py-1 bg-white border border-slate-200 text-blue-600 rounded-lg text-xs font-semibold cursor-pointer hover:bg-blue-50 inline-block">
                          <span>Replace</span>
                          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleReplaceSlotImage(slot.id, e.target.files[0])} className="hidden" />
                        </label>
                        <button
                          onClick={() => {
                            setMediaPickerTargetSetter(() => async (url: string) => {
                              await updateDoc(doc(db, 'imageSlots', slot.id), { imageUrl: url, updatedAt: new Date().toISOString() });
                              setImageSlots(imageSlots.map(s => s.id === slot.id ? { ...s, imageUrl: url, updatedAt: new Date().toISOString() } : s));
                              setSuccessMsg('Slot image updated from library.');
                            });
                            setMediaPickerOpen(true);
                          }}
                          className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200"
                        >
                          Use Library
                        </button>
                        {slot.imageUrl && (
                          <button
                            onClick={() => handleRemoveSlotImage(slot.id)}
                            className="px-2.5 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-200">
            {mediaList
              .filter(m => m.name.toLowerCase().includes(mediaSearch.toLowerCase()))
              .map((m) => (
                <div key={m.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 space-y-2 p-3 flex flex-col justify-between">
                  <div>
                    <img src={m.url} alt={m.name} className="w-full h-28 object-cover rounded-lg border border-slate-100" />
                    <div className="text-xs font-bold text-slate-900 truncate mt-2">{m.name}</div>
                    <div className="text-[10px] text-slate-500 flex justify-between">
                      <span>{m.size || 'Unknown size'}</span>
                      <span>{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : ''}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(m.url);
                        setSuccessMsg('Media URL copied to clipboard!');
                      }}
                      className="w-full py-1.5 bg-white border border-slate-200 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-50 flex items-center justify-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy URL
                    </button>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingMediaAlt(m)}
                        className="flex-1 py-1 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-semibold hover:bg-slate-200"
                      >
                        Edit Alt Text
                      </button>
                      <button
                        onClick={() => handleDeleteMedia(m)}
                        className="px-2 py-1 bg-red-50 text-red-600 rounded-lg text-[11px] font-semibold hover:bg-red-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
            ))}
          </div>
        </div>
      )}

      {/* Social Modal */}
      {socialModalOpen && currentSocial && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{currentSocial.id ? 'Edit Social Link' : 'Add Social Link'}</h3>
            <form onSubmit={handleSaveSocial} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Platform</label>
                <select
                  value={currentSocial.platform}
                  onChange={(e) => setCurrentSocial({ ...currentSocial, platform: e.target.value })}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs"
                >
                  {['WhatsApp', 'Instagram', 'Facebook', 'X', 'YouTube', 'TikTok', 'LinkedIn', 'Telegram'].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">URL (must start with https://)</label>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={currentSocial.url}
                  onChange={(e) => setCurrentSocial({ ...currentSocial, url: e.target.value })}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setSocialModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold shadow-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer Group Modal */}
      {footerGroupModalOpen && currentFooterGroup && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{currentFooterGroup.id ? 'Edit Footer Group' : 'New Footer Group'}</h3>
            <form onSubmit={handleSaveFooterGroup} className="space-y-4">
              {(['rw', 'en', 'fr'] as Language[]).map(lang => (
                <div key={lang}>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Title ({lang.toUpperCase()})</label>
                  <input
                    type="text"
                    required
                    value={currentFooterGroup.title?.[lang] || ''}
                    onChange={(e) => setCurrentFooterGroup({
                      ...currentFooterGroup,
                      title: { ...currentFooterGroup.title, [lang]: e.target.value }
                    })}
                    className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              ))}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setFooterGroupModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold shadow-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer Link Modal */}
      {footerLinkModalOpen && currentFooterLink && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{currentFooterLink.id ? 'Edit Footer Link' : 'New Footer Link'}</h3>
            <form onSubmit={handleSaveFooterLink} className="space-y-4">
              {(['rw', 'en', 'fr'] as Language[]).map(lang => (
                <div key={lang}>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Label ({lang.toUpperCase()})</label>
                  <input
                    type="text"
                    required
                    value={currentFooterLink.label?.[lang] || ''}
                    onChange={(e) => setCurrentFooterLink({
                      ...currentFooterLink,
                      label: { ...currentFooterLink.label, [lang]: e.target.value }
                    })}
                    className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">URL</label>
                <input
                  type="text"
                  required
                  value={currentFooterLink.url}
                  onChange={(e) => setCurrentFooterLink({ ...currentFooterLink, url: e.target.value })}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setFooterLinkModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold shadow-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Media Alt Text Modal */}
      {editingMediaAlt && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Edit Alt Text</h3>
            <form onSubmit={handleUpdateMediaAlt} className="space-y-4">
              {(['rw', 'en', 'fr'] as Language[]).map(lang => (
                <div key={lang}>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Alt Text ({lang.toUpperCase()})</label>
                  <input
                    type="text"
                    value={editingMediaAlt.altText?.[lang] || ''}
                    onChange={(e) => setEditingMediaAlt({
                      ...editingMediaAlt,
                      altText: { ...editingMediaAlt.altText, [lang]: e.target.value }
                    })}
                    className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              ))}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setEditingMediaAlt(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold shadow-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Media Picker Modal */}
      {mediaPickerOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-3xl w-full space-y-4 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Choose Image from Library</h3>
              <button onClick={() => setMediaPickerOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {mediaList.map(m => (
                <div
                  key={m.id}
                  onClick={() => {
                    if (mediaPickerTargetSetter) mediaPickerTargetSetter(m.url);
                    setMediaPickerOpen(false);
                    setMediaPickerTargetSetter(null);
                  }}
                  className="border border-slate-200 rounded-xl p-2 cursor-pointer hover:border-blue-600 transition-colors bg-slate-50"
                >
                  <img src={m.url} alt={m.name} className="w-full h-24 object-cover rounded-lg" />
                  <div className="text-xs font-bold text-slate-800 truncate mt-1">{m.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Referral Settings & Rewards */}
      {activeTab === 'referral' && (
        <div className="space-y-6">
          <div className="max-w-2xl bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
              <span>🪙</span>
              <span>Referral Program Configuration</span>
            </h3>
            <form onSubmit={handleSaveReferral} className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="referralActive"
                  checked={referralSettings.active}
                  onChange={e => setReferralSettings(p => ({...p, active: e.target.checked}))}
                  className="w-5 h-5 text-blue-600 rounded"
                />
                <label htmlFor="referralActive" className="font-bold text-sm text-slate-900 cursor-pointer">
                  Activate Referral & Rewards System
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Base Domain for Referral Links
                </label>
                <input
                  type="text"
                  value={referralSettings.baseDomain}
                  onChange={e => setReferralSettings(p => ({...p, baseDomain: e.target.value}))}
                  placeholder="https://ais-dev-lixew3oqgbkl4s66icznfc-399525316199.europe-west1.run.app"
                  className="w-full border border-slate-200 p-2.5 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Domain used when students click "Copy Link" (e.g. https://domain.com)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Reward Percent (%)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={referralSettings.pointsPercent}
                    onChange={e => setReferralSettings(p => ({...p, pointsPercent: Number(e.target.value)}))}
                    className="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    % of cash plan payment awarded to referrer
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Point Value (RWF per Point)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={referralSettings.pointValueRwf}
                    onChange={e => setReferralSettings(p => ({...p, pointValueRwf: Number(e.target.value)}))}
                    className="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Value of 1 point when redeemed for plans
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Referral Configuration'}
                </button>
              </div>
            </form>
          </div>

          {/* Referral Rewards Management Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Referral Rewards & Reversals</h3>
                <p className="text-xs text-slate-500">Track all points awarded for referred student purchases and reverse if needed.</p>
              </div>
              <button
                type="button"
                onClick={fetchRewards}
                disabled={loadingRewards}
                className="self-start sm:self-auto px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <span>🔄</span>
                <span>{loadingRewards ? 'Refreshing...' : 'Refresh List'}</span>
              </button>
            </div>

            {(() => {
              const sortedRewards = [...rewardsList].sort((a, b) => Number(b.pointsAwarded || 0) - Number(a.pointsAwarded || 0));
              const totalRewardsPages = Math.ceil(sortedRewards.length / rewardsPerPage) || 1;
              const paginatedRewards = sortedRewards.slice((rewardsPage - 1) * rewardsPerPage, rewardsPage * rewardsPerPage);

              if (loadingRewards) {
                return <div className="py-8 text-center text-xs text-slate-500">Loading rewards...</div>;
              }
              if (rewardsList.length === 0) {
                return (
                  <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No referral rewards recorded yet.
                  </div>
                );
              }
              return (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Referrer</th>
                          <th className="py-2.5 px-3">Referred Student / Plan</th>
                          <th className="py-2.5 px-3">Amount Paid</th>
                          <th className="py-2.5 px-3">Points Awarded</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedRewards.map((rw: any) => {
                          const isReversed = rw.status === 'reversed';
                          const dateStr = rw.createdAt?.toDate 
                            ? rw.createdAt.toDate().toLocaleDateString()
                            : rw.date ? new Date(rw.date).toLocaleDateString() : 'N/A';

                          return (
                            <tr key={rw.id} className="hover:bg-slate-50/80">
                              <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{dateStr}</td>
                              <td className="py-3 px-3 font-mono font-semibold text-slate-900 truncate max-w-[120px]" title={rw.referrerId}>
                                {rw.referrerId}
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-semibold text-slate-900">{rw.planName || 'Plan'}</div>
                                <div className="text-[11px] text-slate-500 truncate max-w-[160px]">{rw.buyerEmail || rw.buyerId}</div>
                              </td>
                              <td className="py-3 px-3 font-semibold text-slate-800 whitespace-nowrap">
                                RWF {Number(rw.amountPaid || 0).toLocaleString()}
                              </td>
                              <td className="py-3 px-3 font-bold text-amber-600 whitespace-nowrap">
                                🪙 {rw.pointsAwarded} Coins
                              </td>
                              <td className="py-3 px-3">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                  isReversed ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}>
                                  {rw.status || 'awarded'}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right">
                                {!isReversed ? (
                                  <button
                                    type="button"
                                    onClick={() => handleReverseReward(rw.id)}
                                    disabled={reversingRewardId === rw.id}
                                    className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded text-[11px] border border-red-200 transition-colors disabled:opacity-50"
                                  >
                                    {reversingRewardId === rw.id ? 'Reversing...' : 'Reverse'}
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">Reversed</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Email-style Pagination Controls */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
                    <div>
                      Showing {Math.min((rewardsPage - 1) * rewardsPerPage + 1, sortedRewards.length)} to {Math.min(rewardsPage * rewardsPerPage, sortedRewards.length)} of {sortedRewards.length} rewards
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setRewardsPage(p => Math.max(p - 1, 1))}
                        disabled={rewardsPage === 1}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                      >
                        Previous
                      </button>
                      <span className="px-3 py-1.5 font-bold text-slate-700">
                        Page {rewardsPage} of {totalRewardsPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRewardsPage(p => Math.min(p + 1, totalRewardsPages))}
                        disabled={rewardsPage === totalRewardsPages}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Confirm Deletion</h3>
            <p className="text-xs text-slate-600">Are you sure you want to delete "{confirmDelete.title}"?</p>
            {confirmDelete.extraWarning && (
              <p className="text-xs text-amber-600 font-semibold bg-amber-50 p-3 rounded-xl">{confirmDelete.extraWarning}</p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="min-h-[44px] px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.type === 'announcements') {
                    // handle announcement delete
                  } else if (confirmDelete.type === 'socialLinks') {
                    handleDeleteSocial(confirmDelete.id);
                  } else if (confirmDelete.type === 'footerGroups') {
                    handleDeleteFooterGroup(confirmDelete.id);
                  } else if (confirmDelete.type === 'footerLinks') {
                    handleDeleteFooterLink(confirmDelete.id);
                  } else if (confirmDelete.type === 'media') {
                    executeDeleteMedia(confirmDelete.id);
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
