# Rent Desk

A free rent collection tracker for landlords in India. It runs in the phone browser (and installs like an app), keeps every record on your own phone, and gives you one-tap Marathi WhatsApp and SMS reminders with a UPI payment link.

No server. No sign-up. No monthly cost.

## What it does

- Tracks tenants, monthly rent, due day, payments, payment method and notes
- Month changes by itself (`नोव्हेंबर २०२६` becomes `डिसेंबर २०२६`)
- Balance, status (`PAID`, `PARTIALLY PAID`, `PENDING`, `OVERDUE`) and a dashboard
- UPI link that asks only for the remaining balance
- Marathi WhatsApp message, Marathi SMS (with SMS part counter), Marathi call script and 6 tenant replies
- One-tap WhatsApp / SMS / Call buttons. You press Send yourself
- Reminder stages (day 1, 5, 10, 15 by default, changeable) and they stop when the rent is paid
- Payment history for every month. Nothing is overwritten
- Only payments you tick **Verified** count as paid
- Rent changes apply from a chosen month, so old months keep the old rent
- Backup to a file, share, copy or restore. Works offline

## What it does not do

- It does not send anything in the background. WhatsApp and SMS open ready to send and you press Send.
- It does not detect payments. Opening a UPI link proves nothing. You check your own bank or UPI app, then tick Verified.
- Real AI phone calls are not free. The call script and one-tap call are the free version.
- Data lives in one browser. Two phones do not sync. Use the backup to move data.

## Files (flat on purpose, so you can upload them from a phone)

| File | Purpose |
|---|---|
| `index.html`, `style.css` | Page and look |
| `app.js` | Screens and button actions |
| `logic.js` | All rent rules and message text. No browser code. Unit-tested |
| `storage.js` | Saves data in the browser, backup/restore |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Install on phone and work offline |
| `logic.test.js`, `storage.test.js` | 27 automated tests |

## The rules (in `logic.js`)

| Rule | How it works |
|---|---|
| Rent counts | Only when the tenant's rent is **confirmed** and above 0. Unknown rent is never guessed |
| Paid | Sum of **verified** payments for that tenant and month |
| Balance | `max(0, rent - paid)` |
| Status | `PAID` if balance is 0; else `PARTIALLY PAID` if something is paid; else `OVERDUE` after the due date; else `PENDING` |
| Due date | Tenant's due day, or the default in Settings. Capped to the month's last day |
| Reminder stage | From today's day of month and the 4 reminder days in Settings. `STOP (PAID)` when paid |
| Send now | True when the current stage has no logged WhatsApp/SMS reminder yet |
| UPI link | `upi://pay?pa=YOUR_UPI_ID&pn=YOUR_NAME&am=BALANCE&cu=INR&tn=Rent MONTH - SHOP`. `pa` is the account that **receives** the money: yours |

## Run and test on a computer

```
npm test        # 27 tests, needs Node 20 or newer
npm start       # then open http://localhost:8080
```
Open it through a web server. Double-clicking `index.html` will not work because the app uses modules.

## Put it online free with GitHub Pages (from an Android phone)

1. Download the zip and extract it with the Files app (long-press the zip, then Extract). You get a folder with the files.
2. In Chrome open github.com and sign in (free account). Tap the three dots and tick **Desktop site** if the buttons are hard to find.
3. Create a new repository named `rent-desk`, **Public**.
4. Tap **uploading an existing file**, choose **all the files** from the extracted folder (not the zip), then **Commit changes**.
5. Open **Settings, Pages**. Under Build and deployment choose **Deploy from a branch**, branch `main`, folder `/ (root)`, Save.
6. After 1 to 2 minutes your app is at `https://YOUR-USERNAME.github.io/rent-desk/`.
7. Open it in Chrome on your phone, tap the three dots, then **Add to Home screen** or **Install app**.

A public repository is safe here because the repository holds only code. Your tenants and payments are stored in your phone's browser, never in GitHub. Do not upload backup files to GitHub (`.gitignore` already skips them).

## First use

1. Settings: type your name and **your own** UPI ID. Save.
2. Settings, Restore backup: choose your backup file, or add tenants one by one.
3. Tenants: set real names and phone numbers. Tick **Rent is confirmed** only when you are sure.
4. After each month: Settings, **Download backup**. Chrome can lose site data if you clear it.

## Change the messages

Open `logic.js` and edit `waText`, `smsText`, `callScript` or `callReplies`. Run `npm test` after a change. Always keep the "payment not claimed until verified" wording in the replies.

## Safety

- Never store UPI PINs, bank passwords or OTPs. The app has no field for them.
- Never ask tenants for OTPs or PINs.
- Do not share your backup file. It has phone numbers and payment records.

## Licence

MIT, see `LICENSE`.
