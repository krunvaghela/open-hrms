'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Building2, Mail, Send, Save, ShieldCheck, LockKeyhole } from 'lucide-react';
import { api, type Session } from '@/lib/api';
import { Button } from './ui/button';
import { Field, Alert } from './ui/field';

type Smtp = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromName: string;
  fromEmail: string;
  hasPassword: boolean;
};
export function Settings({ session, onSaved }: { session: Session; onSaved: () => Promise<void> }) {
  const [tab, setTab] = useState('company');
  const [smtp, setSmtp] = useState<Smtp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (tab === 'email') {
      setLoading(true);
      api<Smtp | null>('/settings/email')
        .then(setSmtp)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [tab]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (tab === 'company') {
        await api('/settings/company', 'PUT', data);
        await onSaved();
      } else {
        await api('/settings/email', 'PUT', {
          ...data,
          port: Number(data.port),
          secure: data.secure === 'true',
          clearPassword: data.clearPassword === 'on',
        });
        setSmtp(await api<Smtp | null>('/settings/email'));
        (event.target as HTMLFormElement).querySelector<HTMLInputElement>(
          'input[name="password"]',
        )!.value = '';
      }
      setSuccess(
        tab === 'company'
          ? 'Company details saved.'
          : 'Email settings saved. You can now send a test email.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await api<{ recipient: string }>('/settings/email/test', 'POST');
      setSuccess(`Test email sent to ${result.recipient}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE, YOUR WAY</span>
          <h1>Workspace settings</h1>
          <p>The details that make this space yours.</p>
        </div>
        <span className="badge badge-blue">
          <ShieldCheck size={14} /> Super Admin access
        </span>
      </div>
      <div className="settings-layout">
        <aside className="settings-nav">
          <button
            onClick={() => {
              setTab('company');
              setError('');
              setSuccess('');
            }}
            className={tab === 'company' ? 'selected' : ''}
          >
            <Building2 size={18} /> Company details
          </button>
          <button
            onClick={() => {
              if (tab !== 'email') setLoading(true);
              setTab('email');
              setError('');
              setSuccess('');
            }}
            className={tab === 'email' ? 'selected' : ''}
          >
            <Mail size={18} /> Email provider
          </button>
        </aside>
        <section className="card settings-card">
          <div className="card-heading">
            <div>
              <h2>{tab === 'company' ? 'Company details' : 'Email provider'}</h2>
              <p>
                {tab === 'company'
                  ? 'Your company information appears across your workspace.'
                  : 'Connect your SMTP provider from one place.'}
              </p>
            </div>
            <span className="icon-tile">
              {tab === 'company' ? <Building2 size={21} /> : <Mail size={21} />}
            </span>
          </div>
          <Alert message={error} />
          <Alert message={success} success />
          {loading ? (
            <p className="loading-inline">Loading email settings…</p>
          ) : (
            <form onSubmit={save} key={tab} className="settings-form">
              {tab === 'company' ? (
                <>
                  <Field label="Company name">
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={100}
                      defaultValue={session.company.name}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field label="State / region">
                      <input name="state" maxLength={200} defaultValue={session.company.state} />
                    </Field>
                    <Field label="City">
                      <input name="city" maxLength={200} defaultValue={session.company.city} />
                    </Field>
                  </div>
                  <Field label="Registered address">
                    <textarea
                      name="address"
                      maxLength={500}
                      rows={3}
                      defaultValue={session.company.address}
                    />
                  </Field>
                  <Field label="Timezone">
                    <input
                      name="timezone"
                      required
                      defaultValue={session.company.timezone}
                      placeholder="Asia/Kolkata"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <div className="provider-label">
                    <span className="icon-tile">
                      <Mail size={22} />
                    </span>
                    <div>
                      <strong>Custom SMTP</strong>
                      <p>Use your existing email provider.</p>
                    </div>
                    <span className={`badge ${smtp ? 'badge-green' : 'badge-muted'}`}>
                      {smtp ? 'Configured' : 'Not configured'}
                    </span>
                  </div>
                  <div className="form-grid">
                    <Field label="SMTP host">
                      <input
                        name="host"
                        required
                        maxLength={253}
                        defaultValue={smtp?.host}
                        placeholder="smtp.example.com"
                      />
                    </Field>
                    <Field label="Port">
                      <input
                        name="port"
                        type="number"
                        min={1}
                        max={65535}
                        required
                        defaultValue={smtp?.port || 587}
                      />
                    </Field>
                    <Field label="Encryption">
                      <select name="secure" defaultValue={String(smtp?.secure ?? false)}>
                        <option value="false">STARTTLS (usually port 587)</option>
                        <option value="true">TLS (usually port 465)</option>
                      </select>
                    </Field>
                    <Field label="Username">
                      <input
                        name="username"
                        maxLength={254}
                        autoComplete="off"
                        defaultValue={smtp?.username}
                      />
                    </Field>
                  </div>
                  <Field
                    label="SMTP password"
                    hint={
                      smtp?.hasPassword
                        ? 'A password is saved. Leave blank to keep it.'
                        : 'Your credentials are encrypted before being stored.'
                    }
                  >
                    <input
                      name="password"
                      type="password"
                      maxLength={1000}
                      autoComplete="new-password"
                      placeholder={
                        smtp?.hasPassword ? '••••••••••••' : 'Provider password or app password'
                      }
                    />
                  </Field>
                  {smtp?.hasPassword && (
                    <label className="checkbox-label">
                      <input type="checkbox" name="clearPassword" /> Remove the saved password
                    </label>
                  )}
                  <div className="form-grid">
                    <Field label="Sender name">
                      <input
                        name="fromName"
                        required
                        minLength={2}
                        maxLength={100}
                        defaultValue={smtp?.fromName || session.company.name}
                      />
                    </Field>
                    <Field label="Sender email">
                      <input
                        name="fromEmail"
                        type="email"
                        required
                        maxLength={254}
                        defaultValue={smtp?.fromEmail}
                        placeholder="hr@company.com"
                      />
                    </Field>
                  </div>
                  <div className="subtle-note">
                    <LockKeyhole size={16} /> Test emails go only to your signed-in account:{' '}
                    {session.user.email}
                  </div>
                </>
              )}
              <div className="settings-footer">
                {tab === 'email' && (
                  <Button type="button" variant="outline" disabled={busy || !smtp} onClick={test}>
                    <Send size={16} /> Send test email
                  </Button>
                )}
                <Button disabled={busy}>
                  <Save size={16} />
                  {busy ? 'Please wait…' : 'Save changes'}
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
    </>
  );
}

export function PasswordForm() {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    const form = event.currentTarget;
    try {
      await api('/auth/password', 'POST', Object.fromEntries(new FormData(form)));
      form.reset();
      setSuccess('Password updated. Your other sessions have been signed out.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card settings-card">
      <div className="card-heading">
        <div>
          <h2>Account security</h2>
          <p>Keep your workspace account protected.</p>
        </div>
        <ShieldCheck size={22} />
      </div>
      <form onSubmit={submit} className="settings-form">
        <Alert message={error} />
        <Alert message={success} success />
        <Field label="Current password">
          <input
            name="currentPassword"
            type="password"
            required
            maxLength={128}
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password" hint="Use at least 12 characters.">
          <input
            name="newPassword"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </Field>
        <div className="settings-footer">
          <Button disabled={busy}>{busy ? 'Updating…' : 'Update password'}</Button>
        </div>
      </form>
    </section>
  );
}
