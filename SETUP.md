# Pastel Treats — launch guide (plain language)

**Shop:** `https://pastel-treats.netlify.app/` **Baker's dashboard:** `https://pastel-treats.netlify.app/#/admin` (link also in the shop footer: "Baker's dashboard")

Use the bakery's **new dedicated e-mail** for every account below, so the website, orders and customer data belong to the bakery, separate from anything else.

Until step 2 is done the site runs in **demo mode** (yellow bar on top): it works, but each order is saved only on the phone that placed it. **Do not share the link with customers before step 2.**

---

## Step 1 — Put the site online (Netlify, free, drag-and-drop)

1. Go to **app.netlify.com** → **Sign up with e-mail** → use the bakery e-mail → confirm it from the inbox.
2. On the dashboard: **Add new project → Deploy manually**.
3. Unzip **`pastel-treats-site.zip`** and drag the whole folder onto the page. In ~30 seconds you get a link like `https://random-name.netlify.app`.
4. **Project configuration → Change project name** → e.g. `pasteltreats` → link becomes `https://pasteltreats.netlify.app`.
5. Optional later: buy `pasteltreats.in` and add it under **Domain management** (~₹800/year).

> Why Netlify and not Vercel: Vercel's free plan is for non-commercial use only; a bakery taking orders needs Vercel Pro (US$20/month). Netlify's free plan allows business sites.

## Step 2 — Connect the order database (Supabase, free)

1. Go to **supabase.com** → **Start your project** → sign up with the bakery e-mail.
2. **New project** → name `pastel-treats` → set a strong database password (save it) → region **South Asia (Mumbai)** → **Create**. Wait ~2 minutes.
3. Left menu **SQL Editor → New query** → open `supabase/migrations/001_schema.sql` from the project zip, copy everything, paste, **Run**. You should see "Success".
4. **New query** again → paste `002_seed.sql` → **Run** (loads the rate card, time slots and settings).
5. **Project Settings → API** → copy **Project URL** and the **anon public** key.
6. In the site folder, open **`config.js`** in any text editor (Notepad works) and paste them:
   ```js
   window.PT_CONFIG = {
     supabaseUrl: 'https://xxxx.supabase.co',
     supabaseAnonKey: 'eyJ...long key...',
   }
   ```
   Save. Back in Netlify: **Deploys → drag the folder in again**. The yellow demo bar disappears — you're live.
   *(Or send me the two values and I'll prepare the folder for you. The anon key is safe to share; never share the service_role key or the database password.)*

## Step 3 — Create the baker's login

1. Open `https://pastel-treats.netlify.app/#/admin` → **First time? Create the owner account** → bakery e-mail + a strong password.
2. Supabase sends a confirmation e-mail — click the link, then sign in.
3. Tap **Claim owner role** (works only once — do it right away).
4. Helpers: they create an account the same way, send you the ID shown on their screen, you add them under **Team**.

## Step 4 — Fill in the last details (no code)

Dashboard → **Business settings**
- **Payments**: enter the **UPI ID** (e.g. `pasteltreats@okaxis`) and payee name → every order then shows a QR with the exact advance amount. Without it, customers see "contact us to pay".
- **Business & contact**: add the full **pickup address** (leave e-mail empty — it is then not shown anywhere) (the map link is already set). WhatsApp 95668 83196, hours (Mon–Sat 9 AM–7 PM, Sun 11 AM–7 PM app & WhatsApp only) are already filled in.

Dashboard → **Menu & pricing**: add an **ingredient cost %** to each item to see profit insights. Replace "AI illustration" pictures with real photos whenever you have them (Edit → Photos).

## Step 5 — Test once before announcing

1. On your phone, place a real order (e.g. one brownie box, pickup).
2. Note the **Order ID** (e.g. `PT-1-26` — order number this year, then the year; it restarts at 1 every January).
3. Tap **Send my order details on WhatsApp** → check it arrives on 95668 83196.
4. Pay ₹1 or the advance by UPI, enter the UTR → in the dashboard open the order → **Verify** → **Confirm order**.
5. **My orders** page → enter the mobile number → the order shows as Confirmed.
6. Dashboard → **Cancel order…** → **Cancel & refund** → **Mark refunded**. (Then you can delete the test order's customer under Customers.)
7. Share the link on Instagram & WhatsApp status.

## Step 6 — The app on Android & iPhone

**A. Installable app — free, works the day the site is live (recommended first)**
- The site *is* the app: it installs with its own icon, opens full-screen without the browser bar, and updates itself whenever you change the menu.
- Customers get it from the **Get the app** banner on the home page, or the page `https://pastel-treats.netlify.app/#/app`. Share that link on Instagram and WhatsApp status.
  - Android (Chrome): one tap on **Install**.
  - iPhone (Safari): Share → **Add to Home Screen**. The page shows the steps.

**B. Google Play Store — about ₹2,100 one time**
1. Create a **Google Play Console** developer account with the bakery e-mail (US$25 one time, ID verification takes a few days).
2. Go to **pwabuilder.com** → paste your site link → **Package for stores → Android** → **Generate**. Download the zip. It contains the app file (`.aab`) and a `assetlinks.json` file.
3. Send me that `assetlinks.json` (or paste its contents). I'll put it in the site so the app opens without a browser bar, and you re-upload the site folder.
4. Play Console → **Create app** → upload the `.aab`. Fill the listing from the **`store-kit`** folder (text in `LISTING.md`, icon, feature graphic, screenshots).
5. New personal accounts must run a **closed test with 12 testers for 14 days** before going public — friends and family are fine.

**C. Apple App Store — US$99 per year**
- Needs an **Apple Developer** account (bakery e-mail) and a **Mac** with Xcode. pwabuilder.com → **iOS** gives you the Xcode project.
- Apple often rejects apps that are "just a website", so most small businesses use option A for iPhone. Do C only if you specifically want the App Store badge.

---

## How orders work (for reference)

| Situation | What happens |
|---|---|
| New order | Order ID created automatically: PT-1-26, PT-2-26 … (restarts at 1 each year). Customer sees UPI QR for the 50% advance and a button to send the order to you on WhatsApp. |
| Customer pays | They enter the UTR / screenshot. It stays **unverified** until you tap **Verify** after checking your UPI app. |
| Custom design / courier | Comes to you as "awaiting review". You set the price/courier charge, tap **Approve & send quote**; customer pays after that. |
| Customer wants to cancel | Order page shows what they'll get back and a "Request cancellation on WhatsApp" button. |
| You cancel | **Cancel order…** shows the policy: more than 48 hrs before the slot → full advance refund; less → no refund. Choose "Cancel & refund" or "Cancel, no refund". The slot frees up immediately. Refund stays "pending" until you tap **Mark refunded**. |
| Leave / holidays | **Announcement board** → post a notice, optionally block dates, or **Pause all new orders**. |
| Tracking | Customers tap **My orders** and enter their mobile number. |

## Backups
Free Supabase has no automatic backups. Every Monday: **Data & reports** → download Orders, Customers, Payments.

## Optional extras (need accounts / approval)
- **Razorpay** online payments: needs Razorpay KYC + keys; see `supabase/functions/razorpay`.
- **Automatic WhatsApp messages**: needs the WhatsApp Business API (paid, Meta approval). Today messages are one tap from the dashboard.

## Developer notes
`npm install` · `npm run dev` · `npm run build` · `npm run test:db` (37 rule checks) · `node scripts/e2e.mjs` (phone walk-through, needs `npm run preview`) · `python3 scripts/make-illustrations.py` (redraws AI illustrations) · prices live in `src/data/seed.js` → `npm run seed:sql`.
