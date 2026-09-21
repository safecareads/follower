# Safe Care — Free Landing Page + Google Sheet Order System

এই package-এ আছে:
- `index.html` — responsive premium landing page
- `assets/safe-care-logo.png` — Safe Care logo
- `assets/follower-packages.png` — আপনার package/price image
- `assets/payment-qr.jpg` — আপনার payment QR
- `Code.gs` — Google Sheet + Google Drive order backend
- এই `README.md` — setup guide

## কীভাবে পুরো system কাজ করবে

Facebook Ad → Landing Page → Package select → Page/Profile link → Name + Phone → Amount → QR payment → Screenshot upload → Submit → Google Apps Script → Google Sheet + Google Drive

### 1) Google Sheet

আপনার দেওয়া Sheet ID ইতিমধ্যে `Code.gs`-এ বসানো আছে:

`1pAVE4Lo-inn0O9Rqez-7Y0yCA8AKChqizkpejzWF6UU`

এই spreadsheet-এর মধ্যে script নিজে `Orders` নামে একটি tab তৈরি করবে (না থাকলে)।

প্রতি order-এ নিচের তথ্য জমা হবে:
- Timestamp
- Order ID
- Status
- Customer Name
- Phone
- Facebook Page/Profile
- Followers
- Amount
- Payment Method
- Payment Screenshot (Google Drive link)
- Source

### 2) Google Apps Script backend বানান

1. আপনার Google Sheet খুলুন।
2. `Extensions` → `Apps Script` যান।
3. Default `Code.gs`-এর সব code delete করুন।
4. এই package-এর `Code.gs` copy/paste করুন।
5. Save করুন।
6. `Deploy` → `New deployment` চাপুন।
7. Type হিসেবে `Web app` নির্বাচন করুন।
8. `Execute as`: **Me**
9. `Who has access`: **Anyone**
10. Deploy করুন।
11. Google permission চাইলে নিজের Google account দিয়ে authorize করুন।
12. যে URL পাবেন সেটি `/exec` দিয়ে শেষ হবে।

উদাহরণ:
`https://script.google.com/macros/s/XXXXXXXXXXXX/exec`

### 3) Landing page-এর সাথে link করুন

`index.html` খুলে এই অংশটি খুঁজুন:

```html
<form id="orderForm" class="form-card" action="YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL"
```

`YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL`-এর জায়গায় Apps Script-এর `/exec` URL বসান।

উদাহরণ:

```html
<form id="orderForm" class="form-card" action="https://script.google.com/macros/s/XXXXXXXXXXXX/exec"
```

তারপর save করুন।

### 4) Screenshot কোথায় যাবে?

Customer screenshot upload করলে Apps Script Google Drive-এ:

`Safe Care Order Screenshots`

নামে একটি folder তৈরি করবে (না থাকলে)।

তারপর ওই screenshot-এর Drive URL `Orders` sheet-এ জমা হবে।

> নিরাপত্তার জন্য screenshot file defaultভাবে private রাখা হয়েছে। আপনার Google account থেকে file খুলতে পারবেন।

### 5) Free hosting — সবচেয়ে সহজ উপায়

#### Option A: Netlify Drop (সবচেয়ে সহজ)

1. `https://app.netlify.com/drop` খুলুন।
2. `safe-care-landing-page` folder-এর পুরো folder drag & drop করুন।
3. Netlify সঙ্গে সঙ্গে একটি live URL দেবে।
4. চাইলে Netlify-তে free account করে site name পরিবর্তন করতে পারবেন।

#### Option B: GitHub Pages (free + stable)

1. GitHub-এ নতুন public repository তৈরি করুন।
2. এই folder-এর `index.html` এবং `assets` folder upload করুন।
3. Repository → `Settings` → `Pages`
4. `Deploy from a branch` নির্বাচন করুন।
5. `main` branch + `/root` নির্বাচন করে Save করুন।
6. কিছু সময় পর GitHub একটি free `.github.io` URL দেবে।

### 6) Facebook Ads-এ ব্যবহার

Ad-এর website/landing page URL হিসেবে আপনার Netlify বা GitHub Pages URL দিন।

উদাহরণ flow:

Facebook Ad
→ Landing Page
→ `অর্ডার করুন`
→ Package select
→ Payment QR
→ Screenshot submit
→ Google Sheet-এ order
→ Manual payment verification
→ Order confirmation

### 7) গুরুত্বপূর্ণ

- Apps Script Web App URL পরিবর্তন হলে `index.html`-এ নতুন URL বসাতে হবে।
- Google Sheet-এর `Orders` tab-এর header পরিবর্তন না করাই ভালো।
- Screenshot upload base64 হিসেবে পাঠানো হয় এবং browser-side resize করা হয়, যাতে mobile থেকে upload সহজ হয়।
- Landing page-এর package price আপনার দেওয়া image অনুযায়ী রাখা হয়েছে:
  - ১ হাজার = ৳৮০
  - ১০ হাজার = ৳৩৫০
  - ২০ হাজার = ৳৬৫০
  - ৫০ হাজার = ৳১,৫৫০
  - ১ লক্ষ = ৳৩,০০০
- Completion copy-তে ১০ মিনিট–৪ ঘণ্টা সাধারণ সময় এবং সর্বোচ্চ ২৪ ঘণ্টা উল্লেখ করা হয়েছে।
- Non-Drop wording-এ platform-level exception রাখা হয়েছে, যাতে Facebook-এর নিজস্ব restriction/action-এর মতো বিষয় আলাদা থাকে।

## যদি future-এ package/price বদলাতে চান

`index.html`-এ JavaScript-এর এই অংশটি edit করুন:

```js
const prices = {
  1000: 80,
  10000: 350,
  20000: 650,
  50000: 1550,
  100000: 3000
};
```

এবং উপরের package card-এর text/`data-price`-ও মিলিয়ে বদলাবেন।

## Support information used in the page

Phone: 01926765032  
Address: 17/1, Adabor Bazar, Dhaka 1207

Live Sheet:
https://docs.google.com/spreadsheets/d/1pAVE4Lo-inn0O9Rqez-7Y0yCA8AKChqizkpejzWF6UU/edit?usp=sharing
