'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';

export default function AuthPanel() {
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    if (!email.trim() || !password.trim()) {
      setError('Please provide both an email and password.');
      setIsSubmitting(false);
      return;
    }

    try {
      if (mode === 'sign_up') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
        });

        if (error) {
          setError(error.message);
        } else {
          setMessage('Check your inbox to confirm your account.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        if (error) {
          setError(error.message);
        }
      }
    } catch (err) {
      setError('Unexpected error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setMessage(null);
    setIsOAuthLoading(true);

    const configuredRedirect =
      typeof window === 'undefined'
        ? process.env.NEXT_PUBLIC_SITE_URL?.trim()
        : process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? window.location.origin;

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: configuredRedirect ? { redirectTo: configuredRedirect } : undefined,
      });

      if (oauthError) {
        const message = oauthError.message ?? 'Google rejected the sign-in request.';
        const normalized = message.toLowerCase();
        if (normalized.includes('redirect_uri_mismatch')) {
          setError(
            'Google rejected the redirect URI. Confirm that the Supabase callback and every domain in '
              + '`NEXT_PUBLIC_SITE_URL` are listed under Authorized redirect URIs in your Google credential.'
          );
        } else if (normalized.includes('app_not_configured_for_user') || normalized.includes('access_denied')) {
          setError(
            'This Google app is still in Testing mode. Add your account under Test users or publish the consent screen before '
              + 'sharing the sign-in link.'
          );
        } else {
          setError(message);
        }
        setIsOAuthLoading(false);
      }
      // Supabase will redirect on success so we don't need to clear the loading state.
    } catch (_err) {
      setError('Unexpected error. Please try again.');
      setIsOAuthLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError('Please enter your email to reset your password.');
      setMessage(null);
      return;
    }

    setIsResetting(true);
    setError(null);
    setMessage(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail);

      if (resetError) {
        setError(resetError.message);
      } else {
        setMessage('If an account exists for this email, a reset link has been sent.');
      }
    } catch (_err) {
      setError('Unexpected error. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md bg-surface/90 backdrop-blur-xl border border-zen-200 shadow-soft rounded-3xl p-8"
    >
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-semibold text-zen-900">
          {mode === 'sign_in' ? 'Welcome Back' : 'Create your account'}
        </h2>
        <p className="text-sm text-zen-600 mt-1">
          {mode === 'sign_in'
            ? 'Sign in to manage your mindful tasks.'
            : 'Sign up to start your mindful task journey.'}
        </p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border-2 border-zen-200 hover:border-sage-500 text-zen-800 font-medium transition-colors disabled:opacity-60"
          disabled={isSubmitting || isResetting || isOAuthLoading}
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              d="M12 10.8v3.84h5.33c-.23 1.26-.93 2.33-1.97 3.05l3.18 2.47c1.85-1.71 2.92-4.23 2.92-7.2 0-.69-.06-1.35-.18-1.99H12Z"
              fill="#4285F4"
            />
            <path
              d="M6.54 14.32l-.86.65-2.54 1.98A9.96 9.96 0 0 0 12 21c2.7 0 4.96-.89 6.61-2.39l-3.18-2.47c-.87.6-1.98.97-3.43.97-2.64 0-4.88-1.78-5.68-4.16Z"
              fill="#34A853"
            />
            <path
              d="M3.14 7.98A9.96 9.96 0 0 0 2 12c0 1.52.36 2.95.99 4.21l3.55-2.74a5.88 5.88 0 0 1-.31-1.87c0-.65.11-1.27.3-1.86Z"
              fill="#FBBC05"
            />
            <path
              d="M12 6.34c1.47 0 2.78.51 3.81 1.51l2.85-2.85C16.95 2.98 14.7 2 12 2 7.64 2 3.89 4.5 3.14 7.98l3.59 2.74C7.54 8.12 9.76 6.34 12 6.34Z"
              fill="#EA4335"
            />
            <path d="M2 2h20v20H2Z" fill="none" />
          </svg>
          {isOAuthLoading ? 'Signing in...' : 'Continue with Google'}
        </button>
        <p className="text-xs text-zen-500 text-center leading-relaxed">
          While Google keeps the consent screen in Testing mode, project owners/editors and anyone who previously granted
          consent can still sign in even if they are not listed under Test users. Revoke their access from Google Account
          settings or move the consent screen to Production when you need to open the app to a wider audience.
        </p>
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-zen-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-surface/90 text-zen-500">or continue with email</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zen-700 mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full px-4 py-3 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none transition-colors"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zen-700 mb-2">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full px-4 py-3 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none transition-colors"
            placeholder="••••••••"
            required
          />
          {mode === 'sign_in' && (
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={handlePasswordReset}
                className="text-sm font-medium text-sage-600 hover:text-sage-700 disabled:opacity-60"
                disabled={isSubmitting || isResetting || isOAuthLoading}
              >
                {isResetting ? 'Sending reset link...' : 'Forgot password?'}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {message && (
          <div className="px-4 py-3 rounded-xl bg-sage-50 text-sage-700 text-sm">
            {message}
          </div>
        )}

        <button
          type="submit"
          className="w-full py-3 rounded-xl bg-sage-600 hover:bg-sage-700 text-white font-medium transition-colors disabled:opacity-60"
          disabled={isSubmitting || isResetting || isOAuthLoading}
        >
          {isSubmitting
            ? 'Please wait...'
            : mode === 'sign_in'
              ? 'Sign In'
              : 'Sign Up'}
        </button>
      </form>

      <div className="mt-6 text-sm text-zen-600 text-center">
        {mode === 'sign_in' ? (
          <button
            onClick={() => {
              setMode('sign_up');
              setError(null);
              setMessage(null);
            }}
            className="font-medium text-sage-600 hover:text-sage-700"
            type="button"
          >
            Need an account? Create one
          </button>
        ) : (
          <button
            onClick={() => {
              setMode('sign_in');
              setError(null);
              setMessage(null);
            }}
            className="font-medium text-sage-600 hover:text-sage-700"
            type="button"
          >
            Already have an account? Sign in
          </button>
        )}
      </div>
    </motion.div>
  );
}
