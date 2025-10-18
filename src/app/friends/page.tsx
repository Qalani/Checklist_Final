'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Copy,
  RefreshCcw,
  Share2,
  ShieldBan,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import ParallaxBackground from '@/components/ParallaxBackground';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useFriends } from '@/features/friends/useFriends';
import { useChecklist } from '@/features/checklist/useChecklist';
import { useLists } from '@/features/lists/useLists';

interface FeedbackState {
  type: 'success' | 'error';
  text: string;
}

function LoadingScreen() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-sage-200 border-t-sage-600" />
      </div>
    </div>
  );
}

export default function FriendsPage() {
  const router = useRouter();
  const { user, authChecked, signOut } = useAuthSession();
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [collabFriendId, setCollabFriendId] = useState('');
  const [collabType, setCollabType] = useState<'task' | 'list'>('task');
  const [collabResourceId, setCollabResourceId] = useState('');
  const [collabRole, setCollabRole] = useState<'editor' | 'viewer'>('editor');
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [sendingFriendCode, setSendingFriendCode] = useState(false);

  const {
    status,
    syncing,
    friends,
    incomingInvites,
    outgoingInvites,
    blocked,
    error,
    friendCode,
    refresh,
    sendRequestByCode,
    respondToRequest,
    cancelRequest,
    removeFriend,
    blockUser,
    unblockUser,
    inviteFriend,
  } = useFriends(user?.id ?? null);

  const { tasks } = useChecklist(user?.id ?? null);
  const { lists } = useLists(user?.id ?? null);

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

    const timeout = window.setTimeout(() => {
      setFeedback(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    if (friends.length === 0) {
      setCollabFriendId('');
      return;
    }

    if (!collabFriendId) {
      setCollabFriendId(friends[0]?.friend_id ?? '');
    }
  }, [collabFriendId, friends]);

  const ownedTasks = useMemo(() => {
    return tasks.filter((task) => task.user_id === user?.id);
  }, [tasks, user?.id]);

  const ownedLists = useMemo(() => {
    return lists.filter((list) => (list.owner_id && user?.id ? list.owner_id === user.id : list.access_role === 'owner'));
  }, [lists, user?.id]);

  useEffect(() => {
    if (collabType === 'task') {
      if (!ownedTasks.some((task) => task.id === collabResourceId)) {
        setCollabResourceId(ownedTasks[0]?.id ?? '');
      }
    } else if (collabType === 'list') {
      if (!ownedLists.some((list) => list.id === collabResourceId)) {
        setCollabResourceId(ownedLists[0]?.id ?? '');
      }
    }
  }, [collabResourceId, collabType, ownedLists, ownedTasks]);

  if (!authChecked || !user) {
    return <LoadingScreen />;
  }

  const handleActionResult = (result: void | { error: string } | undefined, successMessage: string) => {
    if (result && typeof result === 'object' && 'error' in result) {
      setFeedback({ type: 'error', text: result.error });
      return;
    }

    setFeedback({ type: 'success', text: successMessage });
  };

  const handleCopyFriendCode = async (): Promise<boolean> => {
    if (!friendCode) {
      setFeedback({ type: 'error', text: 'Your friend code is still being generated. Try again in a moment.' });
      return false;
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      setFeedback({ type: 'error', text: 'Copying is not supported in this browser. You can copy the code manually.' });
      return false;
    }

    try {
      await navigator.clipboard.writeText(friendCode);
      setFeedback({ type: 'success', text: 'Friend code copied to clipboard.' });
      return true;
    } catch (error) {
      console.error('Failed to copy friend code', error);
      setFeedback({ type: 'error', text: 'Unable to copy the friend code. Please copy it manually.' });
      return false;
    }
  };

  const handleShareFriendCode = async () => {
    if (!friendCode) {
      setFeedback({ type: 'error', text: 'Your friend code is still being generated. Try again shortly.' });
      return;
    }

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      const shareNavigator = navigator as Navigator & { share: (data: ShareData) => Promise<void> };
      try {
        await shareNavigator.share({
          title: 'Zen Tasks friend code',
          text: `Here is my Zen Tasks friend code: ${friendCode}`,
        });
        setFeedback({ type: 'success', text: 'Share dialog opened—choose an app to send your friend code.' });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        console.error('Failed to share friend code', error);
      }
    }

    const copied = await handleCopyFriendCode();
    if (!copied && typeof navigator === 'undefined') {
      setFeedback({ type: 'error', text: 'Sharing is not available in this environment.' });
    }
  };

  const handleSendRequestByCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!friendCodeInput.trim()) {
      setFeedback({ type: 'error', text: 'Enter a friend code to continue.' });
      return;
    }

    setSendingFriendCode(true);
    const result = await sendRequestByCode(friendCodeInput);
    setSendingFriendCode(false);

    const hasError = Boolean(result && typeof result === 'object' && 'error' in result);
    handleActionResult(result, 'Friend request sent.');

    if (!hasError) {
      setFriendCodeInput('');
    }
  };

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!collabFriendId || !collabResourceId) {
      setFeedback({ type: 'error', text: 'Choose a friend and something to share.' });
      return;
    }

    const result = await inviteFriend(collabFriendId, collabType, collabResourceId, collabRole);
    handleActionResult(result, collabType === 'task' ? 'Task shared with your friend.' : 'List shared with your friend.');
  };

  const isFriendCodeReady = Boolean(friendCode);
  const isFriendCodeLoading = !isFriendCodeReady && (status === 'loading' || status === 'idle' || syncing);
  const displayFriendCode = isFriendCodeReady ? friendCode : isFriendCodeLoading ? 'Generating…' : 'Unavailable';

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-50 border-b border-zen-200 bg-surface/70 backdrop-blur-xl shadow-soft">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:py-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 text-white shadow-medium"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-semibold text-zen-900">Friends</h1>
                <p className="text-sm text-zen-600">Connect and collaborate with the people you trust.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  void refresh(true);
                }}
                className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zen-700 shadow-soft transition-colors hover:bg-zen-50"
              >
                <RefreshCcw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <ThemeSwitcher />
              <button
                type="button"
                onClick={() => {
                  void signOut();
                }}
                className="rounded-lg bg-zen-900 px-4 py-2 text-sm font-medium text-white shadow-soft transition-colors hover:bg-zen-800"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
          {feedback && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm font-medium shadow-soft ${
                feedback.type === 'success'
                  ? 'border-sage-300 bg-sage-50 text-sage-800'
                  : 'border-rose-300 bg-rose-50 text-rose-800'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {error && status === 'error' && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-soft">
              {error}
            </div>
          )}

          <section className="rounded-3xl border border-zen-200 bg-white/80 p-6 shadow-soft">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-zen-900">
                  <Share2 className="h-5 w-5 text-sage-600" />
                  Share your friend code
                </h2>
                <p className="text-sm text-zen-600">
                  Give this code to someone you trust so they can send you a friend request instantly.
                </p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-zen-200 bg-white px-4 py-3 shadow-inner">
                  <span
                    className={`text-sm font-semibold text-zen-900 ${isFriendCodeReady ? 'tracking-[0.35em]' : ''}`}
                  >
                    {displayFriendCode}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyFriendCode();
                    }}
                    className={`flex items-center gap-2 rounded-xl border border-zen-200 bg-white px-3 py-2 text-xs font-semibold text-zen-700 shadow-soft transition-colors ${
                      isFriendCodeReady ? 'hover:bg-zen-50' : 'opacity-60'
                    }`}
                  >
                    <Copy className="h-4 w-4" /> Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleShareFriendCode();
                    }}
                    className={`flex items-center gap-2 rounded-xl bg-zen-900 px-3 py-2 text-xs font-semibold text-white shadow-soft transition-colors ${
                      isFriendCodeReady ? 'hover:bg-zen-800' : 'opacity-60'
                    }`}
                  >
                    <Share2 className="h-4 w-4" /> Share
                  </button>
                </div>
              </div>
            </div>

            <form className="mt-6 space-y-3" onSubmit={handleSendRequestByCode}>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-zen-700" htmlFor="friend-code-input">
                  Add a friend by code
                </label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    id="friend-code-input"
                    type="text"
                    value={friendCodeInput}
                    onChange={(event) => setFriendCodeInput(event.target.value.toUpperCase())}
                    placeholder="Enter a friend's code"
                    autoComplete="off"
                    maxLength={16}
                    className="w-full rounded-xl border border-zen-200 bg-white px-4 py-2 text-sm uppercase tracking-[0.3em] text-zen-900 shadow-inner focus:border-sage-500 focus:outline-none focus:ring-2 focus:ring-sage-300 sm:max-w-xs"
                  />
                  <button
                    type="submit"
                    className="flex items-center justify-center gap-2 rounded-xl bg-zen-900 px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-zen-800 disabled:cursor-not-allowed disabled:bg-zen-500"
                    disabled={sendingFriendCode}
                  >
                    {sendingFriendCode ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    Send request
                  </button>
                </div>
                <p className="text-xs text-zen-500">
                  Friend codes are eight characters long. Letters are not case sensitive.
                </p>
              </div>
            </form>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="flex flex-col gap-4 rounded-3xl border border-zen-200 bg-white/80 p-6 shadow-soft">
              <div className="flex items-center gap-2 text-lg font-semibold text-zen-900">
                <Users className="h-5 w-5 text-sage-600" />
                Your friends
              </div>
              {friends.length === 0 ? (
                <p className="text-sm text-zen-600">You have not added anyone yet. Send a friend request to get started.</p>
              ) : (
                <div className="space-y-3">
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-zen-200 bg-white px-4 py-3 shadow-soft sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="text-sm font-semibold text-zen-900">{friend.friend_name ?? friend.friend_email}</p>
                        <p className="text-xs text-zen-500">{friend.friend_email}</p>
                        {friend.created_at && (
                          <p className="text-xs text-zen-400">
                            Friends since {new Date(friend.created_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await removeFriend(friend.friend_id);
                            handleActionResult(result, 'Friend removed.');
                          }}
                          className="flex items-center gap-1 rounded-full bg-zen-100 px-3 py-1 text-xs font-medium text-zen-600 transition-colors hover:bg-zen-200"
                        >
                          <UserMinus className="h-3 w-3" /> Remove
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await blockUser(friend.friend_id);
                            handleActionResult(result, 'User blocked.');
                          }}
                          className="flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-200"
                        >
                          <ShieldBan className="h-3 w-3" /> Block
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-4 rounded-3xl border border-zen-200 bg-white/80 p-6 shadow-soft">
              <div className="flex items-center gap-2 text-lg font-semibold text-zen-900">
                <UserPlus className="h-5 w-5 text-sage-600" />
                Collaboration invites
              </div>
              {friends.length === 0 ? (
                <p className="text-sm text-zen-600">Add a friend to share tasks or lists with them.</p>
              ) : (
                <form className="space-y-4" onSubmit={handleInvite}>
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-zen-500">Friend</label>
                    <select
                      value={collabFriendId}
                      onChange={(event) => setCollabFriendId(event.target.value)}
                      className="w-full rounded-xl border border-zen-200 bg-white px-3 py-2 text-sm text-zen-900 shadow-inner focus:border-sage-500 focus:outline-none focus:ring-2 focus:ring-sage-300"
                    >
                      {friends.map((friend) => (
                        <option key={friend.friend_id} value={friend.friend_id}>
                          {friend.friend_name ?? friend.friend_email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-zen-500">Share</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCollabType('task')}
                        className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                          collabType === 'task'
                            ? 'border-sage-500 bg-sage-50 text-sage-700'
                            : 'border-zen-200 bg-white text-zen-600 hover:bg-zen-50'
                        }`}
                      >
                        Task
                      </button>
                      <button
                        type="button"
                        onClick={() => setCollabType('list')}
                        className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                          collabType === 'list'
                            ? 'border-sage-500 bg-sage-50 text-sage-700'
                            : 'border-zen-200 bg-white text-zen-600 hover:bg-zen-50'
                        }`}
                      >
                        List
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-zen-500">
                      {collabType === 'task' ? 'Task' : 'List'}
                    </label>
                    {collabType === 'task' ? (
                      <select
                        value={collabResourceId}
                        onChange={(event) => setCollabResourceId(event.target.value)}
                        className="w-full rounded-xl border border-zen-200 bg-white px-3 py-2 text-sm text-zen-900 shadow-inner focus:border-sage-500 focus:outline-none focus:ring-2 focus:ring-sage-300"
                      >
                        {ownedTasks.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.title}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={collabResourceId}
                        onChange={(event) => setCollabResourceId(event.target.value)}
                        className="w-full rounded-xl border border-zen-200 bg-white px-3 py-2 text-sm text-zen-900 shadow-inner focus:border-sage-500 focus:outline-none focus:ring-2 focus:ring-sage-300"
                      >
                        {ownedLists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {collabType === 'task' && ownedTasks.length === 0 && (
                      <p className="text-xs text-zen-500">Create a task first to invite a collaborator.</p>
                    )}
                    {collabType === 'list' && ownedLists.length === 0 && (
                      <p className="text-xs text-zen-500">You need to own a list to invite friends.</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-zen-500">Role</label>
                    <select
                      value={collabRole}
                      onChange={(event) => setCollabRole(event.target.value as 'editor' | 'viewer')}
                      className="w-full rounded-xl border border-zen-200 bg-white px-3 py-2 text-sm text-zen-900 shadow-inner focus:border-sage-500 focus:outline-none focus:ring-2 focus:ring-sage-300"
                    >
                      <option value="editor">Editor – can update shared items</option>
                      <option value="viewer">Viewer – read only</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-sage-600 px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-sage-700"
                    disabled={(collabType === 'task' && ownedTasks.length === 0) || (collabType === 'list' && ownedLists.length === 0)}
                  >
                    Share with friend
                  </button>
                </form>
              )}
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="flex flex-col gap-4 rounded-3xl border border-zen-200 bg-white/80 p-6 shadow-soft">
              <div className="flex items-center gap-2 text-lg font-semibold text-zen-900">
                <MailIcon />
                Incoming requests
              </div>
              {incomingInvites.length === 0 ? (
                <p className="text-sm text-zen-600">No pending invitations right now.</p>
              ) : (
                <div className="space-y-3">
                  {incomingInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-zen-200 bg-white px-4 py-3 shadow-soft sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="text-sm font-semibold text-zen-900">{invite.sender_email}</p>
                        <p className="text-xs text-zen-500">
                          Sent {new Date(invite.created_at ?? Date.now()).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await respondToRequest(invite.id, 'accepted');
                            handleActionResult(result, 'Friend request accepted.');
                          }}
                          className="flex items-center gap-1 rounded-full bg-sage-600 px-3 py-1 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-sage-700"
                        >
                          <Check className="h-3 w-3" /> Accept
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await respondToRequest(invite.id, 'declined');
                            handleActionResult(result, 'Friend request declined.');
                          }}
                          className="flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-200"
                        >
                          <X className="h-3 w-3" /> Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-4 rounded-3xl border border-zen-200 bg-white/80 p-6 shadow-soft">
              <div className="flex items-center gap-2 text-lg font-semibold text-zen-900">
                <MailIcon />
                Sent requests
              </div>
              {outgoingInvites.length === 0 ? (
                <p className="text-sm text-zen-600">You haven’t sent any friend requests yet.</p>
              ) : (
                <div className="space-y-3">
                  {outgoingInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-zen-200 bg-white px-4 py-3 shadow-soft sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="text-sm font-semibold text-zen-900">{invite.receiver_email}</p>
                        <p className="text-xs text-zen-500">
                          Sent {new Date(invite.created_at ?? Date.now()).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await cancelRequest(invite.id);
                          handleActionResult(result, 'Friend request cancelled.');
                        }}
                        className="flex items-center gap-1 rounded-full bg-zen-100 px-3 py-1 text-xs font-semibold text-zen-600 transition-colors hover:bg-zen-200"
                      >
                        <X className="h-3 w-3" /> Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="flex flex-col gap-4 rounded-3xl border border-zen-200 bg-white/80 p-6 shadow-soft">
            <div className="flex items-center gap-2 text-lg font-semibold text-zen-900">
              <ShieldBan className="h-5 w-5 text-rose-600" />
              Blocked users
            </div>
            {blocked.length === 0 ? (
              <p className="text-sm text-zen-600">You haven’t blocked anyone. Blocking someone removes them from your friends and cancels pending requests.</p>
            ) : (
              <div className="space-y-3">
                {blocked.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-zen-200 bg-white px-4 py-3 shadow-soft sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="text-sm font-semibold text-zen-900">{entry.blocked_name ?? entry.blocked_email ?? 'Unknown user'}</p>
                      <p className="text-xs text-zen-500">{entry.blocked_email ?? 'No email available'}</p>
                      {entry.created_at && (
                        <p className="text-xs text-zen-400">
                          Blocked {new Date(entry.created_at).toLocaleString()}
                        </p>
                      )}
                      {entry.reason && (
                        <p className="mt-1 text-xs text-zen-600">Reason: {entry.reason}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const result = await unblockUser(entry.blocked_user_id);
                        handleActionResult(result, 'User unblocked.');
                      }}
                      className="flex items-center gap-1 rounded-full bg-zen-100 px-3 py-1 text-xs font-semibold text-zen-600 transition-colors hover:bg-zen-200"
                    >
                      <ShieldBan className="h-3 w-3" /> Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function MailIcon() {
  return (
    <svg
      className="h-5 w-5 text-sage-600"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21 8.25v7.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 8.25 8.894 12.7a3 3 0 0 0 3.212 0L18 8.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 4.5h12a3 3 0 0 1 3 3l-8.106 5.4a3 3 0 0 1-3.212 0L3 7.5a3 3 0 0 1 3-3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
