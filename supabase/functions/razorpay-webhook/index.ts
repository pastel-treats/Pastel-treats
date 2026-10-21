// Supabase Edge Function: Razorpay webhook (backup confirmation if the customer closes the app mid-payment).
// Secrets: RAZORPAY_WEBHOOK_SECRET
// Deploy:  supabase functions deploy razorpay-webhook --no-verify-jwt
// Razorpay dashboard → Webhooks → URL: https://<project>.supabase.co/functions/v1/razorpay-webhook, event: payment.captured
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
  if (!secret) return new Response('not configured', { status: 503 })
  const raw = await req.text()
  const sig = req.headers.get('x-razorpay-signature') || ''
  if ((await hmacHex(secret, raw)) !== sig) return new Response('bad signature', { status: 401 })

  const evt = JSON.parse(raw)
  if (evt.event !== 'payment.captured') return new Response('ignored')
  const p = evt.payload?.payment?.entity
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: order } = await admin.from('orders').select('id, amount_paid, advance_due').eq('gateway_order_id', p.order_id).maybeSingle()
  if (!order) return new Response('order not found', { status: 200 })
  // unique index on (method, reference) makes this idempotent — duplicates are ignored
  await admin.from('payments').insert({
    order_id: order.id, kind: order.amount_paid >= order.advance_due ? 'balance' : 'advance', method: 'gateway',
    amount: Math.round(p.amount / 100), reference: p.id, status: 'verified', note: 'Razorpay webhook',
  })
  return new Response('ok')
})
