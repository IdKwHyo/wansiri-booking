import Link from 'next/link';
import {AuthForm} from './forms';
import {authConfigured} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export default function Login() {
  return <main className="auth-page"><section className="auth-card"><Link href="/" className="auth-brand"><span>+</span> Clinic / Bookings</Link><p className="eyebrow">STAFF ACCESS</p><h1>Welcome back</h1><p>Sign in to your clinic schedule.</p>{authConfigured()?<><AuthForm/><p className="auth-note">Need an account or a password reset? Contact your clinic administrator.</p></>:<p role="alert" className="auth-error">Clinic setup is not complete. Please contact your administrator.</p>}</section></main>;
}
