'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, type Session } from '@/lib/api';
import { localDate, type Policy } from '@/lib/workforce';
import { Alert, Field } from './ui/field';
import { Button } from './ui/button';
import { DataTable, SectionHeading, useAction } from './workforce';
type Report = {
  policy: Policy;
  rows: {
    employeeId: string;
    name: string;
    observedSeconds: number;
    activeSeconds: number;
    screenshots: number;
  }[];
  screenshots: { id: string; name: string; capturedAt: string }[];
};
type Device = { id: string; name: string; expiresAt: string; paired: boolean };
export function Tracking({ session }: { session: Session }) {
  const [day, setDay] = useState(localDate(session.company.timezone)),
    [report, setReport] = useState<Report | null>(null),
    [devices, setDevices] = useState<Device[]>([]),
    [name, setName] = useState('My computer'),
    [code, setCode] = useState('');
  const load = useCallback(async () => {
    const [r, d] = await Promise.all([
      api<Report>(`/tracking/report?day=${day}`),
      api<Device[]>('/tracking/devices'),
    ]);
    setReport(r);
    setDevices(d);
  }, [day]);
  const { error, setError, notice, busy, act } = useAction(load);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load, setError]);
  return (
    <>
      <SectionHeading
        title="Work activity"
        description={`Desktop activity and screenshots · ${session.company.timezone}`}
      >
        <Field label="Activity date">
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </SectionHeading>
      <Alert message={error} />
      <Alert message={notice} success />
      <section className="card work-card">
        <div className="work-toolbar">
          <h2>Connect the desktop app</h2>
          <span
            className={`badge ${report?.policy.trackingEnabled ? 'badge-green' : 'badge-muted'}`}
          >
            {report?.policy.trackingEnabled ? 'Tracking enabled' : 'Tracking disabled'}
          </span>
        </div>
        <p>
          Open HRMS Desktop supports Windows, macOS, and Linux. Pair your computer, check in on the
          Attendance page, then choose Start tracking in the desktop app. Closing or pausing the app
          stops collection.
        </p>
        <p className="muted">
          {report?.policy.screenshotsEnabled
            ? `Screenshots are enabled at intervals of ${report.policy.screenshotIntervalMinutes} minutes while tracking. You select which display to share.`
            : 'Screenshots are disabled by your administrator.'}{' '}
          Records are retained for {report?.policy.retentionDays ?? 7} days. Employees see their own
          records; HR and administrators can review team records. Activity is sampled computer
          interaction, not a measure of output, and does not affect payroll.
        </p>
        <form
          className="work-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const result = await api<{ code: string }>('/tracking/pair', 'POST', { name });
              setCode(result.code);
            }, 'Pairing code created. It expires in 5 minutes.');
          }}
        >
          <Field label="Device name">
            <input
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Button disabled={busy || !report?.policy.trackingEnabled}>Create pairing code</Button>
        </form>
        {code && (
          <div className="pair-code">
            <Field
              label="One-time pairing code"
              hint="Paste this into your desktop app. Keep it private; it grants access to your tracking account."
            >
              <input readOnly value={code} onFocus={(e) => e.target.select()} />
            </Field>
            <Button variant="outline" onClick={() => setCode('')}>
              Hide code
            </Button>
          </div>
        )}
        <DataTable headers={['My devices', 'Status', 'Expires', 'Manage']} empty={!devices.length}>
          {devices.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td>{d.paired ? 'Paired' : 'Awaiting pairing'}</td>
              <td>{new Date(d.expiresAt).toLocaleString()}</td>
              <td>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    act(() => api(`/tracking/devices/${d.id}`, 'DELETE'), 'Device access revoked.')
                  }
                >
                  Revoke
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
        <p className="muted">
          Desktop source and launch instructions are in the repository’s desktop directory. Signed
          installers are not published yet.
        </p>
      </section>
      <section className="card work-card">
        <div className="work-toolbar">
          <h2>{session.user.role === 'EMPLOYEE' ? 'My activity' : 'Team activity'}</h2>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => act(async () => {}, 'Activity refreshed.')}
          >
            Refresh activity
          </Button>
        </div>
        <DataTable
          headers={['Employee', 'Observed time', 'Active estimate', 'Active share', 'Screenshots']}
          empty={!report?.rows.length}
        >
          {report?.rows.map((r) => (
            <tr key={r.employeeId}>
              <td>{r.name}</td>
              <td>{(r.observedSeconds / 3600).toFixed(2)} h</td>
              <td>{(r.activeSeconds / 3600).toFixed(2)} h</td>
              <td>{Math.round((r.activeSeconds / r.observedSeconds) * 100)}%</td>
              <td>{r.screenshots}</td>
            </tr>
          ))}
        </DataTable>
        <p className="muted">
          Every 30 seconds, the desktop app samples whether recent keyboard or mouse interaction
          occurred. Idle time, meetings, and offline work do not establish employee performance.
        </p>
      </section>
      <section className="card work-card">
        <h2>Recent screenshots</h2>
        <p className="muted">
          Up to 100 recent captures for the selected day. Select a capture to view it at full size.
        </p>
        <div className="screenshot-grid">
          {report?.screenshots.map((s) => (
            <a
              key={s.id}
              href={`/api/tracking/screenshots/${s.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={`/api/tracking/screenshots/${s.id}`}
                alt={`Work screen shared by ${s.name}`}
                loading="lazy"
              />
              <strong>{s.name}</strong>
              <small>
                {new Date(s.capturedAt).toLocaleString(undefined, {
                  timeZone: session.company.timezone,
                })}
              </small>
            </a>
          ))}
        </div>
        {!report?.screenshots.length && (
          <p className="empty-small">No screenshots for this date.</p>
        )}
      </section>
    </>
  );
}
