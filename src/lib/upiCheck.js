// Checks on the customer's own phone that a picture really is a UPI "payment successful" screenshot
// for the right amount, before it is sent to the baker. Nothing is uploaded for this check.
// The text reader (≈7 MB) is downloaded only the first time someone uploads a payment screenshot.

const SUCCESS = /(success|successful|paid|payment\s*done|completed|money\s*sent|sent\s*to|received|debited|transferred)/i
const UPI = /(upi|utr|txn|transaction|ref(erence)?\s*(no|id|number)?|google\s*pay|g\s*pay|phonepe|paytm|bhim|amazon\s*pay|cred|banking|bank)/i
const FAIL = /(failed|declined|pending|cancelled|canceled|unsuccessful|insufficient)/i

let workerPromise = null
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      const base = new URL('ocr/', location.href.split('#')[0]).href
      return createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base, gzip: true, workerBlobURL: false })
    })().catch((e) => { workerPromise = null; throw e })
  }
  return workerPromise
}

// Screenshots are big: shrink to a readable size first (faster, works on older phones)
async function toCanvas(file) {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  const g = c.getContext('2d')
  g.filter = 'grayscale(1) contrast(1.2)'
  g.drawImage(bmp, 0, 0, c.width, c.height)
  return c
}

// "850" may be written 850, 850.00, 850.0 or ₹850 — with or without a comma (1,700)
function amountFound(text, amount) {
  const n = Math.round(+amount)
  if (!n) return true
  const plain = String(n)
  const comma = n.toLocaleString('en-IN')
  // OCR sometimes reads 0 as O (17OO): an O touching a digit is a zero
  let t = text
  for (let i = 0; i < 4; i++) t = t.replace(/[Oo]/g, (m, at, str) => (/[\d.,]/.test(str[at - 1] || '') && /\d/.test(str[at - 2] || str[at - 1] || '')) || /\d/.test(str[at + 1] || '') ? '0' : m)
  return [plain, comma].some((v) => new RegExp(`(^|[^\\d])${v.replace(/,/g, ',?')}(\\.0{1,2})?([^\\d]|$)`).test(t))
}

/**
 * @returns {Promise<{ ok: boolean, checked: boolean, reason?: string, note: string }>}
 *   ok=false → tell the customer `reason`. checked=false → the reader couldn't run (old phone / no data): accept, baker checks.
 */
export async function checkUpiScreenshot(file, amount, { timeoutMs = 30000, payee = [] } = {}) {
  if (!file || !file.type?.startsWith('image/')) return { ok: false, checked: true, reason: 'Please choose the screenshot image of your payment.', note: 'not an image' }
  try {
    const work = (async () => {
      const [worker, canvas] = await Promise.all([getWorker(), toCanvas(file)])
      const { data } = await worker.recognize(canvas)
      return data.text || ''
    })()
    const text = await Promise.race([work, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))])
    const flat = text.replace(/\s+/g, ' ')
    const hasSuccess = SUCCESS.test(flat)
    const hasUpi = UPI.test(flat) || /[₹]/.test(flat)
    const hasAmount = amountFound(flat, amount)
    const failed = FAIL.test(flat) && !/success/i.test(flat)
    const payeeSeen = payee.filter(Boolean).some((p) => flat.toLowerCase().includes(String(p).toLowerCase().split('@')[0]))
    const note = `Auto-check: ${[hasSuccess && 'success text', hasUpi && 'UPI details', hasAmount && `₹${amount} found`, payeeSeen && 'payee name found', failed && 'FAILED/PENDING text'].filter(Boolean).join(', ') || 'nothing recognised'}`
    if (failed) return { ok: false, checked: true, reason: 'This screenshot shows a payment that failed or is still pending. Please upload the screenshot of a successful payment.', note }
    if (!hasSuccess && !hasUpi) return { ok: false, checked: true, reason: 'This doesn’t look like a UPI payment screenshot. Please upload the “Payment successful” screen from GPay, PhonePe or Paytm.', note }
    if (!hasAmount) return { ok: false, checked: true, reason: `We couldn’t find ₹${Math.round(amount).toLocaleString('en-IN')} on this screenshot. Please upload the screenshot of this payment showing the amount.`, note }
    if (!hasSuccess) return { ok: false, checked: true, reason: 'Please upload the screen that says the payment was successful.', note }
    return { ok: true, checked: true, note }
  } catch (e) {
    // the reader couldn't run here (very old phone, no data, timeout) — don't block a paying customer; the baker checks it
    return { ok: true, checked: false, note: 'Auto-check could not run on this phone' + (e?.message === 'timeout' ? ' (took too long)' : '') }
  }
}

// Start downloading the reader early (e.g. when the customer opens their UPI app), so the check is quick later
export function warmUpUpiCheck() { getWorker().catch(() => {}) }
