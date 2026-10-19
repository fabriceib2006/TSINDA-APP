import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../i18n/translations';
import { Globe, Lock, Mail, User, Phone, AlertCircle, ShieldCheck, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Language } from '../types';
import { normalizePhone, validatePhone, detectNetwork } from '../lib/phoneUtils';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../lib/firebase';

export const AuthScreen: React.FC = () => {
  const { 
    signInWithPhone, 
    signUpWithPhone, 
    signInWithGoogleAdmin, 
    requestPasswordReset 
  } = useAuth();
  const { language, setLanguage } = useLanguage();
  const dict = t[language];

  // URL / Mode detection
  const [isAdminMode, setIsAdminMode] = useState(window.location.pathname === '/admin/login' || window.location.search.includes('mode=admin'));
  const [isSignUp, setIsSignUp] = useState(window.location.pathname === '/signup' || window.location.search.includes('mode=signup'));
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetOobCode, setResetOobCode] = useState<string | null>(null);

  // Form states
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  
  // New password state for reset link
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check URL query params for reset code (oobCode) or plan
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const code = params.get('oobCode');
    if (mode === 'resetPassword' && code) {
      setResetOobCode(code);
    }
  }, []);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!phone || !phone.trim()) {
        throw new Error("Wrong phone/email or password.");
      }
      await signInWithPhone(phone, password);
    } catch (err: any) {
      console.error("Login error code:", err.code || 'unknown');
      setError("Wrong phone/email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleStudentSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    const normalized = normalizePhone(phone);
    if (!normalized || !validatePhone(normalized)) {
      setError("Invalid phone number.");
      return;
    }

    setLoading(true);
    try {
      await signUpWithPhone(name, normalized, email, password);
    } catch (err: any) {
      console.error("Signup error:", err);
      setError(err.message || "Could not create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAdminLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      await signInWithGoogleAdmin();
    } catch (err: any) {
      console.error("Admin Google login error:", err);
      const code = err.message;
      if (code === 'popup-closed-by-user') {
        setError({
          en: "Google sign-in popup was closed before completing.",
          rw: "Dirishya rya Google ryarafunzwe mbere yo kurangiza.",
          fr: "La fenêtre contextuelle de connexion Google a été fermée."
        }[language] || "Google sign-in popup was closed before completing.");
      } else if (code === 'popup-blocked') {
        setError({
          en: "Google sign-in popup was blocked by your browser.",
          rw: "Dirishya rya Google ryarinze n'urukiko rw'urubuga rwawe.",
          fr: "La fenêtre pop-up Google a été bloquée par votre navigateur."
        }[language] || "Google sign-in popup was blocked by your browser.");
      } else if (code === 'operation-not-allowed') {
        setError({
          en: "Google sign-in is not enabled in Firebase. Please enable Google provider in Firebase Authentication console.",
          rw: "Kwinjira na Google ntibifunguye muri Firebase. Nyamuneka fungura Google muri Firebase.",
          fr: "La connexion Google n'est pas activée dans la console Firebase."
        }[language] || "Google sign-in is not enabled in Firebase.");
      } else if (code === 'not-admin') {
        setError({
          en: "This account is not an administrator",
          rw: "Iyi konti si iy'umuyobozi",
          fr: "Ce compte n'est pas un administrateur"
        }[language] || "This account is not an administrator");
      } else {
        setError({
          en: err.message || "Admin Google login failed.",
          rw: err.message || "Kwinjira nka admin byanze.",
          fr: err.message || "Échec de la connexion administrateur Google."
        }[language] || err.message || "Admin Google login failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalized = normalizePhone(phone);
    if (!normalized || !validatePhone(normalized)) {
      setError("Please enter a valid Rwandan MTN (078/079) or Airtel (072/073) phone number.");
      return;
    }

    setLoading(true);

    try {
      const res = await requestPasswordReset(normalized);
      setSuccessMsg(res.message);
    } catch (err: any) {
      console.error("Password reset error:", err);
      setSuccessMsg("If this number is registered, a reset link was sent to its email");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!resetOobCode) return;

    setLoading(true);
    setError(null);
    try {
      await confirmPasswordReset(auth, resetOobCode, newPassword);
      setResetSuccessMessage("Password successfully reset! You can now sign in with your new password.");
      setResetOobCode(null);
    } catch (err: any) {
      console.error("Confirm reset error:", err);
      setError(err.message || "Failed to reset password. Link may be expired or invalid.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 sm:py-12 px-4 sm:px-6 lg:px-8 relative overflow-x-hidden">
      {/* Language Switcher */}
      <div className="absolute top-4 sm:top-6 right-4 sm:right-6 flex items-center gap-1.5 bg-white border border-slate-200 p-1 rounded-xl shadow-xs z-10">
        <Globe className="w-4 h-4 text-slate-400 ml-1.5 mr-0.5" />
        {(['en', 'rw', 'fr'] as Language[]).map((lang) => (
          <button
            key={lang}
            onClick={() => setLanguage(lang)}
            className={`min-h-[36px] px-3 py-1.5 rounded-[8px] transition-colors uppercase text-xs font-bold ${
              language === lang
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {lang}
          </button>
        ))}
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center pt-8 sm:pt-0">
        <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-blue-600 text-white text-2xl font-extrabold rounded-2xl shadow-sm mb-4">
          T
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          {dict.appName}
        </h2>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
          {dict.tagline}
        </p>
      </div>

      <div className="mt-6 sm:mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-8 shadow-sm rounded-2xl border border-slate-200 space-y-6">
          
          {/* PASSWORD RESET CONFIRMATION SCREEN */}
          {resetOobCode ? (
            <div className="space-y-5">
              <div className="text-center space-y-1">
                <h3 className="text-lg font-bold text-slate-900">Set New Password</h3>
                <p className="text-xs text-slate-500">Please enter your new password below.</p>
              </div>

              {resetSuccessMessage ? (
                <div className="space-y-4 text-center">
                  <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200 flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                    <span>{resetSuccessMessage}</span>
                  </div>
                  <button
                    onClick={() => {
                      setResetOobCode(null);
                      window.history.replaceState({}, document.title, window.location.pathname);
                    }}
                    className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm transition-colors"
                  >
                    Proceed to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleConfirmResetSubmit} className="space-y-4">
                  {error && (
                    <div className="flex items-start gap-2.5 p-3.5 bg-red-50 text-red-900 rounded-xl text-xs font-medium border border-red-200">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Confirm New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm transition-colors disabled:opacity-50"
                  >
                    {loading ? "Resetting..." : "Update Password"}
                  </button>
                </form>
              )}
            </div>
          ) : isForgotPassword ? (
            /* FORGOT PASSWORD SCREEN */
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsForgotPassword(false);
                    setSuccessMsg(null);
                    setError(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="text-base font-bold text-slate-900">Reset Password via Phone</h3>
              </div>

              {successMsg ? (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200 leading-relaxed">
                    {successMsg}
                  </div>
                  <button
                    onClick={() => {
                      setIsForgotPassword(false);
                      setSuccessMsg(null);
                    }}
                    className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm transition-colors"
                  >
                    Return to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Enter your registered Rwandan phone number. If valid, a secure password reset link will be sent to your email address on file.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0780000000"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">Example: 0788123456</span>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm transition-colors disabled:opacity-50"
                  >
                    {loading ? "Processing..." : "Send Reset Link to Email"}
                  </button>
                </form>
              )}
            </div>
          ) : isAdminMode ? (
            /* ADMIN LOGIN SCREEN */
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  <h3 className="text-base font-bold text-slate-900">
                    {{
                      en: "Admin Portal Login",
                      rw: "Kwinjira mu Buyobozi",
                      fr: "Connexion Admin"
                    }[language] || "Admin Portal Login"}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setIsAdminMode(false);
                    setError(null);
                  }}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  {{
                    en: "Student Login",
                    rw: "Kwinjira kw'Abanyeshuri",
                    fr: "Connexion Étudiant"
                  }[language] || "Student Login"}
                </button>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-3.5 bg-red-50 text-red-900 rounded-xl text-xs font-medium border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-4 pt-2">
                <button
                  type="button"
                  onClick={handleGoogleAdminLogin}
                  disabled={loading}
                  className="w-full min-h-[48px] py-3 px-4 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm border border-slate-300 shadow-xs flex items-center justify-center gap-3 transition-colors disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>
                    {loading ? "Signing in..." : ({
                      en: "Sign in with Google",
                      rw: "Injira ukoresheje Google",
                      fr: "Se connecter avec Google"
                    }[language] || "Sign in with Google")}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            /* STUDENT LOGIN / SIGNUP SCREEN */
            <div className="space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="text-sm font-bold text-slate-900">
                  {isSignUp ? "Student Registration" : "Student Sign In"}
                </div>
                <button
                  onClick={() => {
                    const nextMode = !isSignUp ? '?mode=signup' : '';
                    window.history.pushState({}, '', `/student${nextMode}`);
                    setIsSignUp(!isSignUp);
                  }}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  {isSignUp ? "Already registered? Sign In" : "Create Account"}
                </button>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-3.5 bg-red-50 text-red-900 rounded-xl text-xs font-medium border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {isSignUp ? (
                /* STUDENT SIGNUP FORM */
                <form onSubmit={handleStudentSignup} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Full Name *</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Jean Bosco"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Phone Number *</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0780000000 (MTN/Airtel)"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">Example: 0788123456</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Email Address (For Password Reset) *</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Password *</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Confirm Password *</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm transition-colors disabled:opacity-50"
                  >
                    {loading ? "Creating Account..." : "Complete Student Registration"}
                  </button>
                </form>
              ) : (
                /* STUDENT LOGIN FORM */
                <form onSubmit={handleStudentLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Phone number or email</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0788123456 or name@email.com"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">Use your phone number or your email.</span>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700 uppercase">Password</label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsForgotPassword(true);
                          setError(null);
                        }}
                        className="text-xs text-blue-600 font-semibold hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm transition-colors disabled:opacity-50"
                  >
                    {loading ? "Signing In..." : "Sign In to TSINDA"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
