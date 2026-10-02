'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, employeeId, type Session } from '@/lib/api';
import {
  csv,
  digits,
  download,
  localDate,
  money,
  type Component,
  type PayRow,
  type Policy,
  type Run,
  type Salary,
  type Snapshot,
} from '@/lib/workforce';
import { Button } from './ui/button';
import { Alert, Field } from './ui/field';
import { Dialog } from './ui/dialog';
import { DataTable, SectionHeading, Status, useAction } from './workforce';
type Slip = {
  month: string;
  company: Snapshot['company'];
  policy: Policy;
  row: PayRow;
  finalizedAt: string;
};
export function ComponentsEditor({
  value,
  onChange,
  currency,
}: {
  value: Component[];
  onChange: (v: Component[]) => void;
  currency: string;
}) {
  const factor = 10 ** digits(currency);
  const change = (i: number, patch: Partial<Component>) =>
    onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="component-editor">
      {value.map((c, i) => (
        <fieldset key={i} className="component-row">
          <legend>Component {i + 1}</legend>
          <div className="form-grid">
            <Field label="Component name">
              <input
                required
                maxLength={60}
                value={c.name}
                onChange={(e) => change(i, { name: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <select
                value={c.kind}
                onChange={(e) => change(i, { kind: e.target.value as Component['kind'] })}
              >
                <option value="EARNING">Earning</option>
                <option value="DEDUCTION">Deduction</option>
              </select>
            </Field>
            <Field label={`Amount (${currency})`}>
              <input
                required
                type="number"
                min="0"
                max={1_000_000_000 / factor}
                step={1 / factor}
                value={c.amountMinor / factor}
                onChange={(e) =>
                  change(i, { amountMinor: Math.round(Number(e.target.value) * factor) })
                }
              />
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                checked={c.prorate}
                onChange={(e) => change(i, { prorate: e.target.checked })}
              />
              Prorate by paid days
            </label>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(value.filter((_, j) => i !== j))}
          >
            Remove component {i + 1}
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={value.length >= 20}
        onClick={() =>
          onChange([...value, { name: '', kind: 'EARNING', amountMinor: 0, prorate: true }])
        }
      >
        Add component
      </Button>
    </div>
  );
}
export function Payroll({
  session,
  view,
}: {
  session: Session;
  view: 'roster' | 'salaries' | 'payslips';
}) {
  const [month, setMonth] = useState(localDate(session.company.timezone).slice(0, 7)),
    [policy, setPolicy] = useState<Policy | null>(null),
    [run, setRun] = useState<Run | null>(null),
    [salaries, setSalaries] = useState<Salary[]>([]),
    [slips, setSlips] = useState<
      { month: string; currency: string; netMinor: string; finalizedAt: string }[]
    >([]),
    [editing, setEditing] = useState<Salary | null>(null),
    [components, setComponents] = useState<Component[]>([]),
    [effectiveMonth, setEffectiveMonth] = useState(month),
    [endDate, setEndDate] = useState(''),
    [finalize, setFinalize] = useState(false),
    [slip, setSlip] = useState<Slip | null>(null),
    [adjust, setAdjust] = useState<PayRow | null>(null),
    [reason, setReason] = useState('');
  const manager = session.user.role !== 'EMPLOYEE';
  const [loading, setLoading] = useState(true);
  const loadVersion = useRef(0);
  const validMonth = /^20\d{2}-(0[1-9]|1[0-2])$/.test(month);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    if (view !== 'payslips' && !validMonth) {
      setLoading(false);
      return;
    }
    try {
      const p = await api<{ policy: Policy }>('/workforce/policy');
      const result =
        view === 'roster' && manager
          ? { run: await api<Run | null>(`/payroll/${month}`) }
          : view === 'salaries' && manager
            ? { salaries: await api<Salary[]>(`/payroll/salaries?month=${month}`) }
            : view === 'payslips'
              ? { slips: await api<typeof slips>('/payroll/payslips') }
              : {};
      if (version !== loadVersion.current) return;
      setPolicy(p.policy);
      if ('run' in result) setRun(result.run!);
      if ('salaries' in result) setSalaries(result.salaries!);
      if ('slips' in result) setSlips(result.slips!);
    } catch (e) {
      if (version === loadVersion.current) throw e;
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [month, view, manager, validMonth]);
  const { error, setError, notice, busy, act } = useAction(load);
  useEffect(() => {
    setError('');
    setRun(null);
    setSalaries([]);
    setSlips([]);
    load().catch((e) => setError(e.message));
    return () => {
      loadVersion.current++;
    };
  }, [load, setError]);
  const currency = run?.snapshot.policy.currency ?? policy?.currency ?? 'USD';
  const publishBlocker = !run?.snapshot.rows.length
    ? 'There are no employees in this payroll.'
    : run.snapshot.rows.some((row) => row.issues.length)
      ? 'Resolve the issues listed in the salary roster, then recalculate the draft before publishing.'
      : month >= localDate(session.company.timezone).slice(0, 7)
        ? 'This month is still open. Payroll can be finalized after the month ends.'
        : '';
  const openSlip = (id: string, m = month) =>
    act(async () => setSlip(await api<Slip>(`/payroll/payslips/${m}/${id}`)), 'Payslip ready.');
  if (!manager && view !== 'payslips')
    return <Alert message="Salary roster access is limited to HR and administrators." />;
  function exportRoster() {
    if (!run) return;
    download(
      `salary-roster-${month}.csv`,
      csv([
        [
          'Month',
          'Status',
          'Currency',
          'Employee ID',
          'Name',
          'Department',
          'Divisor',
          'Eligible days',
          'Paid days',
          'Unpaid days',
          'Earnings',
          'Deductions',
          'Net pay',
          'Issues',
        ],
        ...run.snapshot.rows.map((r) => [
          month,
          run.status,
          currency,
          employeeId(r.employeeNumber),
          r.name,
          r.department,
          r.divisor,
          r.eligibleDays,
          r.paidDays,
          r.unpaidDays,
          (r.earningsMinor / 10 ** digits(currency)).toFixed(digits(currency)),
          (r.deductionsMinor / 10 ** digits(currency)).toFixed(digits(currency)),
          (r.netMinor / 10 ** digits(currency)).toFixed(digits(currency)),
          r.issues.join('; '),
        ]),
      ]),
    );
  }
  return (
    <>
      <SectionHeading
        title={
          view === 'roster'
            ? 'Salary roster'
            : view === 'salaries'
              ? 'Salary structures'
              : 'My payslips'
        }
        description={
          view === 'roster'
            ? 'Review the month, resolve exceptions, and publish payslips.'
            : view === 'salaries'
              ? 'Set effective-dated earnings, deductions, and employment end dates.'
              : 'Your published monthly salary statements, ready to download.'
        }
      >
        {view !== 'payslips' && (
          <Field label="Payroll month">
            <input
              type="month"
              required
              value={month}
              onChange={(e) => {
                loadVersion.current++;
                setRun(null);
                setSalaries([]);
                setLoading(true);
                setMonth(e.target.value);
              }}
            />
          </Field>
        )}
      </SectionHeading>
      <div className="work-tabs">
        {manager && (
          <>
            <Link className={view === 'roster' ? 'active' : ''} href="/payroll">
              Salary roster
            </Link>
            <Link className={view === 'salaries' ? 'active' : ''} href="/salaries">
              Salary structures
            </Link>
          </>
        )}
        <Link className={view === 'payslips' ? 'active' : ''} href="/payslips">
          My payslips
        </Link>
      </div>
      <Alert message={error} />
      <Alert message={notice} success />
      {loading && (
        <p role="status" className="loading-inline">
          Loading payroll records…
        </p>
      )}
      {!validMonth && view !== 'payslips' && (
        <p className="empty-small">Select a payroll month to continue.</p>
      )}
      {view === 'salaries' && (
        <section className="card work-card">
          <p className="muted">
            Amounts are in {policy?.currency}. Add local tax, social insurance, and other deductions
            as named amounts. Statutory tax calculations and filings are not automated.
          </p>
          <DataTable
            headers={[
              'Employee',
              'Effective from',
              'Monthly earnings',
              'Monthly deductions',
              'Last employment day',
              'Manage',
            ]}
            empty={!salaries.length}
          >
            {salaries.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.name}
                  <small className="cell-sub">{employeeId(s.employeeNumber)}</small>
                </td>
                <td>{s.effectiveMonth ?? 'Not configured'}</td>
                <td>
                  {s.components
                    ? money(
                        s.components
                          .filter((c) => c.kind === 'EARNING')
                          .reduce((sum, c) => sum + c.amountMinor, 0),
                        s.currency!,
                      )
                    : '—'}
                </td>
                <td>
                  {s.components
                    ? money(
                        s.components
                          .filter((c) => c.kind === 'DEDUCTION')
                          .reduce((sum, c) => sum + c.amountMinor, 0),
                        s.currency!,
                      )
                    : '—'}
                </td>
                <td>{s.endDate ?? 'Ongoing'}</td>
                <td>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setError('');
                      setEditing(s);
                      setComponents(
                        (s.currency === policy?.currency ? s.components : null) ?? [
                          { name: 'Base salary', kind: 'EARNING', amountMinor: 0, prorate: true },
                        ],
                      );
                      setEffectiveMonth(month);
                      setEndDate(s.endDate ?? '');
                    }}
                  >
                    Set salary
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        </section>
      )}
      {view === 'roster' && (
        <>
          <section className="card work-card work-toolbar">
            <div>
              <h2>
                {month} payroll {run && <Status value={run.status} />}
              </h2>
              <p>
                {run
                  ? `Last calculated ${new Date(run.updatedAt).toLocaleString()}`
                  : 'Generate a draft from salary structures, attendance, and approved leave.'}
              </p>
            </div>
            <div className="work-actions">
              {run?.status !== 'FINALIZED' && (
                <Button
                  disabled={busy || loading || !validMonth || !policy}
                  onClick={() =>
                    act(
                      () => api(`/payroll/${month}/generate`, 'POST'),
                      'Draft calculated. Review every row before finalizing.',
                    )
                  }
                >
                  {run ? 'Recalculate draft' : 'Generate salary roster'}
                </Button>
              )}
              {run && (
                <Button variant="outline" onClick={exportRoster}>
                  Export salary sheet
                </Button>
              )}
              {run?.status === 'DRAFT' && ['SUPER_ADMIN', 'ADMIN'].includes(session.user.role) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setError('');
                    setFinalize(true);
                  }}
                >
                  Finalize payroll
                </Button>
              )}
            </div>
          </section>
          {run && (
            <>
              <div className="work-stats">
                {[
                  ['Gross earnings', run.snapshot.totals.earningsMinor],
                  ['Deductions', run.snapshot.totals.deductionsMinor],
                  ['Net payable', run.snapshot.totals.netMinor],
                ].map(([label, value]) => (
                  <article className="card work-stat" key={label}>
                    <span>{label}</span>
                    <strong>{money(Number(value), currency)}</strong>
                    <small>
                      {run.snapshot.rows.length} employees · {currency}
                    </small>
                  </article>
                ))}
              </div>
              <section className="card work-card">
                <div className="work-toolbar">
                  <h2>Monthly salary register</h2>
                  <span className="badge badge-blue">
                    {run.snapshot.policy.payrollDivisor === 'WORKING_DAYS'
                      ? 'Working-day basis'
                      : 'Calendar-day basis'}
                  </span>
                </div>
                <p className="muted">
                  Prorated components = monthly amount × paid days ÷ monthly divisor. Missing
                  attendance is {run.snapshot.policy.missingAttendance.toLowerCase()}. Approved
                  leave takes precedence over attendance. Non-prorated components are paid or
                  deducted in full, including partial months.
                </p>
                <DataTable
                  headers={[
                    'Employee',
                    'Paid / eligible days',
                    'Unpaid days',
                    'Earnings',
                    'Deductions',
                    'Net pay',
                    'Review / payslip',
                  ]}
                  empty={!run.snapshot.rows.length}
                >
                  {run.snapshot.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.name}
                        <small className="cell-sub">
                          {employeeId(r.employeeNumber)} · {r.department || '—'}
                        </small>
                      </td>
                      <td>
                        {r.paidDays} / {r.eligibleDays}
                        <small className="cell-sub">Divisor: {r.divisor}</small>
                      </td>
                      <td>{r.unpaidDays}</td>
                      <td>{money(r.earningsMinor, currency)}</td>
                      <td>{money(r.deductionsMinor, currency)}</td>
                      <td>
                        <strong>{money(r.netMinor, currency)}</strong>
                      </td>
                      <td className="wrap-cell">
                        {r.issues.map((issue, i) => (
                          <small className="issue" key={i}>
                            {issue}
                          </small>
                        ))}
                        {run.status === 'FINALIZED' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => openSlip(r.id)}
                          >
                            View payslip
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAdjust(r);
                              setComponents(
                                (r as PayRow & { adjustmentComponents?: Component[] })
                                  .adjustmentComponents ?? [],
                              );
                              setReason(r.adjustmentReason);
                            }}
                          >
                            Monthly adjustments
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </section>
            </>
          )}
        </>
      )}
      {view === 'payslips' && (
        <section className="card work-card">
          <h2>Published payslips</h2>
          <DataTable headers={['Month', 'Net pay', 'Published', 'Download']} empty={!slips.length}>
            {slips.map((s) => (
              <tr key={s.month}>
                <td>{s.month}</td>
                <td>{money(Number(s.netMinor), s.currency)}</td>
                <td>{new Date(s.finalizedAt).toLocaleDateString()}</td>
                <td>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => openSlip(session.user.id, s.month)}
                  >
                    View payslip
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
          {!slips.length && (
            <p className="empty-small">
              Your payslips appear here after an administrator finalizes payroll.
            </p>
          )}
        </section>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={() => setEditing(null)}
        title={`Salary · ${editing?.name ?? ''}`}
        description="A new effective month preserves previous salary history. Amounts use the current payroll currency."
      >
        {editing && (
          <form
            className="work-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(() =>
                  api(`/payroll/salaries/${editing.id}`, 'PUT', {
                    effectiveMonth,
                    components,
                    endDate: endDate || null,
                  }),
                )
              )
                setEditing(null);
            }}
          >
            <Alert message={error} />
            <Field label="Effective month">
              <input
                required
                type="month"
                value={effectiveMonth}
                onChange={(e) => setEffectiveMonth(e.target.value)}
              />
            </Field>
            <Field
              label="Last employment day"
              hint="Leave blank for ongoing employment. Set this before final payroll for a departing employee."
            >
              <input
                type="date"
                min={editing.joiningDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
            <ComponentsEditor
              value={components}
              onChange={setComponents}
              currency={policy?.currency ?? 'USD'}
            />
            <Button disabled={busy}>Save salary structure</Button>
          </form>
        )}
      </Dialog>
      <Dialog
        open={!!adjust}
        onOpenChange={() => setAdjust(null)}
        title={`Monthly adjustments · ${adjust?.name ?? ''}`}
        description={`One-off earnings or deductions for ${month}. Saving replaces this employee’s adjustments for the month.`}
      >
        {adjust && (
          <form
            className="work-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(async () => {
                  await api(`/payroll/${month}/adjustments/${adjust.id}`, 'PUT', {
                    components,
                    reason,
                  });
                  await api(`/payroll/${month}/generate`, 'POST');
                })
              )
                setAdjust(null);
            }}
          >
            <Alert message={error} />
            <ComponentsEditor value={components} onChange={setComponents} currency={currency} />
            <Field label="Adjustment reason">
              <textarea
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Button disabled={busy}>Save adjustments & recalculate</Button>
          </form>
        )}
      </Dialog>
      <Dialog
        open={finalize}
        onOpenChange={setFinalize}
        title="Finalize this payroll?"
        description="This publishes employee payslips and locks this month’s attendance, leave, and payroll amounts. Review the salary sheet before continuing."
      >
        <Alert message={error || publishBlocker} />
        <p>
          {month} · {run?.snapshot.rows.length} employees ·{' '}
          {money(run?.snapshot.totals.netMinor ?? 0, currency)} net payable
        </p>
        <div className="work-actions">
          <Button
            disabled={busy || loading || !!publishBlocker}
            onClick={async () => {
              if (
                run &&
                (await act(
                  () => api(`/payroll/${month}/finalize`, 'POST', { digest: run.digest }),
                  'Payroll finalized. Payslips are available to employees.',
                ))
              )
                setFinalize(false);
            }}
          >
            Publish & lock payroll
          </Button>
          <Button variant="outline" onClick={() => setFinalize(false)}>
            Keep reviewing
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={!!slip}
        onOpenChange={() => setSlip(null)}
        title={`Payslip · ${slip?.month ?? ''}`}
        description="Published salary statement. Download a copy or print it as a PDF."
      >
        {slip && <Payslip slip={slip} />}
      </Dialog>
    </>
  );
}
function htmlSlip(s: Slip) {
  const escape = (v: unknown) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
  const r = s.row;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Payslip ${escape(s.month)}</title><style>body{font:15px system-ui,sans-serif;color:#17213b;margin:40px auto;padding:24px;max-width:800px}h1{font-size:28px}p{line-height:1.6}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:12px;border-bottom:1px solid #dce4ef}th:last-child,td:last-child{text-align:right}.total{font-size:22px;background:#edf3ff;padding:20px}@media print{body{margin:0;padding:20px}@page{size:A4;margin:15mm}}</style><h1>${escape(s.company.name)}</h1><p>${escape(s.company.address)}<br>${escape(s.company.city)} ${escape(s.company.state)}</p><h2>Payslip · ${escape(s.month)}</h2><p><strong>${escape(r.name)}</strong> · ${escape(employeeId(r.employeeNumber))}<br>${escape(r.designation)} · ${escape(r.department)}<br>Paid days: ${r.paidDays} / eligible days: ${r.eligibleDays} · Unpaid days: ${r.unpaidDays}<br>Monthly divisor: ${r.divisor} · Currency: ${escape(s.policy.currency)}</p><table><thead><tr><th>Component</th><th>Type</th><th>Amount</th></tr></thead><tbody>${r.lines.map((l) => `<tr><td>${escape(l.name)}</td><td>${l.kind === 'EARNING' ? 'Earning' : 'Deduction'}</td><td>${escape(money(l.payableMinor, s.policy.currency))}</td></tr>`).join('')}</tbody></table><p>Gross earnings: ${escape(money(r.earningsMinor, s.policy.currency))}<br>Total deductions: ${escape(money(r.deductionsMinor, s.policy.currency))}</p><p class="total"><strong>Net pay: ${escape(money(r.netMinor, s.policy.currency))}</strong></p>${r.adjustmentReason ? `<p>Adjustment note: ${escape(r.adjustmentReason)}</p>` : ''}<p>Published ${escape(new Date(s.finalizedAt).toLocaleDateString())}. This statement records payroll calculation and is not confirmation of a bank payment.</p></html>`;
}
function Payslip({ slip: s }: { slip: Slip }) {
  return (
    <div className="work-form">
      <div className="payslip-preview">
        <h2>{s.company.name}</h2>
        <h3>
          {s.row.name} · {employeeId(s.row.employeeNumber)}
        </h3>
        <p>
          {s.row.paidDays} paid days · {s.row.unpaidDays} unpaid days
        </p>
        <DataTable headers={['Component', 'Type', 'Amount']}>
          {s.row.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.name}</td>
              <td>{l.kind}</td>
              <td>{money(l.payableMinor, s.policy.currency)}</td>
            </tr>
          ))}
        </DataTable>
        <h2>Net pay: {money(s.row.netMinor, s.policy.currency)}</h2>
      </div>
      <div className="work-actions">
        <Button
          onClick={() =>
            download(
              `payslip-${s.month}-${employeeId(s.row.employeeNumber)}.html`,
              htmlSlip(s),
              'text/html;charset=utf-8',
            )
          }
        >
          Download payslip
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const win = window.open('', '_blank');
            if (win) {
              win.document.write(htmlSlip(s));
              win.document.close();
              win.focus();
              win.print();
            }
          }}
        >
          Print / Save PDF
        </Button>
      </div>
      <p className="muted">
        Downloads as a self-contained HTML statement. Use Print / Save PDF for a PDF copy.
      </p>
    </div>
  );
}
