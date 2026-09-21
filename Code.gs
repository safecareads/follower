/**
 * SAFE CARE ORDER BACKEND
 * Google Apps Script Web App -> Google Sheet + Google Drive
 *
 * 1) Open the Google Sheet you want to use.
 * 2) Extensions -> Apps Script.
 * 3) Replace the default Code.gs with this file.
 * 4) Set SPREADSHEET_ID below.
 * 5) Deploy -> New deployment -> Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 * 6) Copy the /exec URL and paste it into index.html:
 *    action="YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL"
 */

const SPREADSHEET_ID = '1pAVE4Lo-inn0O9Rqez-7Y0yCA8AKChqizkpejzWF6UU';
const SHEET_NAME = 'Orders';
const DRIVE_FOLDER_NAME = 'Safe Care Order Screenshots';

function doGet() {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:30px"><h2>Safe Care Order Backend</h2><p>Backend is running. Submit orders from the landing page.</p></div>'
  );
}

function doPost(e) {
  try {
    const payload = JSON.parse((e.parameter && e.parameter.payload) || '{}');

    // Simple honeypot anti-spam
    if (e.parameter && e.parameter.website) {
      return htmlResponse_('Spam blocked.');
    }

    const required = ['packageFollowers','amount','pageUrl','customerName','phone','paymentMethod'];
    required.forEach(function(k){
      if (payload[k] === undefined || payload[k] === '') throw new Error('Missing field: ' + k);
    });

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getOrCreateSheet_(ss, SHEET_NAME);

    const timestamp = new Date();
    const orderId = 'SC-' + Utilities.formatDate(timestamp, Session.getScriptTimeZone() || 'Asia/Dhaka', 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random()*900+100);

    let screenshotUrl = '';
    const b64 = e.parameter && e.parameter.screenshotBase64;
    const screenshotName = (e.parameter && e.parameter.screenshotName) || ('payment-' + orderId + '.jpg');

    if (b64) {
      screenshotUrl = saveScreenshot_(b64, screenshotName, orderId);
    }

    sheet.appendRow([
      timestamp,
      orderId,
      'Pending Manual Check',
      payload.customerName,
      payload.phone,
      payload.pageUrl,
      Number(payload.packageFollowers),
      Number(payload.amount),
      payload.paymentMethod,
      screenshotUrl,
      payload.source || 'Safe Care Landing Page'
    ]);

    return htmlResponse_(
      '<script>window.parent.postMessage({type:"safe-care-order",status:"ok",orderId:' +
      JSON.stringify(orderId) + '}, "*");</script>' +
      '<div style="font-family:Arial,sans-serif;padding:30px;color:#0b5c4e">' +
      '<h2>Order received</h2><p>Safe Care will manually verify the payment and confirm the order.</p>' +
      '<p>Order ID: <b>' + escapeHtml_(orderId) + '</b></p></div>'
    );
  } catch (err) {
    return htmlResponse_(
      '<script>window.parent.postMessage({type:"safe-care-order",status:"error"}, "*");</script>' +
      '<div style="font-family:Arial,sans-serif;padding:30px;color:#8a1c1c">' +
      '<h2>Submission error</h2><p>Please contact Safe Care with your payment screenshot.</p>' +
      '<small>' + escapeHtml_(String(err)) + '</small></div>'
    );
  }
}

function getOrCreateSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow([
      'Timestamp','Order ID','Status','Customer Name','Phone',
      'Facebook Page/Profile','Followers','Amount (BDT)',
      'Payment Method','Payment Screenshot','Source'
    ]);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp','Order ID','Status','Customer Name','Phone',
      'Facebook Page/Profile','Followers','Amount (BDT)',
      'Payment Method','Payment Screenshot','Source'
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
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
  // Keep the file private by default. The Sheet stores its Drive URL.
  file.setDescription('Safe Care payment screenshot for order ' + orderId);
  return file.getUrl();
}

function htmlResponse_(message) {
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body>' + message + '</body></html>'
  );
}

function escapeHtml_(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}
