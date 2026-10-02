'use client';
import { useState, type FormEvent } from 'react';
import { UserPlus, Save, ShieldCheck } from 'lucide-react';
import { api, roleLabels, type Employee, type Role } from '@/lib/api';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Field, Alert } from './ui/field';

export function EmployeeDialog({
  employee,
  employees,
  role,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  employees: Employee[];
  role: Role;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { ...data, managerId: data.managerId || null };
    try {
      await api(
        employee ? `/employees/${employee.id}` : '/employees',
        employee ? 'PATCH' : 'POST',
        payload,
      );
      await onSaved();
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const roles: Role[] =
    role === 'SUPER_ADMIN'
      ? ['EMPLOYEE', 'HR', 'ADMIN', 'SUPER_ADMIN']
      : role === 'ADMIN'
        ? ['EMPLOYEE', 'HR']
        : ['EMPLOYEE'];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={employee ? 'Edit employee' : 'A new face, a new beginning.'}
      description={
        employee
          ? 'Keep your employee’s work details up to date.'
          : 'Add an employee and give them access to your workspace.'
      }
    >
      <form onSubmit={submit} className="dialog-form">
        <Alert message={error} />
        <div className="form-section-label">PERSONAL DETAILS</div>
        <div className="form-grid">
          <Field label="Full name">
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              defaultValue={employee?.name}
              placeholder="Full name"
            />
          </Field>
          <Field label="Work email">
            <input
              name={employee ? undefined : 'email'}
              type="email"
              required
              readOnly={!!employee}
              maxLength={254}
              defaultValue={employee?.email}
              placeholder="name@company.com"
            />
          </Field>
          <Field label="Phone number">
            <input
              name="phone"
              type="tel"
              maxLength={30}
              defaultValue={employee?.phone}
              placeholder="+91"
            />
          </Field>
          <Field label="Joining date">
            <input
              name="joiningDate"
              type="date"
              required
              defaultValue={employee?.joiningDate || new Date().toLocaleDateString('en-CA')}
            />
          </Field>
        </div>
        <div className="form-section-label">WORK DETAILS</div>
        <div className="form-grid">
          <Field label="Department">
            <input
              name="department"
              maxLength={200}
              defaultValue={employee?.department}
              placeholder="e.g. Engineering"
              list="department-options"
            />
            <datalist id="department-options">
              {[...new Set(employees.map((e) => e.department).filter(Boolean))].map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Field label="Designation">
            <input
              name="designation"
              maxLength={200}
              defaultValue={employee?.designation}
              placeholder="e.g. Software Engineer"
            />
          </Field>
          <Field label="Employment type">
            <select name="employmentType" defaultValue={employee?.employmentType || 'Full-time'}>
              {['Full-time', 'Part-time', 'Contract', 'Intern'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Employment status">
            <select name="status" defaultValue={employee?.status || 'Active'}>
              {['Active', 'Onboarding', 'Inactive'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Reporting manager">
            <select name="managerId" defaultValue={employee?.managerId || ''}>
              <option value="">No manager assigned</option>
              {employees
                .filter((e) => e.id !== employee?.id)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </Field>
          {!employee && (
            <Field label="Account role">
              <select name="role" defaultValue="EMPLOYEE">
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {!employee && (
          <>
            <div className="form-section-label">WORKSPACE ACCESS</div>
            <Field
              label="Temporary password"
              hint="Share this privately with the employee. They must change it at first sign-in."
            >
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                placeholder="At least 12 characters"
              />
            </Field>
            <div className="subtle-note">
              <ShieldCheck size={16} /> Role permissions are enforced across the workspace.
            </div>
          </>
        )}
        <div className="dialog-footer">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {employee ? <Save size={16} /> : <UserPlus size={16} />}{' '}
            {busy ? 'Saving…' : employee ? 'Save changes' : 'Add employee'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AccessDialog({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(`/users/${employee.id}/access`, 'PATCH', {
        role: data.get('role'),
        active: data.get('active') === 'true',
      });
      await onSaved();
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="Manage account access"
      description={`Update ${employee.name}’s workspace permissions.`}
    >
      <form onSubmit={submit} className="dialog-form">
        <Alert message={error} />
        <Field label="Account role">
          <select name="role" defaultValue={employee.role}>
            {Object.entries(roleLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Account status">
          <select name="active" defaultValue={String(employee.accountActive)}>
            <option value="true">Enabled — can sign in</option>
            <option value="false">Disabled — cannot sign in</option>
          </select>
        </Field>
        <p className="subtle-note">
          Saving signs this account out of all sessions. Employment status is managed separately.
        </p>
        <div className="dialog-footer">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy}>{busy ? 'Saving…' : 'Save access'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
