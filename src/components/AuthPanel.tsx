'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';

export default function AuthPanel() {
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md bg-white/90 backdrop-blur-xl border border-zen-200 shadow-soft rounded-3xl p-8"
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
          disabled={isSubmitting}
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
