# KRIT — Firebase OTP setup checklist

Project: `krit-7fa79`
Console: https://console.firebase.google.com/project/krit-7fa79

The OTP code in `assets/krit-commerce.js` is ready. The reason "Send OTP" shows
"Phone OTP sign-in is not enabled in Firebase yet" is that Phone is off on the
Firebase console. Follow the steps below in order.

## 1. Enable the Phone sign-in provider

1. Open https://console.firebase.google.com/project/krit-7fa79/authentication/providers
2. Find **Phone** in the provider list.
3. Click it, flip the toggle to **Enable**, then **Save**.

## 2. Add authorized domains

1. Open https://console.firebase.google.com/project/krit-7fa79/authentication/settings
2. Scroll to **Authorized domains**.
3. Confirm these entries exist; add any that are missing:
   - `localhost`
   - `kritsleep.in`
   - `www.kritsleep.in`
   - your Railway production URL, e.g. `<your-app>.up.railway.app`
     (copy the exact hostname from your Railway deployment)

Without the Railway domain added, you will hit
`auth/unauthorized-domain` or `auth/invalid-app-credential` on every OTP send.

## 3. Verify App Check is not blocking Phone auth

If you have App Check enforced on the Firebase project and Phone auth is also
under App Check enforcement, the invisible reCAPTCHA will fail on the live site
until App Check is configured. For initial rollout, keep Phone auth
App-Check-enforcement **off**:

1. Open https://console.firebase.google.com/project/krit-7fa79/appcheck
2. Under "APIs", locate **Authentication** (phone).
3. Confirm it is set to **Unenforced** (or Not monitored) until reCAPTCHA v3
   for App Check is wired up.

## 4. Billing plan

Real SMS delivery beyond a tiny free quota requires the **Blaze** (pay-as-you-go)
plan. Without Blaze, most real SMSes will silently fail or get rate-limited after
a handful of attempts. If the project is on Spark:

1. Open https://console.firebase.google.com/project/krit-7fa79/usage/details
2. Click **Modify plan** and choose **Blaze**.
3. Firebase Auth SMS is charged per SMS; India rates apply.

While still testing, use whitelisted test phone numbers instead (see step 5).

## 5. Test phone numbers (useful while Blaze is not active)

1. Open https://console.firebase.google.com/project/krit-7fa79/authentication/providers
2. Click **Phone** provider.
3. Expand **Phone numbers for testing**.
4. Add a test entry, e.g.
   - Phone: `+91 9611211121`
   - Code: `123456`
5. Save. Now entering that phone number in the OTP form will accept code `123456`
   without sending a real SMS. This is the safest way to verify the end-to-end
   flow from browser → Firebase → confirmation.

## 6. Retry the live flow

1. Deploy (or open the Railway-hosted site). Hard refresh once.
2. Open Account → the OTP block now shows:
   - Mobile number field
   - "Send OTP" button
   - After sending, "OTP code" field + "Verify OTP" button + a 30-second resend cooldown
3. Enter a real 10-digit Indian mobile, click Send OTP.
4. Enter the 6-digit SMS code, click Verify OTP.

## If it still fails, check browser console

The updated code now logs the Firebase error code to the console whenever OTP
send or verify fails. Open DevTools → Console and look for lines like:

    KRIT OTP send failed: auth/operation-not-allowed ...
    KRIT OTP send failed: auth/unauthorized-domain ...
    KRIT OTP send failed: auth/invalid-app-credential ...
    KRIT OTP send failed: auth/too-many-requests ...

Map the code back to a fix:

| Code                          | Fix                                                      |
| ----------------------------- | -------------------------------------------------------- |
| auth/operation-not-allowed    | Step 1 (enable Phone provider)                           |
| auth/unauthorized-domain      | Step 2 (add Railway + kritsleep.in to authorized list)   |
| auth/invalid-app-credential   | Step 2 + Step 3 (domain + App Check off)                 |
| auth/captcha-check-failed     | Hard refresh, clear reCAPTCHA cookie, retry              |
| auth/too-many-requests        | Wait ~1 hour, or add test numbers in Step 5              |
| auth/quota-exceeded           | Blaze plan (Step 4)                                      |
| auth/invalid-phone-number     | Input is not a valid `+91XXXXXXXXXX`                     |
| auth/invalid-verification-code | Code wrong — request a new one                          |
| auth/code-expired             | OTP expired after a few minutes — request a new one      |

## Optional: Sender ID / brand name for SMS

Firebase Auth uses its own shared SMS sender IDs for India. If you want branded
KRIT SMSes, you need MSG91 (already scaffolded in `server.js` via
`MSG91_FLOW_ID_CUSTOMER_ORDER`) and a custom OTP flow outside Firebase — that is
a separate piece of work, not required for login to work.
