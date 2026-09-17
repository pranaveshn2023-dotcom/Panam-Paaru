import React, { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { BrandLogo } from '../layout/BrandLogo';
import { NeoButton } from '../ui/NeoButton';
import { NeoInput } from '../ui/NeoInput';
import { Shield, Sparkles, Lock, CheckCircle2, Zap } from 'lucide-react';

interface AuthScreenProps {}

export const AuthScreen: React.FC<AuthScreenProps> = () => {
  const { signIn } = useAuthActions();

  const [authMode, setAuthMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      await signIn('google');
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      setError(err?.message || 'Google Sign-In failed. Please check your connection.');
      setLoading(false);
    }
  };

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      await signIn('password', {
        email,
        password,
        name: authMode === 'signUp' ? name : undefined,
        flow: authMode,
      });
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFDF5] flex flex-col justify-between p-4 sm:p-8 relative overflow-hidden">
      {/* Neo-Brutalist Grid Background */}
      <div className="absolute inset-0 neo-pattern-dots opacity-40 pointer-events-none" />

      {/* Top Banner / Ticker */}
      <div className="w-full bg-[#121212] text-white py-2 px-4 border-2 border-[#121212] shadow-neo-sm overflow-hidden flex items-center justify-between z-10">
        <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-widest text-[#FFE600] uppercase">
          <Zap size={14} className="fill-[#FFE600]" />
          <span>PanamPaaru · SEE YOUR MONEY · CONTROL YOUR SPENDING</span>
        </div>
        <span className="hidden sm:inline-block text-[11px] font-mono text-neutral-400 uppercase">
          PRIVATE & ENCRYPTED
        </span>
      </div>

      {/* Center Auth Container */}
      <div className="my-auto py-8 flex flex-col lg:flex-row items-center justify-center gap-10 max-w-6xl mx-auto w-full z-10">
        
        {/* Left Hero Pitch */}
        <div className="flex flex-col gap-6 max-w-lg">
          <BrandLogo size="lg" />

          <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-[#121212] leading-[1.1]">
            SEE YOUR <span className="bg-[#FFE600] px-2 border-2 border-[#121212] shadow-neo-sm">MONEY.</span><br />
            CONTROL YOUR <span className="bg-[#05DF72] px-2 border-2 border-[#121212] shadow-neo-sm">SPENDING.</span>
          </h1>

          <p className="text-sm sm:text-base font-semibold text-neutral-800 leading-relaxed">
            High-speed personal finance engine built for clarity, 6-digit PIN security lock, and deterministic calendar-aware recurring budgets.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-3 bg-white border-2 border-[#121212] shadow-neo-sm flex items-start gap-2.5">
              <CheckCircle2 size={18} className="text-[#05DF72] shrink-0 mt-0.5" strokeWidth={3} />
              <div className="text-xs font-bold">
                <span className="text-[#121212] font-black uppercase block">Private & Isolated</span>
                Your data is strictly scoped and encrypted for your eyes only.
              </div>
            </div>

            <div className="p-3 bg-white border-2 border-[#121212] shadow-neo-sm flex items-start gap-2.5">
              <Lock size={18} className="text-[#FF4D8D] shrink-0 mt-0.5" strokeWidth={3} />
              <div className="text-xs font-bold">
                <span className="text-[#121212] font-black uppercase block">6-PIN Lock</span>
                Tactile security lock for mobile & desktop.
              </div>
            </div>
          </div>
        </div>

        {/* Right Auth Card */}
        <div className="w-full max-w-md bg-white border-[3px] border-[#121212] shadow-neo-xl p-6 sm:p-8 flex flex-col">
          
          <div className="flex items-center justify-between border-b-2 border-[#121212] pb-3 mb-5">
            <span className="text-xs font-black uppercase tracking-widest text-[#121212] flex items-center gap-1.5">
              <Shield size={16} className="text-[#05DF72]" />
              Secure Account Access
            </span>
            <span className="text-[10px] font-mono font-bold bg-[#FFE600] px-2 py-0.5 border border-[#121212]">
              ENCRYPTED
            </span>
          </div>

          {/* Primary: 1-Click Google Sign In */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3.5 px-4 bg-white hover:bg-[#FFFDF5] text-[#121212] font-black text-sm uppercase tracking-wider border-[3px] border-[#121212] shadow-neo flex items-center justify-center gap-3 transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo-lg active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer mb-5"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign in with Google
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-2">
            <div className="border-t-2 border-neutral-300 w-full" />
            <span className="bg-white px-3 text-[11px] font-black uppercase text-neutral-500 tracking-wider absolute">
              OR EMAIL
            </span>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handlePasswordAuth} className="flex flex-col gap-3 mt-3">
            {authMode === 'signUp' && (
              <NeoInput
                label="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name"
                required
              />
            )}

            <NeoInput
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />

            <NeoInput
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            {error && (
              <div className="bg-[#FF4343] text-white text-xs font-bold p-2.5 border-2 border-[#121212] shadow-neo-sm">
                {error}
              </div>
            )}

            <NeoButton
              type="submit"
              variant="primary"
              size="md"
              isFullWidth
              disabled={loading}
              className="mt-2"
            >
              {loading
                ? 'Authenticating...'
                : authMode === 'signIn'
                ? 'Sign In to Paanam'
                : 'Create Account'}
            </NeoButton>
          </form>

          {/* Toggle Sign In / Sign Up */}
          <div className="flex items-center justify-between text-xs font-bold mt-4 pt-3 border-t border-neutral-200">
            <span className="text-neutral-600">
              {authMode === 'signIn' ? "Don't have an account?" : 'Already registered?'}
            </span>
            <button
              onClick={() => {
                setAuthMode(authMode === 'signIn' ? 'signUp' : 'signIn');
                setError('');
              }}
              className="font-black text-[#121212] hover:text-[#0066FF] underline cursor-pointer"
            >
              {authMode === 'signIn' ? 'Sign Up' : 'Sign In'}
            </button>
          </div>

        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs font-bold text-neutral-500 py-2 z-10">
        PAANAM PARU © {new Date().getFullYear()} · Engineered for speed, clarity, and control
      </div>
    </div>
  );
};
