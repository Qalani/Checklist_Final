# Reminder push scheduler

`send-reminder-notifications` accepts only `POST` with an
`x-reminder-cron-secret` header matching its `REMINDER_CRON_SECRET` environment
variable. A user JWT, publishable key, or legacy anon key does not authorize a
dispatch. The function rejects missing/short configuration before creating a
service-role client and never returns database or FCM error details.

## Secrets and deployment

Generate a random scheduler secret with at least 32 bytes of entropy, for example
`openssl rand -hex 32`. Keep the value in a password manager or secret store;
never put it in the repository, client bundle, a URL, or shell command history.
The function requires:

| Variable | Source |
| --- | --- |
| `SUPABASE_URL` | Supabase-provided project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase-provided server-only service-role key |
| `REMINDER_CRON_SECRET` | The dedicated generated scheduler secret |
| `FCM_PROJECT_ID` | Firebase project ID |
| `FCM_SERVICE_ACCOUNT_JSON` | Base64-encoded Firebase service-account JSON with permission to send FCM messages |

Set custom secrets securely in the Supabase dashboard's Edge Function secrets
settings, or use `supabase secrets set --env-file <protected-file>` after checking
the current CLI help. Delete the temporary secret file after use. Never print
its contents. Do not set these values as `NEXT_PUBLIC_*` variables.

Deploy from the repository root with
`supabase functions deploy send-reminder-notifications --project-ref <project-ref>`.
The committed `supabase/config.toml` sets `verify_jwt = false` because the
function uses its dedicated secret instead of a Supabase user JWT. Preserve this
setting in any dashboard or MCP deployment. Configure both copies of the secret
before enabling or updating the cron job.

## Supabase Cron

Enable Supabase Cron (`pg_cron`), `pg_net`, and Vault in the project's dashboard.
Store the function URL as Vault secret `reminder_function_url` and the exact same
secret as `REMINDER_CRON_SECRET` as Vault secret `reminder_cron_secret`. Use the
dashboard's secret entry flow to avoid embedding plaintext secrets in SQL
history or migrations.

Create or replace the existing named job with this SQL. It sends only a custom
scheduler header; the broad service-role key is never sent by the cron job.

```sql
select cron.schedule(
  'send-reminder-notifications',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'reminder_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets
       where name = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $job$
);
```

An external cron service may instead send `POST` every minute to the function URL
with the same header from its protected secret store. Do not enable both
schedulers. Do not automatically retry a dispatch: a partly successful run can
already have delivered notifications to some devices.

## Verify and operate

Run `npm run test:reminder-scheduler` for mocked authorization and delivery
regressions. These checks make no external requests and do not send real pushes.

Check HTTP responses without printing request headers. `GET` must return `405`;
`POST` without the scheduler secret, with an anon key, or with an incorrect
secret must return `401`. Missing or short function secret configuration returns
`503`. These rejected calls must produce no database or FCM requests.

An authorized call with no due reminders or no registered device tokens returns
`200` with `{"sent":0}`. For a staging push test, register a staging device token
and create a reminder just inside the next minute. Check that the device receives
it and the response reports the number of successful deliveries. FCM failure must
produce a non-success response without returning provider error bodies. Partial
delivery returns `502` with `sent` and `failed` counts; only confirmed FCM success
increments `sent`. Review the cron run and `pg_net` response status as well as
Edge Function logs; `pg_cron` completing the SQL does not mean the HTTP call
succeeded.

Rotate by pausing the cron job, replacing both protected secret copies,
performing an authorized check, then re-enabling the job. Restrict access to Vault,
cron job editing, and function configuration to administrators.

This scheduler scans `[now, now + 60 seconds)` each run. It has no delivery ledger,
missed-run catch-up, recurrence expansion, or cross-run deduplication. Scheduler
jitter and retries can cause missed or duplicate notifications. These changes
protect authorization and response handling; reliable at-least-once scheduling
requires a separate durable delivery design.

References: [Supabase function authentication](https://supabase.com/docs/guides/functions/auth-headers),
[scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions),
and [function secrets](https://supabase.com/docs/guides/functions/secrets).
