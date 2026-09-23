'use client';
import {useActionState} from 'react';
import {signIn,changePassword,type AuthState} from './actions';
export function AuthForm({mode='login'}:{mode?:'login'|'password'}) {
  const [state,action,pending]=useActionState<AuthState,FormData>(mode==='login'?signIn:changePassword,{});
  return <form action={action} className="auth-form">
    {mode==='login'&&<label>Email address<input type="email" name="email" autoComplete="username" required maxLength={254} autoFocus disabled={pending}/></label>}
    <label>{mode==='login'?'Password':'New password'}<input type="password" name="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?1:12} maxLength={128} disabled={pending}/></label>
    {mode==='password'&&<label>Confirm new password<input type="password" name="confirmation" autoComplete="new-password" required minLength={12} maxLength={128} disabled={pending}/></label>}
    {state.error&&<p role="alert" className="auth-error">{state.error}</p>}
    {state.message&&<p role="status">{state.message}</p>}
    <button type="submit" disabled={pending}>{pending?'Please wait…':mode==='login'?'Sign in':'Update password'}</button>
  </form>;
}
