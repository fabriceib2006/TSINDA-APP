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
  const [language, setLanguageState] = useState<Language>('rw');

  useEffect(() => {
    // Read from cookie
    const cookies = document.cookie.split(';');
    const langCookie = cookies.find(c => c.trim().startsWith('lang='));
    let initialLang: Language = 'rw';
    if (langCookie) {
      const savedLang = langCookie.split('=')[1] as Language;
      if (['rw', 'en', 'fr'].includes(savedLang)) {
        initialLang = savedLang;
      }
    }
    setLanguageState(initialLang);

    // Sync with user profile on login
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            if (userSnap.exists()) {
                const data = userSnap.data();
                if (data.language) {
                    setLanguageState(data.language as Language);
                } else {
                    // Sync cookie to DB
                    await updateDoc(doc(db, 'users', user.uid), { language: initialLang });
                }
            }
        }
    });
    return () => unsubscribe();
  }, []);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    // Set cookie
    document.cookie = `lang=${lang};max-age=31536000;path=/`;
    
    // Sync if logged in
    if (auth.currentUser) {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { language: lang });
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
