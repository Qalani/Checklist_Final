'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, RefreshCcw, UserMinus, UserPlus, UserX } from 'lucide-react';
import ParallaxBackground from '@/components/ParallaxBackground';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useFriends } from '@/features/friends/useFriends';

interface FeedbackState {
  type: 'success' | 'error';
  text: string;
}

function LoadingScreen() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-sage-600" />
      </div>
    </div>
  );
}

export default function FriendsPage() {
  const router = useRouter();
  const { user, authChecked, signOut } = useAuthSession();
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    status,
    syncing,
    error,
    addFriend,
    removeFriend,
    acceptRequest,
    declineRequest,
    refresh,
  } = useFriends(user?.id ?? null);
  const [emailInput, setEmailInput] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    if (!user) {
      router.replace('/');
    }
  }, [authChecked, router, user]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  if (!authChecked || !user) {
    return <LoadingScreen />;
  }

  const isLoading = status === 'loading';

  const handleAddFriend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = emailInput.trim();
    if (!trimmed) {
      setFeedback({ type: 'error', text: 'Enter an email address to continue.' });
      return;
    }

    setSubmitting(true);
    const result = await addFriend(trimmed);
    setSubmitting(false);

    if ('error' in result) {
      setFeedback({ type: 'error', text: result.error });
      return;
    }

    setEmailInput('');
    setFeedback({ type: 'success', text: `Friend request sent to ${result.request.target_email}.` });
  };

  const handleRemoveFriend = async (friendUserId: string) => {
    setRemovingId(friendUserId);
    const result = await removeFriend(friendUserId);
    setRemovingId(null);

    if (result && 'error' in result) {
      setFeedback({ type: 'error', text: result.error });
      return;
    }

    setFeedback({ type: 'success', text: 'Friend removed.' });
  };

  const handleRefresh = async () => {
    await refresh(true);
    setFeedback({ type: 'success', text: 'Friends updated.' });
  };

  const handleAcceptRequest = async (requestId: string) => {
    setAcceptingId(requestId);
    const result = await acceptRequest(requestId);
    setAcceptingId(null);

    if (result && 'error' in result) {
      setFeedback({ type: 'error', text: result.error });
      return;
    }

    setFeedback({ type: 'success', text: 'Friend request accepted.' });
  };

  const handleDeclineRequest = async (requestId: string) => {
    setDecliningId(requestId);
    const result = await declineRequest(requestId);
    setDecliningId(null);

    if (result && 'error' in result) {
      setFeedback({ type: 'error', text: result.error });
      return;
    }

    setFeedback({ type: 'success', text: 'Friend request declined.' });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-50 border-b border-zen-200 bg-surface/80 backdrop-blur-xl shadow-soft">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="inline-flex items-center gap-2 rounded-xl border border-zen-200 bg-white px-3 py-2 text-sm font-medium text-zen-700 shadow-soft transition hover:bg-zen-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </button>
              <h1 className="text-xl font-semibold text-zen-900">Friends</h1>
            </div>
            <div className="flex items-center gap-3">
              <ThemeSwitcher />
              <button
                type="button"
                onClick={() => {
                  void signOut();
                }}
                className="rounded-xl bg-zen-900 px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-zen-800"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-wide text-zen-500">Stay connected</p>
              <h2 className="text-3xl font-semibold text-zen-900">Invite trusted collaborators in a single step.</h2>
              <p className="max-w-2xl text-sm text-zen-600">
                Add friends by email to share your progress and stay in sync. Everyone you add will instantly appear here and in other collaborative views.
              </p>
            </div>

            {feedback ? (
              <div
                className={`rounded-xl border px-4 py-3 text-sm shadow-soft ${
                  feedback.type === 'success'
                    ? 'border-sage-200 bg-sage-50 text-sage-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {feedback.text}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-soft">
                {error}
              </div>
            ) : null}

            <form
              onSubmit={handleAddFriend}
              className="flex flex-col gap-4 rounded-2xl border border-zen-200 bg-white p-6 shadow-soft sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <label htmlFor="friend-email" className="text-sm font-medium text-zen-700">
                  Friend email
                </label>
                <input
                  id="friend-email"
                  type="email"
                  value={emailInput}
                  onChange={event => setEmailInput(event.target.value)}
                  placeholder="friend@example.com"
                  className="mt-2 w-full rounded-xl border border-zen-200 bg-white px-4 py-3 text-sm text-zen-900 shadow-inner focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="flex gap-3 sm:flex-col">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sage-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-sage-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {submitting ? 'Adding…' : 'Add friend'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleRefresh();
                  }}
                  disabled={syncing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-zen-200 px-4 py-3 text-sm font-semibold text-zen-700 shadow-soft transition hover:bg-zen-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Refresh
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-zen-200 bg-white p-6 shadow-soft">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-zen-900">Your friends</h3>
                  <p className="text-sm text-zen-600">
                    {isLoading ? 'Loading friends…' : friends.length === 1 ? '1 friend connected.' : `${friends.length} friends connected.`}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {isLoading ? (
                  <div className="flex items-center gap-3 rounded-xl border border-zen-100 bg-zen-50 px-4 py-3 text-sm text-zen-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Syncing your friends…
                  </div>
                ) : friends.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zen-200 bg-zen-50 px-4 py-6 text-center text-sm text-zen-600">
                    You have not added anyone yet. Invite a friend with their email address to get started.
                  </div>
                ) : (
                  friends.map(friend => (
                    <div
                      key={friend.id}
                      className="flex flex-col gap-3 rounded-xl border border-zen-100 bg-white px-4 py-4 shadow-inner sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-zen-900">
                          {friend.friend_name?.trim() ? friend.friend_name : friend.friend_email}
                        </p>
                        <p className="text-xs text-zen-500">{friend.friend_email}</p>
                        {friend.created_at ? (
                          <p className="text-xs text-zen-400">Connected {new Date(friend.created_at).toLocaleString()}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void handleRemoveFriend(friend.friend_id);
                        }}
                        disabled={removingId === friend.friend_id}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 shadow-soft transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {removingId === friend.friend_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-zen-200 bg-white p-6 shadow-soft">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-zen-900">Incoming requests</h3>
                    <p className="text-sm text-zen-600">
                      {incomingRequests.length === 1
                        ? '1 person is waiting for your response.'
                        : `${incomingRequests.length} people are waiting for your response.`}
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {incomingRequests.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zen-200 bg-zen-50 px-4 py-6 text-center text-sm text-zen-600">
                      No pending requests right now.
                    </div>
                  ) : (
                    incomingRequests.map(request => (
                      <div
                        key={request.id}
                        className="flex flex-col gap-3 rounded-xl border border-zen-100 bg-white px-4 py-4 shadow-inner sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-sm font-semibold text-zen-900">
                            {request.requester_name?.trim() ? request.requester_name : request.requester_email}
                          </p>
                          <p className="text-xs text-zen-500">{request.requester_email}</p>
                          {request.created_at ? (
                            <p className="text-xs text-zen-400">Requested {new Date(request.created_at).toLocaleString()}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => {
                              void handleAcceptRequest(request.id);
                            }}
                            disabled={acceptingId === request.id || decliningId === request.id}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sage-600 px-3 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-sage-500 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {acceptingId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleDeclineRequest(request.id);
                            }}
                            disabled={acceptingId === request.id || decliningId === request.id}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zen-200 px-3 py-2 text-sm font-medium text-zen-700 shadow-soft transition hover:bg-zen-50 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {decliningId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                            Decline
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-zen-200 bg-white p-6 shadow-soft">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-zen-900">Sent requests</h3>
                    <p className="text-sm text-zen-600">
                      {outgoingRequests.length === 1
                        ? '1 pending invite.'
                        : `${outgoingRequests.length} pending invites.`}
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {outgoingRequests.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zen-200 bg-zen-50 px-4 py-6 text-center text-sm text-zen-600">
                      You have not sent any requests yet.
                    </div>
                  ) : (
                    outgoingRequests.map(request => (
                      <div
                        key={request.id}
                        className="flex flex-col gap-3 rounded-xl border border-zen-100 bg-white px-4 py-4 shadow-inner"
                      >
                        <div>
                          <p className="text-sm font-semibold text-zen-900">
                            {request.target_name?.trim() ? request.target_name : request.target_email}
                          </p>
                          <p className="text-xs text-zen-500">{request.target_email}</p>
                          {request.created_at ? (
                            <p className="text-xs text-zen-400">Sent {new Date(request.created_at).toLocaleString()}</p>
                          ) : null}
                        </div>
                        <p className="text-xs text-zen-500">Waiting for approval</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
