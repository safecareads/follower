/**
 * SAFE CARE ORDER BACKEND + FREE SMS PAYMENT AUTO-VERIFICATION
 * Google Apps Script -> Google Sheet + Google Drive
 *
 * IMPORTANT:
 * 1) Keep this script in the Apps Script project connected to your Order Sheet.
 * 2) Deploy as Web App: Execute as Me, Who has access: Anyone.
 * 3) Put the resulting /exec URL in index.html action.
 * 4) For SMS forwarding, use the same /exec URL with ?smsKey=YOUR_SECRET
 *    in the Android SMS Forwarder app.
 */

const SPREADSHEET_ID = '1pAVE4Lo-inn0O9Rqez-7Y0yCA8AKChqizkpejzWF6UU';
const SHEET_NAME = 'Orders';
const DRIVE_FOLDER_NAME = 'Safe Care Order Screenshots';

// CHANGE THIS to your own long random secret before deploying.
// Example: 'SCsms-9f4K2x7M8pQ1zL6V'
const SMS_WEBHOOK_SECRET = 'SCsms-BPrHtwkwt7muFswdDE6mPgdi8dcD';

const HEADERS = [
  'Timestamp','Order ID','Status','Customer Name','Phone',
  'Facebook Page/Profile','Followers','Amount (BDT)','Payment Method',
  'Payment Screenshot','Source','Payment Sender Number','Transaction ID',
  'Payment Verified At','SMS Source','SMS Raw Text'
];

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'verifyPayment') {
    return handleVerifyPaymentRequest_(e);
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:30px">' +
    '<h2>Safe Care Order Backend</h2><p>Backend is running.</p>' +
    '</div>'
  );
}

function doPost(e) {
  try {
    // SMS Forwarder webhook route.
    if (e && e.parameter && e.parameter.smsKey) {
      return handleSmsWebhook_(e);
    }

    // Browser-side instant payment verification route.
    // The website sends this through a hidden iframe so there is no CORS dependency.
    if (e && e.parameter && e.parameter.action === 'verifyPayment') {
      return handleVerifyPaymentRequest_(e);
    }

    // Website order route.
    const payload = JSON.parse((e.parameter && e.parameter.payload) || '{}');

    // Simple honeypot anti-spam.
    if (e.parameter && e.parameter.website) {
      return htmlResponse_('Spam blocked.');
    }

    const required = [
      'packageFollowers','amount','pageUrl','customerName','phone',
      'paymentMethod','paymentSenderNumber','transactionId'
    ];
    required.forEach(function(k){
      if (payload[k] === undefined || String(payload[k]).trim() === '') {
        throw new Error('Missing field: ' + k);
      }
    });

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getOrCreateSheet_(ss, SHEET_NAME);
    ensureHeaders_(sheet);

    const timestamp = new Date();
    const orderId = 'SC-' + Utilities.formatDate(
      timestamp,
      Session.getScriptTimeZone() || 'Asia/Dhaka',
      'yyyyMMdd-HHmmss'
    ) + '-' + Math.floor(Math.random()*900+100);

    let screenshotUrl = '';
    const b64 = e.parameter && e.parameter.screenshotBase64;
    const screenshotName = (e.parameter && e.parameter.screenshotName) || ('payment-' + orderId + '.jpg');

    if (b64) {
      screenshotUrl = saveScreenshot_(b64, screenshotName, orderId);
    }

    const senderNumber = normalizePhone_(payload.paymentSenderNumber);
    const transactionId = normalizeTxn_(payload.transactionId);
    const amount = Number(payload.amount);
    const paymentMethod = String(payload.paymentMethod).trim();

    if (!/^01\d{9}$/.test(senderNumber)) {
      throw new Error('Invalid payment sender number');
    }
    if (!transactionId || transactionId.length < 4) {
      throw new Error('Invalid transaction ID');
    }
    if (!amount || amount <= 0) {
      throw new Error('Invalid payment amount');
    }

    // Save the order. Transaction IDs are NOT blocked as duplicates here.
    // Payment verification is intentionally based ONLY on whether this
    // Transaction ID exists in the Payment SMS Log.
    const row = buildRow_(timestamp, orderId, 'Pending Payment Verification', payload, screenshotUrl,
      senderNumber, transactionId);
    sheet.appendRow(row);

    // Immediately try matching against SMS messages already received/stored.
    // This is important when the payment SMS arrived BEFORE the customer
    // submitted the order form.
    const matched = matchPendingOrderAgainstSmsLog_(sheet, orderId);

    const finalStatus = matched.orderId === orderId ? 'Payment Verified' : 'Pending Payment Verification';

    return htmlResponse_(
      '<script>window.parent.postMessage({type:"safe-care-order",status:"ok",orderId:' +
      JSON.stringify(orderId) + ',paymentStatus:' + JSON.stringify(finalStatus) + '}, "*");</script>' +
      '<div style="font-family:Arial,sans-serif;padding:30px;color:#0b5c4e">' +
      '<h2>Order received</h2><p>' +
      (finalStatus === 'Payment Verified'
        ? 'Payment automatically verified. Order confirmed.'
        : 'Order received. Payment SMS এলে system automatically verify করবে.') +
      '</p><p>Order ID: <b>' + escapeHtml_(orderId) + '</b></p></div>'
    );
  } catch (err) {
    return htmlResponse_(
      '<script>window.parent.postMessage({type:"safe-care-order",status:"error"}, "*");</script>' +
      '<div style="font-family:Arial,sans-serif;padding:30px;color:#8a1c1c">' +
      '<h2>Submission error</h2><p>Order submit করা যায়নি।</p>' +
      '<small>' + escapeHtml_(String(err)) + '</small></div>'
    );
  }
}

