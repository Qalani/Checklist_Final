# Offline sync recovery

New offline operations store the signed-in actor separately from the row owner.
Queue replay checks the current Supabase session and leaves other accounts'
changes on the device. Server authorization and row-level security remain the
authority for every replayed request.

Older app versions did not store an actor. An old INSERT with an explicit
matching owner can be recovered automatically. Old UPDATE and DELETE entries
cannot safely be attributed to the next account that signs in, including when
the cached row belongs to that account: another collaborator may have authored
the edit. These entries are preserved rather than replayed under a guessed
identity. Do not clear site data or reinstall the app to fix an old queue; doing
so removes the only local copy. Recovery of ambiguous legacy entries requires
identifying the original account and reviewing/reapplying the saved edit.

Retries no longer stop permanently after three failures. The app retains failed
operations and retries them with bounded backoff and on reconnect or resume.
Within an account, replay stops at the first failure so a dependent update or
delete cannot overtake its failed insert. Persistent authorization or validation
errors need correction before the account's remaining queue can drain. The
Retry action resets the existing entry in place and preserves operation order.

A cached profile can select existing device data while offline, including when
an expired Supabase token cannot be refreshed. It contains no tokens and does
not authorize network requests. Explicit logout immediately clears this local
selector; reconnect requires a current Supabase session before any replay.
