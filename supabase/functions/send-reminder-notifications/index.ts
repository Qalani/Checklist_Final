/**
 * Supabase Edge Function: send-reminder-notifications
 *
 * Scans zen_reminders for entries that fall within the next 60 seconds,
 * looks up the FCM device tokens for those users, and delivers a native
 * push notification via the FCM HTTP v1 API.
 *
 * Scheduler setup, required secrets, and deployment: docs/reminder-scheduler.md.
 * Only POST requests authenticated with the dedicated scheduler secret may
 * initialize a service-role client or read reminder/device data.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

function jsonResponse(body: Record<string, unknown>, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

async function matchesSecret(provided: string, expected: string): Promise<boolean> {
  // Compare fixed-length hashes without an early exit for the first mismatch.
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const actual = new Uint8Array(actualHash);
  const wanted = new Uint8Array(expectedHash);
  let difference = 0;
  for (let i = 0; i < wanted.length; i++) difference |= actual[i] ^ wanted[i];
  return difference === 0;
}

// ── FCM authentication ────────────────────────────────────────────────────────

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

async function getFcmAccessToken(encodedServiceAccount: string): Promise<string> {
  const sa: ServiceAccount = JSON.parse(atob(encodedServiceAccount));
  if (!sa.client_email || !sa.private_key) throw new Error('Invalid FCM configuration');

  const encodeB64Url = (data: Uint8Array) =>
    btoa(String.fromCharCode(...data))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const now = Math.floor(Date.now() / 1000);
  const header = encodeB64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = encodeB64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: sa.client_email,
        sub: sa.client_email,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
      }),
    ),
  );

  const signingInput = `${header}.${payload}`;
  const keyPem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\n/g, '');
  const keyBytes = Uint8Array.from(atob(keyPem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const signature = encodeB64Url(new Uint8Array(signatureBytes));
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error('FCM authentication failed');
  const json = await res.json();
  if (typeof json.access_token !== 'string' || !json.access_token) {
    throw new Error('FCM authentication failed');
  }
  return json.access_token;
}

// ── FCM delivery ──────────────────────────────────────────────────────────────

async function sendFcmNotification(
  projectId: string,
  accessToken: string,
  deviceToken: string,
  title: string,
  body: string,
): Promise<void> {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title, body },
          android: {
            notification: {
              sound: 'default',
              channel_id: 'zen_reminders',
            },
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error('FCM delivery failed');
  const result = await response.json();
  if (typeof result.name !== 'string' || !result.name) throw new Error('FCM delivery failed');
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
  }

  const schedulerSecret = Deno.env.get('REMINDER_CRON_SECRET');
  if (!schedulerSecret || schedulerSecret.length < 32) {
    return jsonResponse({ error: 'Reminder scheduler is not configured' }, 503);
  }
  const providedSecret = request.headers.get('x-reminder-cron-secret') ?? '';
  if (!providedSecret || !(await matchesSecret(providedSecret, schedulerSecret))) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const fcmProjectId = Deno.env.get('FCM_PROJECT_ID');
    const fcmServiceAccount = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
    if (!supabaseUrl || !serviceRoleKey || !fcmProjectId || !fcmServiceAccount) {
      return jsonResponse({ error: 'Reminder scheduler is not configured' }, 503);
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 60_000); // next 60 s

    const { data: reminders, error: remindersError } = await supabase
      .from('zen_reminders')
      .select('id, user_id, title, description, remind_at')
      .gte('remind_at', now.toISOString())
      .lt('remind_at', windowEnd.toISOString())
      .abortSignal(AbortSignal.timeout(10_000));

    if (remindersError) throw remindersError;
    if (!reminders?.length) {
      return jsonResponse({ sent: 0 });
    }

    const userIds = [...new Set(reminders.map((r) => r.user_id as string))];

    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', userIds)
      .abortSignal(AbortSignal.timeout(10_000));

    if (tokensError) throw tokensError;
    if (!tokens?.length) return jsonResponse({ sent: 0 });

    const tokensByUser = new Map<string, string[]>();
    for (const t of tokens ?? []) {
      const arr = tokensByUser.get(t.user_id as string) ?? [];
      arr.push(t.token as string);
      tokensByUser.set(t.user_id as string, arr);
    }

    const accessToken = await getFcmAccessToken(fcmServiceAccount);
    let sent = 0;
    let failed = 0;

    for (const reminder of reminders) {
      const deviceTokens = tokensByUser.get(reminder.user_id as string) ?? [];
      for (const deviceToken of deviceTokens) {
        try {
          await sendFcmNotification(
            fcmProjectId,
            accessToken,
            deviceToken,
            reminder.title as string,
            (reminder.description as string | null) ?? 'Time for your Zen reminder',
          );
          sent++;
        } catch {
          failed++;
        }
      }
    }

    if (failed > 0) {
      console.error('Reminder notification deliveries failed', { sent, failed });
      return jsonResponse({ error: 'Some reminder notifications could not be sent', sent, failed }, 502);
    }
    return jsonResponse({ sent });
  } catch {
    // Database/provider errors may contain credentials, device tokens, or user data.
    console.error('Reminder notification dispatch failed');
    return jsonResponse({ error: 'Reminder notifications could not be sent' }, 500);
  }
});