/**
 * Receives JSON from the Android SMS Forwarder app.
 * Expected JSON example:
 * {"from":"16247","text":"...Tk 350...TrxID ABC123...from 017..."}
 */
function handleVerifyPaymentRequest_(e) {
  let transactionId = '';
  try {
    const p = (e && e.parameter) || {};
    if (p.transactionId !== undefined) {
      transactionId = normalizeTxn_(p.transactionId);
    } else if (p.payload) {
      const payload = JSON.parse(p.payload || '{}');
      transactionId = normalizeTxn_(payload.transactionId || '');
    }
  } catch (err) {
    transactionId = '';
  }

  if (!transactionId || transactionId.length < 4) {
    return verifyResponse_({verified:false, reason:'Transaction ID দিন।'}, e && e.parameter ? e.parameter.callback : '');
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const smsSheet = getOrCreateSheet_(ss, 'Payment SMS Log');
  ensureSmsHeaders_(smsSheet);

  // IMPORTANT: verification intentionally checks ONLY Transaction ID.
  // Amount, sender number, payment method, and duplicate orders are ignored.
  const result = findTransactionIdInSmsLog_(smsSheet, transactionId);
  return verifyResponse_(result, e && e.parameter ? e.parameter.callback : '');
}

function findTransactionIdInSmsLog_(smsSheet, transactionId) {
  const wanted = normalizeTxn_(transactionId);
  const lastRow = smsSheet.getLastRow();
  if (lastRow < 2) {
    return {verified:false, reason:'Payment SMS Log-এ কোনো Transaction ID পাওয়া যায়নি।'};
  }

  // Payment SMS Log columns: Received At, SMS From, Amount, Sender Number,
  // Transaction ID, Raw SMS, Confidence.
  const logs = smsSheet.getRange(2,1,lastRow-1,7).getValues();
  for (let i = logs.length - 1; i >= 0; i--) {
    const smsTxn = normalizeTxn_(logs[i][4] || '');
    if (smsTxn === wanted) {
      return {
        verified:true,
        reason:'Transaction ID পাওয়া গেছে। Payment Confirmed.'
      };
    }
  }

  return {
    verified:false,
    reason:'এই Transaction ID Google Sheet-এ পাওয়া যায়নি।'
  };
}

function verifyResponse_(result, callback) {
  const data = {
    verified: !!result.verified,
    orderId: result.orderId || '',
    reason: result.reason || ''
  };
  // JSONP is used for browser-side verification because a normal cross-origin
  // fetch/XHR is blocked by Apps Script CORS. A script tag can safely receive
  // this read-only verification response without an iframe/postMessage race.
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(data) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return htmlResponse_(
    '<script>window.parent.postMessage({type:"safe-care-verify",verified:' +
    JSON.stringify(data.verified) + ',orderId:' + JSON.stringify(data.orderId) + ',reason:' + JSON.stringify(data.reason) + '}, "*");</script>' +
    '<div style="font-family:Arial,sans-serif;padding:16px">' +
    (data.verified ? '<b style="color:#087443">✓ Payment Verified</b>' : '<b style="color:#b42318">✕ Payment Match হয়নি</b>') +
    '</div>'
  );
}

function handleSmsWebhook_(e) {
  if (e.parameter.smsKey !== SMS_WEBHOOK_SECRET) {
    return jsonResponse_({ok:false,error:'Unauthorized'});
  }

  let body = {};
  try {
    body = JSON.parse((e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonResponse_({ok:false,error:'Invalid JSON'});
  }

  const smsText = String(body.text || body.body || body.message || '').trim();
  const smsFrom = String(body.from || body.source || '').trim();

  if (!smsText) {
    return jsonResponse_({ok:false,error:'Empty SMS'});
  }

  const parsed = parsePaymentSms_(smsText);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(ss, SHEET_NAME);
  ensureHeaders_(sheet);

  // Store the SMS in a separate lightweight log sheet for troubleshooting.
  const smsSheet = getOrCreateSheet_(ss, 'Payment SMS Log');
  ensureSmsHeaders_(smsSheet);
  smsSheet.appendRow([
    new Date(), smsFrom, parsed.amount || '', parsed.senderNumber || '',
    parsed.transactionId || '', smsText, parsed.confidence || 'low'
  ]);

  if (!parsed.amount || !parsed.transactionId) {
    return jsonResponse_({ok:true,verified:false,reason:'Could not parse amount/transaction ID'});
  }

  const result = matchPendingOrders_(sheet, parsed, smsText, smsFrom);
  return jsonResponse_({
    ok:true,
    verified:!!result.verified,
    orderId:result.orderId || '',
    reason:result.reason || ''
  });
}

function parsePaymentSms_(text) {
  const t = normalizeDigits_(text).replace(/\s+/g, ' ').trim();

  // Amount: handles Tk 350, TK350, BDT 350, টাকা 350, etc.
  let amount = null;
  const amountPatterns = [
    /(?:Tk|TK|BDT|Taka|Amount|টাকা)\s*[:=]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /(?:received|payment|cash\s*in|send\s*money)[^0-9]{0,30}([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i
  ];
  for (let i=0;i<amountPatterns.length;i++) {
    const m = t.match(amountPatterns[i]);
    if (m) { amount = Number(String(m[1]).replace(/,/g,'')); break; }
  }

  // Transaction ID: supports common labels used by mobile-money notifications.
  let transactionId = '';
  const txnPatterns = [
    /(?:TrxID|TxnID|Txn\s*ID|Transaction\s*ID|Trans(?:action)?\s*ID)\s*[:=\-]?\s*([A-Za-z0-9\-]{4,40})/i,
    /(?:trx|txn)\s*[:=\-]\s*([A-Za-z0-9\-]{4,40})/i
  ];
  for (let i=0;i<txnPatterns.length;i++) {
    const m = t.match(txnPatterns[i]);
    if (m) { transactionId = normalizeTxn_(m[1]); break; }
  }

  // Sender number: prefer a number appearing after "from/sender".
  let senderNumber = '';
  const senderPatterns = [
    /(?:from|sender|sent\s+by|received\s+from)\s*[:\-]?\s*(01\d{9}|8801\d{9})/i,
    /(?:from|sender|sent\s+by|received\s+from)\s*[:\-]?\s*(\+?8801\d{9})/i
  ];
  for (let i=0;i<senderPatterns.length;i++) {
    const m = t.match(senderPatterns[i]);
    if (m) { senderNumber = normalizePhone_(m[1]); break; }
  }

  // Fallback: collect phone-looking numbers and choose one that is not the configured receiving number.
  // Since the site asks the customer for the sender number, matching later is exact.
  if (!senderNumber) {
    const nums = t.match(/(?:\+?88)?01\d{9}/g) || [];
    if (nums.length === 1) senderNumber = normalizePhone_(nums[0]);
    else if (nums.length > 1) {
      // Prefer the first number in an incoming notification. Exact order matching will reject wrong numbers.
      senderNumber = normalizePhone_(nums[0]);
    }
  }

  let confidence = 'low';
  if (amount && transactionId && senderNumber) confidence = 'high';
  else if (amount && transactionId) confidence = 'medium';

  return {amount:amount, transactionId:transactionId, senderNumber:senderNumber, confidence:confidence};
}

function matchPendingOrderAgainstSmsLog_(sheet, orderId) {
  const smsSheet = getOrCreateSheet_(sheet.getParent(), 'Payment SMS Log');
  ensureSmsHeaders_(smsSheet);
  const idx = headerIndexes_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {verified:false,reason:'No order rows'};

  const rows = sheet.getRange(2,1,lastRow-1,sheet.getLastColumn()).getValues();
  let target = null;
  for (let r = rows.length - 1; r >= 0; r--) {
    if (String(rows[r][idx.orderId] || '') === String(orderId) &&
        String(rows[r][idx.status] || '') === 'Pending Payment Verification') {
      target = {rowNumber:r+2,row:rows[r]};
      break;
    }
  }
  if (!target) return {verified:false,reason:'Order not pending'};

  const orderTxn = normalizeTxn_(target.row[idx.transactionId] || '');
  if (!orderTxn) return {verified:false,reason:'Missing transaction ID'};

  // IMPORTANT: only Transaction ID is checked. No amount, sender number,
  // payment method, or duplicate-order check is performed.
  const result = findTransactionIdInSmsLog_(smsSheet, orderTxn);
  if (!result.verified) return result;

  // Find the matching SMS row only so the order can store its verification
  // source/raw SMS. The verification decision itself is still transaction-ID-only.
  const logLastRow = smsSheet.getLastRow();
  if (logLastRow >= 2) {
    const logs = smsSheet.getRange(2,1,logLastRow-1,7).getValues();
    for (let i = logs.length - 1; i >= 0; i--) {
      if (normalizeTxn_(logs[i][4] || '') !== orderTxn) continue;
      sheet.getRange(target.rowNumber, idx.status + 1).setValue('Payment Verified');
      sheet.getRange(target.rowNumber, idx.verifiedAt + 1).setValue(new Date());
      sheet.getRange(target.rowNumber, idx.smsSource + 1).setValue(String(logs[i][1] || ''));
      sheet.getRange(target.rowNumber, idx.smsRaw + 1).setValue(String(logs[i][5] || ''));
      return {verified:true, orderId:String(orderId), reason:'Transaction ID matched'};
    }
  }
  return {verified:true, orderId:String(orderId), reason:'Transaction ID matched'};
}

function matchPendingOrders_(sheet, parsedSms, rawSmsText, smsFrom) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {verified:false,reason:'No pending orders'};
  if (!parsedSms || !parsedSms.transactionId) return {verified:false,reason:'No transaction ID in SMS'};

  const smsTxn = normalizeTxn_(parsedSms.transactionId);
  if (!smsTxn) return {verified:false,reason:'Missing transaction ID'};

  const values = sheet.getRange(2,1,lastRow-1,Math.max(16,sheet.getLastColumn())).getValues();
  const idx = headerIndexes_(sheet);

  // Incoming SMS automatically verifies any pending order with the same
  // Transaction ID. Nothing else is compared.
  for (let r = values.length - 1; r >= 0; r--) {
    const row = values[r];
    if (String(row[idx.status] || '').trim() !== 'Pending Payment Verification') continue;
    const orderTxn = normalizeTxn_(row[idx.transactionId] || '');
    if (!orderTxn || orderTxn !== smsTxn) continue;

    const rowNumber = r + 2;
    sheet.getRange(rowNumber, idx.status + 1).setValue('Payment Verified');
    sheet.getRange(rowNumber, idx.verifiedAt + 1).setValue(new Date());
    sheet.getRange(rowNumber, idx.smsSource + 1).setValue(String(smsFrom || ''));
    sheet.getRange(rowNumber, idx.smsRaw + 1).setValue(String(rawSmsText || ''));
    return {verified:true,orderId:String(row[idx.orderId] || ''),reason:'Transaction ID matched'};
  }

  return {verified:false,reason:'No pending order with this Transaction ID'};
}

function paymentMethodMatchesSms_(paymentMethod, from, text) {
  const method = String(paymentMethod || '').toLowerCase();
  const s = (String(from) + ' ' + String(text)).toLowerCase();
  const clearlyBkash = s.includes('bkash') || String(from).includes('16247');
  const clearlyNagad = s.includes('nagad') || s.includes('নগদ') || String(from).includes('16167');

  if (method.includes('bkash') && clearlyNagad && !clearlyBkash) return false;
  if (method.includes('nagad') && clearlyBkash && !clearlyNagad) return false;
  return true;
}

function isLikelyBkashSms_(from, text) {
  const s = (String(from) + ' ' + String(text)).toLowerCase();
  return s.includes('bkash') || String(from).includes('16247');
}

function isLikelyNagadSms_(from, text) {
  const s = (String(from) + ' ' + String(text)).toLowerCase();
  return s.includes('nagad') || String(from).includes('16167');
}

function getOrCreateSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  const current = sheet.getRange(1,1,1,Math.max(sheet.getLastColumn(),1)).getValues()[0].map(String);
  HEADERS.forEach(function(h){
    if (current.indexOf(h) === -1) {
      sheet.getRange(1, sheet.getLastColumn()+1).setValue(h);
    }
  });
  sheet.setFrozenRows(1);
}

function ensureSmsHeaders_(sheet) {
  const headers = ['Received At','SMS From','Amount','Sender Number','Transaction ID','Raw SMS','Parser Confidence'];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function headerIndexes_(sheet) {
  const h = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String);
  function ix(name){
    const i = h.indexOf(name);
    if (i < 0) throw new Error('Missing sheet column: ' + name);
    return i;
  }
  return {
    orderId:ix('Order ID'), status:ix('Status'), amount:ix('Amount (BDT)'),
    paymentMethod:ix('Payment Method'), senderNumber:ix('Payment Sender Number'),
    transactionId:ix('Transaction ID'), verifiedAt:ix('Payment Verified At'),
    smsSource:ix('SMS Source'), smsRaw:ix('SMS Raw Text')
  };
}

function buildRow_(timestamp, orderId, status, payload, screenshotUrl, senderNumber, transactionId) {
  return [
    timestamp,
    orderId,
    status,
    String(payload.customerName || ''),
    String(payload.phone || ''),
    String(payload.pageUrl || ''),
    Number(payload.packageFollowers || 0),
    Number(payload.amount || 0),
    String(payload.paymentMethod || ''),
    screenshotUrl,
    String(payload.source || 'Safe Care Landing Page'),
    senderNumber,
    transactionId,
    '',
    '',
    ''
  ];
}


function normalizeDigits_(value) {
  const s = String(value == null ? '' : value);
  const map = {'০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9'};
  return s.replace(/[০-৯]/g, function(ch){return map[ch] || ch;});
}

function normalizePhone_(value) {
  let s = normalizeDigits_(value).replace(/[^0-9]/g,'');
  // Normalize common Bangladesh mobile formats to the same 11-digit form.
  // SMS parsers sometimes store 017xxxxxxxx as 17xxxxxxxx (leading 0 dropped).
  if (s.startsWith('8801') && s.length === 13) s = '0' + s.slice(3);
  if (s.startsWith('88') && s.length === 13 && s.slice(2,4) === '01') s = s.slice(2);
  if (s.length === 10 && s.startsWith('1')) s = '0' + s;
  if (s.length === 11 && s.startsWith('1')) s = '0' + s;
  return s;
}

function normalizeTxn_(value) {
  return normalizeDigits_(value).toString().trim().toUpperCase().replace(/[^A-Z0-9\-]/g,'');
}

function saveScreenshot_(dataUrl, filename, orderId) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid screenshot format');
  const contentType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const bytes = Utilities.base64Decode(match[2]);
  const blob = Utilities.newBlob(bytes, contentType, filename);
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
  const file = folder.createFile(blob);
  file.setDescription('Safe Care payment screenshot for order ' + orderId);
  return file.getUrl();
}

function htmlResponse_(message) {
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body>' + message + '</body></html>'
  );
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml_(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
