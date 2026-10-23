// The ONLY e-mail allowed into the baker's dashboard (the database enforces the same rule).
export const ADMIN_EMAIL = 'pasteltreatsdgl@gmail.com'
export const isAdminEmail = (e) => String(e || '').trim().toLowerCase() === ADMIN_EMAIL

const KEY = 'pt-admin-email'
export function savedAdminEmail() { try { return localStorage.getItem(KEY) || '' } catch { return '' } }
export function rememberAdminEmail(e, on) { try { on ? localStorage.setItem(KEY, e) : localStorage.removeItem(KEY) } catch { /* private mode */ } }
