# Push notifications: one-time setup (about 15 minutes)

Notifications are optional. The app works fully without them (the owner sees a count on Home and in the Staff inbox).
Set this up once per shop. It needs your Supabase project and Vercel.

## What you will get
Owner phone: money request, new suggestion or problem, new sales return note, task completed, shop fund low.
Employee phone: new task, answer to a money request.

## Steps

1. **Run the database files first:** `migration-23.sql`, `migration-24.sql`, `migration-25.sql` (in that order, once each).

2. **Choose a secret word.** Any long random text, for example `skma-9fK2xQ7mLp`. Keep it, you will use it three times.

3. **Deploy the notify function** (Supabase dashboard):
   - Edge Functions > Deploy a new function > Via Editor.
   - Name it exactly `notify`. Delete the sample code and paste the whole of `supabase/functions/notify/index.ts`. Deploy.
   - Open the function's settings and turn **Verify JWT** OFF (our own secret protects it) and save.

4. **Add the first secret:** Edge Functions > Secrets (Manage secrets) > add `WEBHOOK_SECRET` = your secret word.

5. **Make the notification keys:** open this address in your phone or PC browser (use your own project reference and secret):
   `https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify?generate=YOUR-SECRET`
   It shows two long texts: `publicKey` and `privateKey`. Copy both.

6. **Add the other secrets** (same Secrets page):
   - `VAPID_PUBLIC_KEY` = the publicKey
   - `VAPID_PRIVATE_KEY` = the privateKey
   - `VAPID_EMAIL` = your email address
   - (optional) `FUND_LOW` = the fund balance below which you get a "fund is low" alert. Default 1000.

7. **Give the app the public key:** Vercel > your project > Settings > Environment Variables > add
   `VITE_VAPID_PUBLIC_KEY` = the publicKey > then Deployments > Redeploy.

8. **Switch on the triggers:** you do NOT need any Webhooks screen. Open `push-triggers.sql`, use Find & Replace to change
   `YOUR-PROJECT-REF` and `YOUR-SECRET` (each appears once), then run it in Supabase > SQL Editor. It turns on the
   `pg_net` extension by itself (if it asks, you can also switch it on in Database > Extensions).

9. **Turn it on in each phone:**
   - Owner: Staff > Inbox > "Turn on notifications".
   - Employee: Home screen > "Turn on notifications".
   - Tap Allow when the phone asks.
   - iPhone: the app must be added to the Home Screen first (iOS 16.4 or newer), then open it from there.

10. **Test:** from an employee login, send a suggestion. Your phone should show a notification within a few seconds.

## If nothing arrives
- The phone must have notifications allowed for the app (phone Settings > Apps > the app > Notifications).
- Supabase > Edge Functions > notify > Logs shows any error. "VAPID keys are not set" means step 6 is missing.
- Each phone has to tap "Turn on notifications" itself. A user who signs out and another signs in on the same phone may need to turn it on again.
- This feature could not be tested before delivery, so the logs are the first place to look.
