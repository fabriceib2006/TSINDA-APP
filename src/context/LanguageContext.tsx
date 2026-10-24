import React, { createContext, useContext, useEffect, useState } from 'react';
import { Language } from '../types';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    // Check localStorage first
    try {
      const stored = localStorage.getItem('tsinda_lang') as Language;
      if (stored && ['rw', 'en', 'fr'].includes(stored)) {
        return stored;
      }
    } catch (e) {
      // ignore
    }
    // Check cookie fallback
    try {
      const cookies = document.cookie.split(';');
      const langCookie = cookies.find(c => c.trim().startsWith('lang='));
      if (langCookie) {
        const savedLang = langCookie.split('=')[1] as Language;
        if (['rw', 'en', 'fr'].includes(savedLang)) {
          return savedLang;
        }
      }
    } catch (e) {
      // ignore
    }
    return 'rw';
  });

  useEffect(() => {
    // Sync with user profile on login, prioritizing local preference if set before login
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userSnap = await getDoc(doc(db, 'users', user.uid));
                const localStored = localStorage.getItem('tsinda_lang') as Language;
                
                if (localStored && ['rw', 'en', 'fr'].includes(localStored)) {
                    // User made a language selection (e.g. on homepage/login), sync it to DB
                    setLanguageState(localStored);
                    if (userSnap.exists()) {
                        await updateDoc(doc(db, 'users', user.uid), { language: localStored });
                    }
                } else if (userSnap.exists()) {
                    const data = userSnap.data();
                    if (data.language && ['rw', 'en', 'fr'].includes(data.language)) {
                        setLanguageState(data.language as Language);
                        localStorage.setItem('tsinda_lang', data.language);
                        document.cookie = `lang=${data.language};max-age=31536000;path=/`;
                    }
                }
            } catch (err) {
                console.warn("Error syncing language with user profile:", err);
            }
        }
    });
    return () => unsubscribe();
  }, []);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    // Save to localStorage
    try {
      localStorage.setItem('tsinda_lang', lang);
    } catch (e) {
      // ignore
    }
    // Save to cookie
    try {
      document.cookie = `lang=${lang};max-age=31536000;path=/`;
    } catch (e) {
      // ignore
    }
    
    // Sync if logged in
    if (auth.currentUser) {
      try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { language: lang });
      } catch (err) {
        console.warn("Error updating user language in Firestore:", err);
      }
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider");
  return context;
};
