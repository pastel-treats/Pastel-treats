// LIVE adapter — talks to your Supabase project. Activated when VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY are set.
import { createClient } from '@supabase/supabase-js'

export function createLiveApi(url, key) {
  const sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  const must = ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  }
  const rpcJson = async (fn, args) => {
    const data = must(await sb.rpc(fn, args))
    if (data && data.error) throw new Error(data.error)
    return data
  }
  const keyOf = (table) => (table === 'blackout_dates' ? 'day' : table === 'admins' ? 'user_id' : 'id')

  return {
    mode: 'live',
    async loadStore() {
      const [s, c, p, a, t, z] = await Promise.all([
        sb.from('settings').select('data').eq('id', 1).maybeSingle(),
        sb.from('categories').select('*').order('sort'),
        sb.from('products').select('*').order('sort'),
        sb.from('addons').select('*').order('sort'),
        sb.from('time_slots').select('*').order('sort'),
        sb.from('delivery_zones').select('*').order('sort'),
      ])
      return { settings: must(s)?.data || {}, categories: must(c), products: must(p), addons: must(a), slots: must(t), zones: must(z) }
    },
    availability: (from, to, productIds = [], mode = 'pickup') =>
      rpcJson('get_availability', { p_from: from, p_to: to, p_products: productIds, p_mode: mode }),
    quote: (payload) => rpcJson('quote_order', { p: payload }),
    placeOrder: (payload) => rpcJson('place_order', { p: payload }),
    async uploadFile(kind, file) {
      const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
      const path = `${kind}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
      must(await sb.storage.from('order-uploads').upload(path, file, { contentType: file.type, upsert: false }))
      return path
    },
    getOrder: (number, phone) => rpcJson('get_order', { p_number: number, p_phone: phone }),
    submitProof: (number, phone, reference, path, amount) =>
      rpcJson('submit_payment_proof', { p_number: number, p_phone: phone, p_reference: reference, p_proof_path: path, p_amount: amount }),

    // ---- customer accounts (OTP) ----
    async sendOtp({ email, phone }) {
      must(await sb.auth.signInWithOtp(email ? { email, options: { shouldCreateUser: true } } : { phone, options: { shouldCreateUser: true } }))
      return { hint: null }
    },
    async verifyOtp({ email, phone, token }) {
      must(await sb.auth.verifyOtp(email ? { email, token, type: 'email' } : { phone, token, type: 'sms' }))
    },
    async session() {
      const { data } = await sb.auth.getSession()
      return data.session ? { email: data.session.user.email, phone: data.session.user.phone } : null
    },
    async signOut() { await sb.auth.signOut() },
    myProfile: () => rpcJson('my_profile', {}),
    saveOccasion: (p) => rpcJson('my_save_occasion', { p }),
    updateProfile: (p) => rpcJson('my_update_profile', { p }),

    // ---- optional online payments (Razorpay edge function) ----
    async gateway(body) {
      const { data, error } = await sb.functions.invoke('razorpay', { body })
      if (error) throw new Error(data?.error || error.message)
      if (data?.error) throw new Error(data.error)
      return data
    },

    // ---- admin ----
    async signIn(email, password) { must(await sb.auth.signInWithPassword({ email, password })) },
    // returns true when signed in straight away, false when a confirmation e-mail was sent
    async signUp(email, password) {
      const data = must(await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/?pt-confirm=1` } }))
      return !!data?.session
    },
    async adminSignOut() { await sb.auth.signOut() },
    // "Forgot password?" → e-mail with a link back to this site (?pt-reset=1 opens the new-password page)
    async resetPassword(email) { must(await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/?pt-reset=1` })) },
    // Deleting customer data: a one-time code is e-mailed to the bakery account first
    async sendDeleteCode(email) { must(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })) },
    async verifyDeleteCode(email, token) { must(await sb.auth.verifyOtp({ email, token: String(token).trim(), type: 'email' })) },
    deleteCustomer: (id) => rpcJson('admin_delete_customer', { p_id: id }),
    async recoveryReady() { const { data } = await sb.auth.getSession(); return !!data.session },
    async updatePassword(password) { must(await sb.auth.updateUser({ password })) },
    async adminState() {
      const { data } = await sb.auth.getUser()
      if (!data.user) return { user: null, isAdmin: false }
      const { data: row } = await sb.from('admins').select('role').eq('user_id', data.user.id).maybeSingle()
      return { user: { id: data.user.id, email: data.user.email }, isAdmin: !!row, role: row?.role || null }
    },
    claimFirstAdmin: () => rpcJson('claim_first_admin', {}),
    async list(table, { order = 'created_at', asc = false, limit = 5000 } = {}) {
      let q = sb.from(table).select('*').limit(limit)
      if (order) q = q.order(order, { ascending: asc })
      return must(await q)
    },
    async insert(table, row) { return must(await sb.from(table).insert(row).select().single()) },
    async update(table, id, patch) { return must(await sb.from(table).update(patch).eq(keyOf(table), id).select().single()) },
    async remove(table, id) { must(await sb.from(table).delete().eq(keyOf(table), id)) },
    async setStatus(orderId, status, note) { must(await sb.rpc('admin_set_status', { p_order: orderId, p_status: status, p_note: note || null })) },
    async saveSettings(data) { must(await sb.from('settings').upsert({ id: 1, data, updated_at: new Date().toISOString() })) },
    async fileUrl(path) {
      if (!path) return null
      if (/^(https?:|data:|\/)/.test(path)) return path
      const { data } = await sb.storage.from('order-uploads').createSignedUrl(path, 3600)
      return data?.signedUrl || null
    },
    async uploadProductImage(file) {
      const path = `products/${crypto.randomUUID()}.${(file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`
      must(await sb.storage.from('product-images').upload(path, file, { contentType: file.type }))
      return sb.storage.from('product-images').getPublicUrl(path).data.publicUrl
    },
  }
}
