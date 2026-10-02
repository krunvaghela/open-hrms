export const migrations = [
  {
    id: '001_identity_and_people',
    sql: `
    CREATE TABLE company (
      id integer PRIMARY KEY CHECK (id = 1), name text NOT NULL,
      state text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '',
      address text NOT NULL DEFAULT '', timezone text NOT NULL DEFAULT 'Asia/Kolkata',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE users (
      id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      role text NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','HR','EMPLOYEE')),
      active boolean NOT NULL DEFAULT true,
      must_change_password boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE employees (
      id uuid PRIMARY KEY REFERENCES users(id),
      employee_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
      department text NOT NULL DEFAULT '', designation text NOT NULL DEFAULT '',
      phone text NOT NULL DEFAULT '',
      employment_type text NOT NULL DEFAULT 'Full-time' CHECK (employment_type IN ('Full-time','Part-time','Contract','Intern')),
      status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Onboarding','Inactive')),
      joining_date date NOT NULL,
      manager_id uuid REFERENCES employees(id),
      CHECK (manager_id IS NULL OR manager_id <> id)
    );
    CREATE TABLE sessions (
      token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX sessions_user_idx ON sessions(user_id);
    CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
    CREATE TABLE email_settings (
      id integer PRIMARY KEY CHECK (id = 1), host text NOT NULL, port integer NOT NULL,
      secure boolean NOT NULL, username text NOT NULL DEFAULT '', password_encrypted text,
      from_name text NOT NULL, from_email text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE audit_log (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor_id uuid REFERENCES users(id), action text NOT NULL,
      target_id text, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
    );
  `,
  },
  {
    id: '002_attendance_leave_payroll_tracking',
    sql: `
    ALTER TABLE employees ADD COLUMN end_date date;
    ALTER TABLE employees ADD CONSTRAINT employee_dates CHECK (end_date IS NULL OR end_date >= joining_date);
    CREATE TABLE workforce_policy (id integer PRIMARY KEY CHECK(id=1), data jsonb NOT NULL);
    CREATE TABLE holidays (day date PRIMARY KEY, name text NOT NULL);
    CREATE TABLE attendance (
      employee_id uuid REFERENCES employees(id), day date NOT NULL,
      check_in timestamptz NOT NULL, check_out timestamptz,
      source text NOT NULL DEFAULT 'WEB', PRIMARY KEY(employee_id, day),
      CHECK (check_out IS NULL OR (check_out >= check_in AND check_out <= check_in + interval '24 hours'))
    );
    CREATE UNIQUE INDEX attendance_one_open ON attendance(employee_id) WHERE check_out IS NULL;
    CREATE TABLE attendance_corrections (
      id uuid PRIMARY KEY, employee_id uuid NOT NULL REFERENCES employees(id), day date NOT NULL,
      check_in timestamptz NOT NULL, check_out timestamptz NOT NULL, reason text NOT NULL,
      status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
      reviewed_by uuid REFERENCES users(id), review_note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX correction_pending ON attendance_corrections(employee_id, day) WHERE status='PENDING';
    CREATE TABLE leave_types (
      id uuid PRIMARY KEY, name text NOT NULL UNIQUE, paid boolean NOT NULL,
      annual_days integer NOT NULL CHECK(annual_days BETWEEN 0 AND 366), active boolean NOT NULL DEFAULT true
    );
    CREATE TABLE leave_requests (
      id uuid PRIMARY KEY, employee_id uuid NOT NULL REFERENCES employees(id), type_id uuid NOT NULL REFERENCES leave_types(id),
      start_date date NOT NULL, end_date date NOT NULL, days jsonb NOT NULL, paid boolean NOT NULL,
      reason text NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
      reviewed_by uuid REFERENCES users(id), review_note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (end_date >= start_date)
    );
    CREATE INDEX leave_employee_idx ON leave_requests(employee_id, start_date);
    CREATE TABLE salary_structures (
      employee_id uuid REFERENCES employees(id), effective_month text NOT NULL, currency text NOT NULL,
      components jsonb NOT NULL, PRIMARY KEY(employee_id, effective_month)
    );
    CREATE TABLE payroll_adjustments (
      employee_id uuid REFERENCES employees(id), month text NOT NULL, components jsonb NOT NULL,
      reason text NOT NULL, PRIMARY KEY(employee_id, month)
    );
    CREATE TABLE payroll_runs (
      month text PRIMARY KEY, status text NOT NULL CHECK(status IN ('DRAFT','FINALIZED')), snapshot jsonb NOT NULL,
      digest text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), finalized_by uuid REFERENCES users(id), finalized_at timestamptz
    );
    CREATE TABLE tracker_devices (
      id uuid PRIMARY KEY, employee_id uuid NOT NULL REFERENCES employees(id), name text NOT NULL,
      token_hash text UNIQUE, pair_hash text UNIQUE, expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE tracker_samples (
      id uuid PRIMARY KEY, employee_id uuid NOT NULL REFERENCES employees(id), device_id uuid REFERENCES tracker_devices(id) ON DELETE SET NULL,
      captured_at timestamptz NOT NULL DEFAULT now(), active_seconds integer NOT NULL CHECK(active_seconds BETWEEN 0 AND 30),
      screenshot bytea
    );
    CREATE INDEX tracker_employee_time ON tracker_samples(employee_id, captured_at);
    `,
  },
];
