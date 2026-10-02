'use client';
import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Layers3,
  ShieldCheck,
  UsersRound,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import { Field, Alert } from './ui/field';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Layers3 size={22} />
      </span>
      {!compact && (
        <span>
          Open <strong>HRMS</strong>
          <small>PEOPLE FIRST, ALWAYS.</small>
        </span>
      )}
    </div>
  );
}
export function AuthScreen({
  setup = false,
  passwordChange = false,
}: {
  setup?: boolean;
  passwordChange?: boolean;
}) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [values, setValues] = useState({
    company: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    state: '',
    city: '',
    name: '',
    email: '',
    password: '',
    currentPassword: '',
  });
  const update = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues({ ...values, [key]: event.target.value });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (setup && step === 1) {
      setStep(2);
      return;
    }
    setBusy(true);
    try {
      if (passwordChange)
        await api('/auth/password', 'POST', {
          currentPassword: values.currentPassword,
          newPassword: values.password,
        });
      else if (setup)
        await api('/auth/setup', 'POST', {
          company: {
            name: values.company,
            state: values.state,
            city: values.city,
            timezone: values.timezone,
          },
          name: values.name,
          email: values.email,
          password: values.password,
        });
      else await api('/auth/login', 'POST', { email: values.email, password: values.password });
      window.location.assign('/');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="story-main">
          <span className="eyebrow">
            <span className="dot" /> A LITTLE LESS ADMIN. A LOT MORE HUMAN.
          </span>
          <h1>
            Good work starts
            <br />
            with <em>your people.</em>
          </h1>
          <p>
            A considered space for your team.
            <br />
            Bring everyday HR together, beautifully.
          </p>
          <div className="story-illustration" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="illustration-card">
              <div className="illustration-icon">
                <UsersRound size={31} />
              </div>
              <div className="mini-lines">
                <span />
                <span />
              </div>
              <div className="illustration-avatars">
                <b>AK</b>
                <b>PM</b>
                <b>RS</b>
                <b>+</b>
              </div>
              <div className="illustration-divider" />
              <div className="mini-check">
                <Check size={14} /> A place for everyone
              </div>
            </div>
            <div className="floating-tag">
              <Sparkles size={16} /> People, connected.
            </div>
          </div>
        </div>
        <div className="story-footer">
          <ShieldCheck size={16} /> Your company. Your data. Your workspace.
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-top">
          <span>
            {setup
              ? 'LET’S GET YOU STARTED'
              : passwordChange
                ? 'ACCOUNT SECURITY'
                : 'WELCOME TO YOUR WORKSPACE'}
          </span>
          <span className="tiny-pill">Open source</span>
        </div>
        <div className="auth-form-wrap">
          {setup && (
            <div className="setup-progress">
              <span className={step === 1 ? 'current' : 'done'}>
                {step === 2 ? <Check size={13} /> : 1}
              </span>
              <i />
              <span className={step === 2 ? 'current' : ''}>2</span>
              <small>{step === 1 ? 'Company details' : 'Your account'}</small>
            </div>
          )}
          <h2>
            {setup
              ? step === 1
                ? 'Make room for your team.'
                : 'Meet your first Super Admin.'
              : passwordChange
                ? 'Make this account yours.'
                : 'Welcome back.'}
          </h2>
          <p>
            {setup
              ? step === 1
                ? 'Create your company workspace. You can fine-tune the details later.'
                : 'Create your account to manage people, access, and company settings.'
              : passwordChange
                ? 'Replace your temporary password to enter your workspace.'
                : 'Sign in to pick up where you left off.'}
          </p>
          <form onSubmit={submit} className="auth-form">
            <Alert message={error} />
            {setup && step === 1 ? (
              <>
                <Field label="Company name">
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="e.g. Ayelite Technologies"
                    value={values.company}
                    onChange={update('company')}
                    autoFocus
                    autoComplete="organization"
                  />
                </Field>
                <div className="form-grid">
                  <Field label="State / region">
                    <input
                      maxLength={200}
                      placeholder="e.g. Gujarat"
                      value={values.state}
                      onChange={update('state')}
                    />
                  </Field>
                  <Field label="City">
                    <input
                      maxLength={200}
                      placeholder="e.g. Ahmedabad"
                      value={values.city}
                      onChange={update('city')}
                    />
                  </Field>
                </div>
                <Field
                  label="Company timezone"
                  hint="IANA timezone used for attendance dates and payroll periods."
                >
                  <input
                    required
                    value={values.timezone}
                    onChange={update('timezone')}
                    placeholder="Europe/London"
                  />
                </Field>
                <div className="info-strip">
                  <span className="info-icon">
                    <ShieldCheck size={18} />
                  </span>
                  <span>
                    Built for teams everywhere
                    <small>Configure currency and work policies after setup.</small>
                  </span>
                </div>
              </>
            ) : (
              <>
                {setup && (
                  <Field label="Your full name">
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      value={values.name}
                      onChange={update('name')}
                      autoComplete="name"
                      placeholder="Your name"
                      autoFocus
                    />
                  </Field>
                )}
                {!passwordChange && (
                  <Field label="Work email">
                    <input
                      type="email"
                      required
                      maxLength={254}
                      value={values.email}
                      onChange={update('email')}
                      autoComplete="username"
                      placeholder="you@company.com"
                    />
                  </Field>
                )}
                {passwordChange && (
                  <Field label="Current password">
                    <input
                      type="password"
                      required
                      maxLength={128}
                      value={values.currentPassword}
                      onChange={update('currentPassword')}
                      autoComplete="current-password"
                    />
                  </Field>
                )}
                <Field
                  label={passwordChange ? 'New password' : 'Password'}
                  hint={
                    setup || passwordChange
                      ? 'Use at least 12 characters. A memorable passphrase works well.'
                      : undefined
                  }
                >
                  <span className="password-input">
                    <input
                      type={show ? 'text' : 'password'}
                      required
                      minLength={setup || passwordChange ? 12 : 1}
                      maxLength={128}
                      value={values.password}
                      onChange={update('password')}
                      autoComplete={setup || passwordChange ? 'new-password' : 'current-password'}
                      placeholder={setup ? 'Create a strong password' : 'Enter your password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      aria-label={show ? 'Hide password' : 'Show password'}
                    >
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </Field>
              </>
            )}
            <Button type="submit" disabled={busy} className="auth-submit">
              {busy
                ? 'Please wait…'
                : setup
                  ? step === 1
                    ? 'Continue'
                    : 'Create workspace'
                  : passwordChange
                    ? 'Save password & continue'
                    : 'Sign in'}
              <ArrowRight size={17} />
            </Button>
            {setup && step === 2 && (
              <Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={busy}>
                <ArrowLeft size={16} /> Back to company details
              </Button>
            )}
          </form>
          <p className="auth-note">
            {setup
              ? 'You’ll have full control as the workspace Super Admin.'
              : passwordChange
                ? 'Your other sessions will be signed out.'
                : 'Need access? Ask your company’s HR or administrator.'}
          </p>
        </div>
        <footer className="auth-footer">
          Thoughtfully built for the way your team works.
          <span>Open HRMS © {new Date().getFullYear()}</span>
        </footer>
      </section>
    </main>
  );
}
