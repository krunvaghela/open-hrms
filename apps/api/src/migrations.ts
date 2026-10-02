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
];
