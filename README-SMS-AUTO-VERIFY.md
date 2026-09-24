# Safe Care — Free SMS Auto Payment Verification

এই update-টি existing Safe Care landing page-এর জন্য। এটি bKash/Nagad personal-number payment SMS Android ফোন থেকে Google Apps Script webhook-এ পাঠিয়ে pending order-এর সঙ্গে মিলিয়ে দেখে।

## 1. Google Apps Script

1. তোমার Google Sheet খুলে **Extensions → Apps Script** যাও।
2. পুরোনো `Code.gs` পুরোটা replace করে এই ZIP-এর `Code.gs` paste করো।
3. **Save** করো।
4. **Deploy → New deployment → Web app**.
5. Execute as: **Me**.
6. Who has access: **Anyone**.
7. Deploy করে `/exec` URL copy করো।

## 2. Website

`index.html`-এর এই অংশে:

`action="YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL"`

তোমার Apps Script `/exec` URL বসাবে।

তারপর GitHub Pages-এ updated `index.html` upload/replace করবে।

## 3. Android SMS Forwarder

Recommended free/open-source app:
https://github.com/bogkonstantin/android_income_sms_gateway_webhook/releases

অ্যাপ install করে SMS receive permission এবং background/autostart permission দাও।

Forwarding rule-এ:

- Sender: `*`
- URL:
  `YOUR_APPS_SCRIPT_EXEC_URL?smsKey=SCsms-BPrHtwkwt7muFswdDE6mPgdi8dcD`

এই project-এর `Code.gs`-এ একই secret সেট করা আছে।

## 4. গুরুত্বপূর্ণ

শুধু তোমার নিজের ফোন/SIM-এর incoming payment SMS forward করবে। SMS-এ sensitive তথ্য থাকতে পারে, তাই webhook URL/secret অন্য কাউকে দেবে না।

## 5. কীভাবে verification হবে

Customer website-এ:

- bKash বা Nagad নির্বাচন করবে
- যে number থেকে টাকা পাঠাবে সেটি দেবে
- exact order amount payment করবে
- Transaction ID দেবে
- চাইলে screenshot দেবে

তারপর ফোনে payment SMS আসবে। Backend চেষ্টা করবে:

**Amount + Sender Number + Transaction ID**

তিনটিই exact match হলে Google Sheet-এর Status হবে:

`Payment Verified`

এবং `Payment Verified At`, SMS source ও raw SMS log হবে।

## 6. প্রথমে TEST করো

প্রথম live customer order নেওয়ার আগে নিজের অন্য bKash/Nagad number দিয়ে ছোট একটি test order করে পুরো flow পরীক্ষা করো। SMS format provider/account অনুযায়ী আলাদা হলে `parsePaymentSms_()`-এর regex সামান্য পরিবর্তন লাগতে পারে।

## 7. Existing Sheet

Script তোমার existing `Orders` sheet-এর পুরোনো columns নষ্ট করবে না। প্রয়োজনীয় নতুন columns নিজে যোগ করবে এবং `Payment SMS Log` sheet তৈরি করবে।
