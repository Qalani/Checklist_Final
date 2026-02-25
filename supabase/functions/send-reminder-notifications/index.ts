/**
 * Supabase Edge Function: send-reminder-notifications
 *
 * Scans zen_reminders for entries that fall within the next 60 seconds,
 * looks up the FCM device tokens for those users, and delivers a native
 * push notification via the FCM HTTP v1 API.
 *
 * Deploy & schedule with Supabase's built-in pg_cron or call it from an
 * external cron service every minute:
 *
 *   supabase functions deploy send-reminder-notifications
 *
 * Required environment variables (set in Supabase Dashboard → Edge Functions):
 *   SUPABASE_URL                – your project URL
 *   SUPABASE_SERVICE_ROLE_KEY   – service-role key (bypasses RLS for reads)
 *   FCM_PROJECT_ID              – Firebase project ID
 *   FCM_SERVICE_ACCOUNT_JSON    – base64-encoded Firebase service account JSON
 *
 * To schedule it every minute inside Supabase (requires pg_cron extension):
 *   SELECT cron.schedule(
 *     'send-reminder-notifications',
 *     '* * * * *',
 *     $$SELECT net.http_post(
 *       url := 'https://<project-ref>.supabase.co/functions/v1/send-reminder-notifications',
 *       headers := '{"Authorization": "Bearer <anon-key>"}'::jsonb
 *     )$$
 *   );
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID')!;
// Base64-encoded service account JSON downloaded from Firebase Console.
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── FCM authentication ────────────────────────────────────────────────────────

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

async function getFcmAccessToken(): Promise<string> {
  const sa: ServiceAccount = JSON.parse(atob(FCM_SERVICE_ACCOUNT_JSON));

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
  });
  const json = await res.json();
  return json.access_token as string;
}

// ── FCM delivery ──────────────────────────────────────────────────────────────

async function sendFcmNotification(
  accessToken: string,
  deviceToken: string,
  title: string,
  body: string,
): Promise<void> {
  await fetch(
    `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
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
    },
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async () => {
  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 60_000); // next 60 s

    const { data: reminders, error: remindersError } = await supabase
      .from('zen_reminders')
      .select('id, user_id, title, description, remind_at')
      .gte('remind_at', now.toISOString())
      .lte('remind_at', windowEnd.toISOString());

    if (remindersError) throw remindersError;
    if (!reminders?.length) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userIds = [...new Set(reminders.map((r) => r.user_id as string))];

    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', userIds);

    if (tokensError) throw tokensError;

    const tokensByUser = new Map<string, string[]>();
    for (const t of tokens ?? []) {
      const arr = tokensByUser.get(t.user_id as string) ?? [];
      arr.push(t.token as string);
      tokensByUser.set(t.user_id as string, arr);
    }

    const accessToken = await getFcmAccessToken();
    let sent = 0;

    for (const reminder of reminders) {
      const deviceTokens = tokensByUser.get(reminder.user_id as string) ?? [];
      for (const deviceToken of deviceTokens) {
        await sendFcmNotification(
          accessToken,
          deviceToken,
          reminder.title as string,
          (reminder.description as string | null) ?? 'Time for your Zen reminder',
        );
        sent++;
      }
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
