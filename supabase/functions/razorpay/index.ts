// Supabase Edge Function: online payments through Razorpay (OPTIONAL — off until configured).
// Secrets needed (Supabase → Edge Functions → Secrets):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
// Deploy:  supabase functions deploy razorpay --no-verify-jwt
// The payment is recorded ONLY after the signature from Razorpay is verified on the server.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')
  const KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')
  if (!KEY_ID || !KEY_SECRET) return json({ error: 'Online payments are not configured yet.' }, 503)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({}))
  const { data: settings } = await admin.from('settings').select('data').eq('id', 1).single()
  if (!settings?.data?.gateway_enabled) return json({ error: 'Online payments are switched off.' }, 403)

  const { data: order } = await admin.from('orders').select('*')
    .eq('order_number', String(body.order_number || '').toUpperCase().trim())
    .eq('phone', (await admin.rpc('normalize_phone', { p: body.phone })).data)
    .maybeSingle()
  if (!order) return json({ error: 'Order not found' }, 404)
  if (['cancelled', 'refunded', 'refund_pending', 'completed'].includes(order.status)) return json({ error: 'Order is closed' }, 400)
  if (order.quote_status === 'pending') return json({ error: 'Please wait for the baker to approve your custom design.' }, 400)

  if (body.action === 'create') {
    const due = order.amount_paid < order.advance_due ? order.advance_due - order.amount_paid : order.total - order.amount_paid
    if (due <= 0) return json({ error: 'Nothing to pay' }, 400)
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(`${KEY_ID}:${KEY_SECRET}`) },
      body: JSON.stringify({ amount: due * 100, currency: 'INR', receipt: order.order_number, notes: { order_number: order.order_number } }),
    })
    const rz = await r.json()
    if (!r.ok) return json({ error: rz?.error?.description || 'Could not start payment' }, 502)
    await admin.from('orders').update({ gateway_order_id: rz.id }).eq('id', order.id)
    return json({ key_id: KEY_ID, razorpay_order_id: rz.id, amount: rz.amount, currency: 'INR', name: order.customer_name })
  }

  if (body.action === 'verify') {
    const expected = await hmacHex(KEY_SECRET, `${body.razorpay_order_id}|${body.razorpay_payment_id}`)
    if (expected !== body.razorpay_signature || body.razorpay_order_id !== order.gateway_order_id) {
      await admin.from('payments').insert({ order_id: order.id, method: 'gateway', amount: 0, status: 'failed', reference: null, note: 'Signature mismatch' })
      return json({ error: 'Payment could not be verified' }, 400)
    }
    // fetch the captured amount from Razorpay (never trust the browser for the amount)
    const pr = await fetch(`https://api.razorpay.com/v1/payments/${body.razorpay_payment_id}`, { headers: { Authorization: 'Basic ' + btoa(`${KEY_ID}:${KEY_SECRET}`) } })
    const pay = await pr.json()
    if (!pr.ok || !['captured', 'authorized'].includes(pay.status)) return json({ error: 'Payment not captured yet' }, 400)
    const { error } = await admin.from('payments').insert({
      order_id: order.id, kind: order.amount_paid >= order.advance_due ? 'balance' : 'advance', method: 'gateway',
      amount: Math.round(pay.amount / 100), reference: body.razorpay_payment_id, status: 'verified', note: 'Razorpay (verified)',
    })
    if (error && !String(error.message).includes('duplicate')) return json({ error: error.message }, 500)
    return json({ ok: true })
  }
  return json({ error: 'Unknown action' }, 400)
})
