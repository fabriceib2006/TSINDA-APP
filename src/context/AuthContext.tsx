import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User as FirebaseUser, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut, 
  onAuthStateChanged,
  updatePassword,
  updateEmail as fbUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { Language, Role, UserProfile } from '../types';
import { normalizeRwandanPhone, detectNetwork } from '../lib/phoneUtils';
import { seedSystemSettingsIfNeeded } from '../lib/seedSystemSettings';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  language: Language;
  setLanguage: (lang: Language) => void;
  signInWithPhone: (phone: string, pass: string) => Promise<void>;
  signUpWithPhone: (name: string, phone: string, realEmail: string, pass: string) => Promise<void>;
  signInWithAdminEmail: (email: string, pass: string) => Promise<void>;
  requestPasswordReset: (phone: string) => Promise<{ success: boolean; message: string }>;
  updateStudentProfile: (name: string, email: string, currentPass?: string, newPass?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const userDocRef = doc(db, 'users', fbUser.uid);
          const userSnap = await getDoc(userDocRef);
          
          if (userSnap.exists()) {
            const data = userSnap.data() as UserProfile;
            setUserProfile(data);
          } else {
            // Fallback if user doc doesn't exist yet
            const isTargetAdmin = fbUser.email === 'fabriceib2006@gmail.com';
            const profile: UserProfile = {
              uid: fbUser.uid,
              name: fbUser.displayName || (isTargetAdmin ? 'Fabrice Admin' : 'Learner'),
              phone: '',
              email: fbUser.email || '',
              role: isTargetAdmin ? 'admin' : 'learner',
              status: 'active',
              createdAt: new Date().toISOString()
            };
            await setDoc(userDocRef, profile);
            setUserProfile(profile);
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithPhone = async (phone: string, pass: string) => {
    const normalized = normalizeRwandanPhone(phone);
    if (!normalized || !detectNetwork(normalized)) {
      throw new Error("Please enter a valid Rwandan MTN (078/079) or Airtel (072/073) phone number.");
    }
    const internalEmail = `${normalized}@students.tsinda.app`;
    await signInWithEmailAndPassword(auth, internalEmail, pass);
  };

  const signUpWithPhone = async (name: string, phone: string, realEmail: string, pass: string) => {
    const normalized = normalizeRwandanPhone(phone);
    if (!normalized || !detectNetwork(normalized)) {
      throw new Error("Please enter a valid Rwandan MTN (078/079) or Airtel (072/073) phone number.");
    }

    // Check if phone is already unique in Firestore
    const q = query(collection(db, 'users'), where('phone', '==', normalized));
    const snap = await getDocs(q);
    if (!snap.empty) {
      throw new Error("This phone number is already registered.");
    }

    const internalEmail = `${normalized}@students.tsinda.app`;
    const cred = await createUserWithEmailAndPassword(auth, internalEmail, pass);

    const profile: UserProfile = {
      uid: cred.user.uid,
      name,
      phone: normalized,
      email: realEmail,
      role: 'learner',
      status: 'active',
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'users', cred.user.uid), profile);
    setUserProfile(profile);
  };

  const signInWithAdminEmail = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const userDocRef = doc(db, 'users', cred.user.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const data = userSnap.data() as UserProfile;
      if (data.role !== 'admin') {
        await fbSignOut(auth);
        throw new Error("Access denied. Admin credentials required.");
      }
      setUserProfile(data);
    } else {
      // Check if email is fabriceib2006@gmail.com
      if (email === 'fabriceib2006@gmail.com') {
        const profile: UserProfile = {
          uid: cred.user.uid,
          name: 'Fabrice Admin',
          phone: '',
          email,
          role: 'admin',
          status: 'active',
          createdAt: new Date().toISOString()
        };
        await setDoc(userDocRef, profile);
        setUserProfile(profile);
      } else {
        await fbSignOut(auth);
        throw new Error("Access denied. Admin credentials required.");
      }
    }
  };

  const requestPasswordReset = async (phone: string): Promise<{ success: boolean; message: string }> => {
    const resetFn = httpsCallable<{ phone: string }, { success: boolean; message: string }>(functions, 'requestPasswordReset');
    const res = await resetFn({ phone });
    return res.data;
  };

  const updateStudentProfile = async (name: string, email: string, currentPass?: string, newPass?: string) => {
    if (!auth.currentUser) throw new Error("Not signed in.");

    if (newPass && currentPass) {
      const credential = EmailAuthProvider.credential(auth.currentUser.email!, currentPass);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPass);
    }

    if (email && email !== userProfile?.email) {
      // Update real email in Firestore profile
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        name,
        email,
        updatedAt: new Date().toISOString()
      });
      setUserProfile(prev => prev ? { ...prev, name, email } : null);
    } else {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        name,
        updatedAt: new Date().toISOString()
      });
      setUserProfile(prev => prev ? { ...prev, name } : null);
    }
  };

  const signOut = async () => {
    await fbSignOut(auth);
    setUserProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      firebaseUser,
      userProfile,
      loading,
      language,
      setLanguage,
      signInWithPhone,
      signUpWithPhone,
      signInWithAdminEmail,
      requestPasswordReset,
      updateStudentProfile,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
