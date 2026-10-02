'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, employeeId, type Session } from '@/lib/api';
import { localDate, type Policy } from '@/lib/workforce';
import { Button } from './ui/button';
import { Alert, Field } from './ui/field';
import { Dialog } from './ui/dialog';

export function SectionHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">YOUR EVERYDAY HR ESSENTIALS</span>
        <h1>
          {title}
          <span className="heading-dot">.</span>
        </h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function DataTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={headers.length}>No records for this period.</td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={`badge ${['APPROVED', 'FINALIZED'].includes(value) ? 'badge-green' : value === 'PENDING' || value === 'DRAFT' ? 'badge-amber' : 'badge-muted'}`}
    >
      {value.replaceAll('_', ' ')}
    </span>
  );
}
export function useAction(reload: () => Promise<void>) {
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  async function act(work: () => Promise<unknown>, message = 'Changes saved.') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      await reload();
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { error, setError, notice, busy, act };
}
type AttendanceRow = {
  employeeId: string;
  name: string;
  day: string;
  checkIn: string;
  checkOut: string | null;
  minutes: number | null;
  source: string;
};
type Correction = {
  id: string;
  employeeId: string;
  name: string;
  day: string;
  checkIn: string;
  checkOut: string;
  reason: string;
  status: string;
  reviewNote: string;
};
type AttendanceData = {
  rows: AttendanceRow[];
  corrections: Correction[];
  today: string;
  current: { day: string; checkIn: string; checkOut: string | null } | null;
};
export function Attendance({ session }: { session: Session }) {
  const [month, setMonth] = useState(localDate(session.company.timezone).slice(0, 7)),
    [data, setData] = useState<AttendanceData | null>(null),
    [open, setOpen] = useState(false),
    [review, setReview] = useState<{ id: string; status: string } | null>(null);
  const [day, setDay] = useState(localDate(session.company.timezone)),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [reason, setReason] = useState(''),
    [note, setNote] = useState('');
  const load = useCallback(
    async () => setData(await api<AttendanceData>(`/workforce/attendance?month=${month}`)),
    [month],
  );
  const { error, setError, notice, busy, act } = useAction(load);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load, setError]);
  const format = (v: string | null) =>
    v
      ? new Date(v).toLocaleString(undefined, {
          timeZone: session.company.timezone,
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Open shift';
  return (
    <>
      <SectionHeading
        title="Attendance"
        description={`Daily check-in, working hours, and corrections · ${session.company.timezone}`}
      >
        <Field label="Attendance month">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
      </SectionHeading>
      <Alert message={error} />
      <Alert message={notice} success />
      <section className="card work-card work-toolbar">
        <div>
          <h2>Your workday</h2>
          <p>
            {data?.current
              ? `${format(data.current.checkIn)} — ${format(data.current.checkOut)}`
              : 'Ready when you are. Check in to start your day.'}
          </p>
        </div>
        <div className="work-actions">
          <Button
            disabled={busy || !data || !!data.current}
            onClick={() => act(() => api('/workforce/attendance/check-in', 'POST'), 'Checked in.')}
          >
            Check in
          </Button>
          <Button
            variant="outline"
            disabled={busy || !data?.current || !!data.current.checkOut}
            onClick={() =>
              act(() => api('/workforce/attendance/check-out', 'POST'), 'Checked out.')
            }
          >
            Check out
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setError('');
              setReason('');
              setStart('');
              setEnd('');
              setOpen(true);
            }}
          >
            Request correction
          </Button>
        </div>
      </section>
      <section className="card work-card">
        <h2>{session.user.role === 'EMPLOYEE' ? 'My attendance' : 'Team attendance'}</h2>
        <DataTable
          headers={['Employee', 'Date', 'Check-in', 'Check-out', 'Hours', 'Source']}
          empty={!data?.rows.length}
        >
          {data?.rows.map((r) => (
            <tr key={r.employeeId + r.day}>
              <td>{r.name}</td>
              <td>{r.day}</td>
              <td>{format(r.checkIn)}</td>
              <td>{format(r.checkOut)}</td>
              <td>{r.minutes === null ? '—' : (r.minutes / 60).toFixed(2)}</td>
              <td>{r.source}</td>
            </tr>
          ))}
        </DataTable>
      </section>
      <section className="card work-card">
        <h2>Correction requests</h2>
        <DataTable
          headers={['Employee / date', 'Requested shift', 'Reason', 'Status', 'Review']}
          empty={!data?.corrections.length}
        >
          {data?.corrections.map((r) => (
            <tr key={r.id}>
              <td>
                {r.name}
                <small className="cell-sub">{r.day}</small>
              </td>
              <td>
                {format(r.checkIn)}
                <small className="cell-sub">to {format(r.checkOut)}</small>
              </td>
              <td className="wrap-cell">
                {r.reason}
                <small className="cell-sub">{r.reviewNote}</small>
              </td>
              <td>
                <Status value={r.status} />
              </td>
              <td>
                {r.status === 'PENDING' &&
                  session.user.role !== 'EMPLOYEE' &&
                  (session.user.id !== r.employeeId || session.user.role === 'SUPER_ADMIN') && (
                    <div className="work-actions">
                      <Button
                        size="sm"
                        onClick={() => {
                          setNote('');
                          setReview({ id: r.id, status: 'APPROVED' });
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setNote('');
                          setReview({ id: r.id, status: 'REJECTED' });
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Request attendance correction"
        description="Enter a completed shift. HR will review the reason and update your attendance."
      >
        <form
          className="work-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await act(
                () =>
                  api('/workforce/attendance/corrections', 'POST', {
                    day,
                    checkIn: new Date(start).toISOString(),
                    checkOut: new Date(end).toISOString(),
                    reason,
                  }),
                'Correction submitted.',
              )
            )
              setOpen(false);
          }}
        >
          <Alert message={error} />
          <Field label="Work date" hint={`Date in ${session.company.timezone}`}>
            <input required type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field
            label="Correct check-in"
            hint={`Time picker uses your computer timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
          >
            <input
              required
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Correct check-out">
            <input
              required
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          <Field label="Reason">
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button disabled={busy}>Submit correction</Button>
        </form>
      </Dialog>
      <ReviewDialog
        open={!!review}
        onClose={() => setReview(null)}
        note={note}
        setNote={setNote}
        busy={busy}
        error={error}
        onSubmit={async () => {
          if (
            review &&
            (await act(() =>
              api(`/workforce/attendance/corrections/${review.id}`, 'PATCH', {
                status: review.status,
                note,
              }),
            ))
          )
            setReview(null);
        }}
      />
    </>
  );
}
export function ReviewDialog({
  open,
  onClose,
  note,
  setNote,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  note: string;
  setNote: (s: string) => void;
  busy: boolean;
  error: string;
  onSubmit: () => Promise<void>;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      title="Record your decision"
      description="A review note will be saved with this request. Super Admins may review their own requests; these decisions are audited."
    >
      <form
        className="work-form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit();
        }}
      >
        <Alert message={error} />
        <Field label="Review note">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            minLength={3}
            maxLength={500}
            required
          />
        </Field>
        <Button disabled={busy}>Confirm decision</Button>
      </form>
    </Dialog>
  );
}
type LeaveRow = {
  id: string;
  employeeId: string;
  name: string;
  typeName: string;
  typeId: string;
  startDate: string;
  endDate: string;
  days: string[];
  paid: boolean;
  reason: string;
  status: string;
  reviewNote: string;
};
type LeaveData = {
  rows: LeaveRow[];
  balances: {
    id: string;
    name: string;
    paid: boolean;
    active: boolean;
    allowance: number;
    used: number;
    pending: number;
  }[];
};
type LeaveType = { id: string; name: string; paid: boolean; annualDays: number; active: boolean };
export function Leave({ session }: { session: Session }) {
  const [year, setYear] = useState(localDate(session.company.timezone).slice(0, 4)),
    [data, setData] = useState<LeaveData | null>(null),
    [open, setOpen] = useState(false),
    [typeId, setTypeId] = useState(''),
    [startDate, setStartDate] = useState(''),
    [endDate, setEndDate] = useState(''),
    [reason, setReason] = useState(''),
    [review, setReview] = useState<{ id: string; status: string } | null>(null),
    [note, setNote] = useState('');
  const load = useCallback(async () => {
    if (!/^20\d{2}$/.test(year)) {
      setData(null);
      return;
    }
    setData(await api<LeaveData>(`/workforce/leave?year=${year}`));
  }, [year]);
  const { error, setError, notice, busy, act } = useAction(load);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load, setError]);
  return (
    <>
      <SectionHeading
        title="Leave management"
        description="Request time away, track balances, and keep approvals in one place."
      >
        <Field label="Leave year">
          <input
            type="number"
            min="2000"
            max="2099"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </Field>
      </SectionHeading>
      <Alert message={error} />
      <Alert message={notice} success />
      <div className="work-toolbar">
        <h2>My balances</h2>
        <Button
          disabled={!data?.balances.some((b) => b.active && b.allowance - b.used - b.pending > 0)}
          onClick={() => {
            setError('');
            setTypeId('');
            setStartDate('');
            setEndDate('');
            setReason('');
            setOpen(true);
          }}
        >
          Request leave
        </Button>
      </div>
      <div className="work-stats">
        {data?.balances.map((b) => (
          <article className="card work-stat" key={b.id}>
            <span>
              {b.name} · {b.paid ? 'Paid' : 'Unpaid'}
            </span>
            <strong>
              {Math.max(0, b.allowance - b.used - b.pending)} <small>days available</small>
            </strong>
            <small>
              {b.used} used · {b.pending} pending · {b.allowance} annual allowance
            </small>
          </article>
        ))}
      </div>
      {data && !data.balances.some((b) => b.active && b.allowance - b.used - b.pending > 0) && (
        <section className="card work-card">
          <h2>
            {data.balances.some((b) => b.active)
              ? 'No leave balance available'
              : 'Leave policies are not configured yet'}
          </h2>
          <p>
            {data.balances.some((b) => b.active)
              ? 'Your available allowance is used or reserved by pending requests for this year.'
              : 'Add an active leave type and annual allowance before submitting a request.'}
          </p>
          {['SUPER_ADMIN', 'ADMIN'].includes(session.user.role) ? (
            <Link className="button button-outline" href="/policies">
              Configure leave policies
            </Link>
          ) : (
            <p>Contact your HR team or administrator for help with your leave allowance.</p>
          )}
        </section>
      )}
      <section className="card work-card">
        <h2>{session.user.role === 'EMPLOYEE' ? 'My requests' : 'Team requests'}</h2>
        <DataTable
          headers={['Employee', 'Leave', 'Dates', 'Days', 'Reason', 'Status', 'Actions']}
          empty={!data?.rows.length}
        >
          {data?.rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>
                {r.typeName}
                <small className="cell-sub">{r.paid ? 'Paid' : 'Unpaid'}</small>
              </td>
              <td>
                {r.startDate}
                <small className="cell-sub">to {r.endDate}</small>
              </td>
              <td>{r.days.length}</td>
              <td className="wrap-cell">
                {r.reason}
                <small className="cell-sub">{r.reviewNote}</small>
              </td>
              <td>
                <Status value={r.status} />
              </td>
              <td>
                <div className="work-actions">
                  {r.status === 'PENDING' &&
                    session.user.role !== 'EMPLOYEE' &&
                    (r.employeeId !== session.user.id || session.user.role === 'SUPER_ADMIN') && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => {
                            setNote('');
                            setReview({ id: r.id, status: 'APPROVED' });
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setNote('');
                            setReview({ id: r.id, status: 'REJECTED' });
                          }}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  {r.employeeId === session.user.id &&
                    ['PENDING', 'APPROVED'].includes(r.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setNote('');
                          setReview({ id: r.id, status: 'CANCELLED' });
                        }}
                      >
                        Cancel leave
                      </Button>
                    )}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Request leave"
        description={`Request whole working days in ${year}. Non-working days and company holidays are excluded. Pending requests reserve your balance.`}
      >
        <form
          className="work-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await act(
                () => api('/workforce/leave', 'POST', { typeId, startDate, endDate, reason }),
                'Leave request submitted.',
              )
            )
              setOpen(false);
          }}
        >
          <Alert message={error} />
          <Field label="Leave type">
            <select required value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Choose leave type</option>
              {data?.balances
                .filter((b) => b.active && b.allowance - b.used - b.pending > 0)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {Math.max(0, b.allowance - b.used - b.pending)} days available
                  </option>
                ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="First day">
              <input
                required
                type="date"
                min={`${year}-01-01`}
                max={`${year}-12-31`}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Last day">
              <input
                required
                type="date"
                min={startDate || `${year}-01-01`}
                max={`${year}-12-31`}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Reason">
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button disabled={busy}>Submit request</Button>
        </form>
      </Dialog>
      <ReviewDialog
        open={!!review}
        onClose={() => setReview(null)}
        note={note}
        setNote={setNote}
        busy={busy}
        error={error}
        onSubmit={async () => {
          if (
            review &&
            (await act(() =>
              api(`/workforce/leave/${review.id}`, 'PATCH', { status: review.status, note }),
            ))
          )
            setReview(null);
        }}
      />
    </>
  );
}
export function Policies({ session }: { session: Session }) {
  const [policy, setPolicy] = useState<Policy | null>(null),
    [types, setTypes] = useState<LeaveType[]>([]),
    [holidays, setHolidays] = useState<{ day: string; name: string }[]>([]),
    [year, setYear] = useState(localDate(session.company.timezone).slice(0, 4)),
    [holiday, setHoliday] = useState({ day: '', name: '' }),
    [editing, setEditing] = useState<LeaveType | null>(null);
  const load = useCallback(async () => {
    const [p, t, h] = await Promise.all([
      api<{ policy: Policy }>('/workforce/policy'),
      api<LeaveType[]>('/workforce/leave-types'),
      api<{ day: string; name: string }[]>(`/workforce/holidays?year=${year}`),
    ]);
    setPolicy(p.policy);
    setTypes(t);
    setHolidays(h);
  }, [year]);
  const { error, setError, notice, busy, act } = useAction(load);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load, setError]);
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user.role))
    return <Alert message="Only administrators can configure HR policies." />;
  return (
    <>
      <SectionHeading
        title="HR policies"
        description="Set the work calendar, payroll basis, leave allowances, and tracking options for your company."
      />
      <Alert message={error} />
      <Alert message={notice} success />
      {policy && (
        <form
          className="card work-card work-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => api('/workforce/policy', 'PUT', policy));
          }}
        >
          <h2>Attendance & payroll</h2>
          <div className="form-grid">
            <Field
              label="Payroll currency"
              hint="One currency per payroll run. After changing it, update salary structures in the new currency."
            >
              <select
                value={policy.currency}
                onChange={(e) => setPolicy({ ...policy, currency: e.target.value })}
              >
                {Intl.supportedValuesOf('currency').map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Payroll divisor">
              <select
                value={policy.payrollDivisor}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    payrollDivisor: e.target.value as Policy['payrollDivisor'],
                  })
                }
              >
                <option value="WORKING_DAYS">Scheduled working days</option>
                <option value="CALENDAR_DAYS">Calendar days (non-working days paid)</option>
              </select>
            </Field>
            <Field label="Full-day threshold (minutes)">
              <input
                required
                type="number"
                min="1"
                max="1440"
                value={policy.fullDayMinutes}
                onChange={(e) => setPolicy({ ...policy, fullDayMinutes: Number(e.target.value) })}
              />
            </Field>
            <Field label="Half-day threshold (minutes)">
              <input
                required
                type="number"
                min="1"
                max={policy.fullDayMinutes}
                value={policy.halfDayMinutes}
                onChange={(e) => setPolicy({ ...policy, halfDayMinutes: Number(e.target.value) })}
              />
            </Field>
            <Field
              label="Days without attendance"
              hint="Applies to scheduled working days without a completed attendance record or approved leave."
            >
              <select
                value={policy.missingAttendance}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    missingAttendance: e.target.value as Policy['missingAttendance'],
                  })
                }
              >
                <option value="UNPAID">Unpaid — require attendance</option>
                <option value="PAID">Paid — deduct approved unpaid leave only</option>
              </select>
            </Field>
          </div>
          <fieldset className="work-days">
            <legend>Scheduled workweek</legend>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
              <label key={d}>
                <input
                  type="checkbox"
                  checked={policy.workDays.includes(i)}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      workDays: e.target.checked
                        ? [...policy.workDays, i].sort()
                        : policy.workDays.filter((v) => v !== i),
                    })
                  }
                />
                {d}
              </label>
            ))}
          </fieldset>
          <h2>Desktop tracking</h2>
          <label className="check-row">
            <input
              type="checkbox"
              checked={policy.trackingEnabled}
              onChange={(e) => setPolicy({ ...policy, trackingEnabled: e.target.checked })}
            />
            Enable optional desktop tracking
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={policy.screenshotsEnabled}
              onChange={(e) => setPolicy({ ...policy, screenshotsEnabled: e.target.checked })}
            />
            Allow screenshots during employee-started tracking
          </label>
          <p className="muted">
            Turning screenshots off deletes stored screenshots. Tracking measures sampled computer
            activity, not work quality, and does not determine pay.
          </p>
          <div className="form-grid">
            <Field label="Screenshot interval (minutes)">
              <input
                type="number"
                min="5"
                max="60"
                required
                value={policy.screenshotIntervalMinutes}
                onChange={(e) =>
                  setPolicy({ ...policy, screenshotIntervalMinutes: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Tracking retention (days)">
              <input
                type="number"
                min="1"
                max="30"
                required
                value={policy.retentionDays}
                onChange={(e) => setPolicy({ ...policy, retentionDays: Number(e.target.value) })}
              />
            </Field>
          </div>
          <p className="muted">
            Leave uses calendar-year allowances without automatic accrual or carryover. Policy
            changes apply to new requests and regenerated drafts; published payroll stays fixed.
            Configure local statutory deductions as salary components.
          </p>
          <Button disabled={busy}>Save HR policies</Button>
        </form>
      )}
      <section className="card work-card">
        <div className="work-toolbar">
          <h2>Leave types & annual allowances</h2>
          <Button
            variant="outline"
            onClick={() =>
              setEditing({
                id: crypto.randomUUID(),
                name: '',
                paid: true,
                annualDays: 0,
                active: true,
              })
            }
          >
            Add leave type
          </Button>
        </div>
        <DataTable
          headers={['Name', 'Pay treatment', 'Days / year', 'Status', 'Manage']}
          empty={!types.length}
        >
          {types.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.paid ? 'Paid' : 'Unpaid'}</td>
              <td>{t.annualDays}</td>
              <td>{t.active ? 'Active' : 'Disabled'}</td>
              <td>
                <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                  Edit
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
      <section className="card work-card">
        <div className="work-toolbar">
          <h2>Company holidays</h2>
          <Field label="Holiday year">
            <input
              type="number"
              min="2000"
              max="2099"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </Field>
        </div>
        <form
          className="work-toolbar"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await act(() =>
                api(`/workforce/holidays/${holiday.day}`, 'PUT', { name: holiday.name }),
              )
            )
              setHoliday({ day: '', name: '' });
          }}
        >
          <Field label="Holiday date">
            <input
              required
              type="date"
              value={holiday.day}
              onChange={(e) => setHoliday({ ...holiday, day: e.target.value })}
            />
          </Field>
          <Field label="Holiday name">
            <input
              required
              minLength={2}
              maxLength={100}
              value={holiday.name}
              onChange={(e) => setHoliday({ ...holiday, name: e.target.value })}
            />
          </Field>
          <Button disabled={busy}>Save holiday</Button>
        </form>
        <DataTable headers={['Date', 'Holiday', 'Manage']} empty={!holidays.length}>
          {holidays.map((h) => (
            <tr key={h.day}>
              <td>{h.day}</td>
              <td>{h.name}</td>
              <td>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => act(() => api(`/workforce/holidays/${h.day}`, 'DELETE'))}
                >
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
      <Dialog
        open={!!editing}
        onOpenChange={() => setEditing(null)}
        title="Leave policy"
        description="Allowance applies per employee per calendar year. Existing requests keep their saved working days and paid/unpaid treatment."
      >
        {editing && (
          <form
            className="work-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const { id, ...body } = editing;
              if (await act(() => api(`/workforce/leave-types/${id}`, 'PUT', body)))
                setEditing(null);
            }}
          >
            <Alert message={error} />
            <Field label="Leave type name">
              <input
                required
                minLength={2}
                maxLength={60}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="Annual allowance (days)">
              <input
                type="number"
                min="0"
                max="366"
                required
                value={editing.annualDays}
                onChange={(e) => setEditing({ ...editing, annualDays: Number(e.target.value) })}
              />
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                checked={editing.paid}
                onChange={(e) => setEditing({ ...editing, paid: e.target.checked })}
              />
              Paid leave
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
              />
              Available for new requests
            </label>
            <Button disabled={busy}>Save leave type</Button>
          </form>
        )}
      </Dialog>
    </>
  );
}
