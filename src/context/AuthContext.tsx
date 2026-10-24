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
  reauthenticateWithCredential,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Language, Role, UserProfile } from '../types';
import { normalizePhone, validatePhone, phoneToEmail } from '../lib/phoneUtils';
import { seedSystemSettingsIfNeeded } from '../lib/seedSystemSettings';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signInWithPhone: (identifier: string, pass: string) => Promise<void>;
  signUpWithPhone: (name: string, phone: string, realEmail: string, pass: string) => Promise<void>;
  signInWithGoogleAdmin: () => Promise<void>;
  requestPasswordReset: (phone: string) => Promise<{ success: boolean; message: string }>;
  updateStudentProfile: (name: string, email: string, currentPass?: string, newPass?: string) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export async function seedAdminAllowlistIfNeeded() {
  // Admin documents are keyed by auth UID in admins/{uid} and populated via server/console
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    seedAdminAllowlistIfNeeded();
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const userDocRef = doc(db, 'users', fbUser.uid);
          const userSnap = await getDoc(userDocRef);
          
          if (userSnap.exists()) {
            let data = userSnap.data() as UserProfile;
            if (!data.referralCode) {
              const code = Math.random().toString(36).substring(2, 8).toUpperCase();
              await updateDoc(userDocRef, { referralCode: code });
              data = { ...data, referralCode: code };
            }
            setUserProfile(data);
            if (data.role === 'admin' || fbUser.email === 'fabriceib2006@gmail.com') {
              const adminDocRef = doc(db, 'admins', fbUser.uid);
              getDoc(adminDocRef).then((adminSnap) => {
                if (!adminSnap.exists()) {
                  setDoc(adminDocRef, {
                    uid: fbUser.uid,
                    email: fbUser.email || '',
                    role: 'admin',
                    createdAt: new Date().toISOString()
                  }).catch(() => null);
                }
              }).catch(() => null);
            }
          } else {
            // Check if admin document exists in admins/{uid} or matches admin email
            const isAdminEmail = fbUser.email === 'fabriceib2006@gmail.com';
            const adminDoc = await getDoc(doc(db, 'admins', fbUser.uid)).catch(() => null);
            if (adminDoc?.exists() || isAdminEmail) {
              const profile: UserProfile = {
                uid: fbUser.uid,
                name: fbUser.displayName || 'Admin',
                phone: '',
                email: fbUser.email || '',
                role: 'admin',
                status: 'active',
                createdAt: new Date().toISOString()
              };
              await setDoc(userDocRef, profile).catch(() => null);
              await setDoc(doc(db, 'admins', fbUser.uid), {
                uid: fbUser.uid,
                email: fbUser.email || '',
                role: 'admin',
                createdAt: new Date().toISOString()
              }).catch(() => null);
              setUserProfile(profile);
            } else {
              setUserProfile(null);
            }
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

  async function resolveInternalEmail(identifier: string): Promise<string | null> {
    const trimmed = identifier.trim().toLowerCase();
    if (trimmed.includes('@')) {
      if (trimmed.endsWith('@students.tsinda.app')) {
        return trimmed;
      }
      try {
        const q = query(collection(db, 'users'), where('email', '==', trimmed));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const userData = snap.docs[0].data() as UserProfile;
          if (userData.phone) {
            return phoneToEmail(userData.phone);
          }
        }
      } catch (err) {
        console.error("Error resolving email:", err);
      }
      return null;
    } else {
      const cleaned = trimmed.replace(/[\s\-\(\)]/g, '');
      let normalized = cleaned;
      if (normalized.startsWith('+')) {
        normalized = normalized.substring(1);
      } else if (normalized.startsWith('07') && normalized.length === 10) {
        normalized = '250' + normalized.substring(1);
      } else if (normalized.startsWith('2507') && normalized.length === 12) {
        // already 2507XXXXXXXX
      } else {
        return null;
      }
      if (/^250\d{9}$/.test(normalized)) {
        return phoneToEmail(normalized);
      }
      return null;
    }
  }

  const signInWithPhone = async (identifier: string, pass: string) => {
    const internalEmail = await resolveInternalEmail(identifier);
    if (!internalEmail) {
      throw new Error("Wrong phone/email or password.");
    }

    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, internalEmail, pass);
    } catch (err: any) {
      console.error(`[signInWithPhone] Login error code: ${err.code || 'unknown'}`);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        throw new Error("Wrong phone/email or password.");
      }
      throw new Error(`Login failed: ${err.message || 'Unknown error'}`);
    }

    const userDocRef = doc(db, 'users', cred.user.uid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const data = userSnap.data() as UserProfile;
      if (data.role === 'admin') {
        await fbSignOut(auth);
        throw new Error("Wrong phone/email or password.");
      }
      setUserProfile(data);
    } else {
      await fbSignOut(auth);
      throw new Error("Wrong phone/email or password.");
    }
  };

  const signUpWithPhone = async (name: string, phone: string, realEmail: string, pass: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized || !validatePhone(normalized)) {
      throw new Error("Invalid phone number.");
    }
    if (!pass || pass.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    if (realEmail && realEmail.trim()) {
      const trimmedEmail = realEmail.trim().toLowerCase();
      if (trimmedEmail.endsWith('@students.tsinda.app')) {
        throw new Error("Real email cannot end with @students.tsinda.app");
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        throw new Error("Invalid email format.");
      }
      try {
        const q = query(collection(db, 'users'), where('email', '==', trimmedEmail));
        const snap = await getDocs(q);
        if (!snap.empty) {
          throw new Error("This email is already registered.");
        }
      } catch (err: any) {
        if (err.message && err.message.includes('already registered')) {
          throw err;
        }
      }
    }

    const internalEmail = phoneToEmail(normalized)!;

    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, internalEmail, pass);
    } catch (err: any) {
      const maskedPhone = phone ? phone.replace(/^(\d{3})\d{6}(\d{2})$/, '$1******$2') : 'null';
      console.error(`[signUpWithPhone] Auth error code: ${err.code || 'unknown'} for phone ${maskedPhone}`);
      if (err.code === 'auth/email-already-in-use') {
        throw new Error("This phone number is already registered.");
      }
      if (err.code === 'auth/operation-not-allowed') {
        throw new Error("Sign-up is not enabled. Contact support.");
      }
      throw new Error("Could not create account. Please try again.");
    }

    const profile: UserProfile = {
      uid: cred.user.uid,
      name,
      phone: normalized,
      email: realEmail ? realEmail.trim().toLowerCase() : '',
      role: 'student',
      status: 'active',
      createdAt: new Date().toISOString(),
      referralCode: Math.random().toString(36).substring(2, 8).toUpperCase()
    };

    try {
      await setDoc(doc(db, 'users', cred.user.uid), profile);
      
      // Complete referral
      const idToken = await cred.user.getIdToken();
      await fetch('/api/referral/signup-complete', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ refCode: new URLSearchParams(window.location.search).get('ref') })
      });

    } catch (err: any) {
      const maskedPhone = phone ? phone.replace(/^(\d{3})\d{6}(\d{2})$/, '$1******$2') : 'null';
      console.error(`[signUpWithPhone] Firestore write error code: ${err.code || 'unknown'} for phone ${maskedPhone}. Rolling back auth user.`);
      try {
        await cred.user.delete();
      } catch (delErr) {
        console.error("Failed to delete auth user during rollback:", delErr);
      }
      throw new Error("Could not create account. Please try again.");
    }

    setUserProfile(profile);
  };

  const signInWithGoogleAdmin = async () => {
    const provider = new GoogleAuthProvider();
    let cred;
    try {
      cred = await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(`[AdminLogin] Popup error code: ${err.code || 'unknown'}`);
      throw new Error("This email is not authorized for admin access.");
    }

    const user = cred.user;
    if (!user.email || user.email.endsWith('@students.tsinda.app')) {
      await fbSignOut(auth);
      throw new Error("This email is not authorized for admin access.");
    }

    let isAdminAllowed = false;
    try {
      const adminDocSnap = await getDoc(doc(db, 'admins', user.uid));
      if (adminDocSnap.exists()) {
        isAdminAllowed = true;
      } else {
        const userDocSnap = await getDoc(doc(db, 'users', user.uid));
        if (userDocSnap.exists() && userDocSnap.data().role === 'admin') {
          isAdminAllowed = true;
        }
      }
    } catch (err) {
      console.error("Admin allowlist check error:", err);
    }

    if (!isAdminAllowed) {
      await fbSignOut(auth);
      throw new Error("This email is not authorized for admin access.");
    }

    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);
    let profile: UserProfile;
    if (userSnap.exists()) {
      profile = userSnap.data() as UserProfile;
      if (profile.role !== 'admin') {
        await updateDoc(userDocRef, { role: 'admin' });
        profile.role = 'admin';
      }
    } else {
      profile = {
        uid: user.uid,
        name: user.displayName || 'Admin',
        phone: '',
        email: user.email,
        role: 'admin',
        status: 'active',
        createdAt: new Date().toISOString()
      };
      await setDoc(userDocRef, profile);
    }
    setUserProfile(profile);
  };

  const requestPasswordReset = async (phone: string): Promise<{ success: boolean; message: string }> => {
    const normalized = normalizePhone(phone);
    if (!normalized || !validatePhone(normalized)) {
      throw new Error("Invalid phone number.");
    }
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalized }),
    }).catch(() => null);

    if (res && res.ok) {
      return await res.json();
    }
    return {
      success: true,
      message: "If an account exists for this phone number, reset instructions have been dispatched."
    };
  };

  const updateStudentProfile = async (name: string, email: string, currentPass?: string, newPass?: string) => {
    if (!auth.currentUser) throw new Error("Not signed in.");

    if (newPass && currentPass) {
      const credential = EmailAuthProvider.credential(auth.currentUser.email!, currentPass);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPass);
    }

    if (email && email !== userProfile?.email) {
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
    const isAdmin = userProfile?.role === 'admin';
    await fbSignOut(auth);
    setUserProfile(null);
    window.history.replaceState({}, '', isAdmin ? '/admin' : '/student');
    window.location.href = isAdmin ? '/admin' : '/student';
  };

  const getIdToken = async (): Promise<string> => {
    if (firebaseUser && typeof firebaseUser.getIdToken === 'function') {
      return await firebaseUser.getIdToken();
    }
    if (auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
      return await auth.currentUser.getIdToken();
    }
    return '';
  };

  return (
    <AuthContext.Provider value={{
      firebaseUser,
      userProfile,
      loading,
      signInWithPhone,
      signUpWithPhone,
      signInWithGoogleAdmin,
      requestPasswordReset,
      updateStudentProfile,
      signOut,
      getIdToken
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
