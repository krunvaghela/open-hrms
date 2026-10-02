'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronsLeft,
  CircleHelp,
  Clock3,
  Ellipsis,
  FolderHeart,
  LayoutDashboard,
  Layers3,
  LogOut,
  Mail,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  UserRound,
  UserRoundPlus,
  UsersRound,
  X,
} from 'lucide-react';
import {
  api,
  ApiError,
  employeeId,
  initials,
  roleLabels,
  type Activity,
  type Employee,
  type Session,
} from '@/lib/api';
import { Brand, AuthScreen } from './auth-screen';
import { Button } from './ui/button';
import { Alert } from './ui/field';
import { Dialog } from './ui/dialog';
import { EmployeeDialog, AccessDialog } from './employee-dialog';
import { Settings, PasswordForm } from './settings';

export function Avatar({
  name,
  large = false,
  index = 0,
}: {
  name: string;
  large?: boolean;
  index?: number;
}) {
  return (
    <span className={`avatar avatar-${index % 5} ${large ? 'avatar-large' : ''}`}>
      {initials(name)}
    </span>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span
      className={`badge ${value === 'Active' || value === 'Enabled' ? 'badge-green' : value === 'Onboarding' ? 'badge-amber' : 'badge-muted'}`}
    >
      <span className="dot" />
      {value}
    </span>
  );
}
function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function Portal() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchTerm = searchParams.get('search') || '';
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<Employee[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [help, setHelp] = useState(false);
  const [editor, setEditor] = useState<Employee | null | undefined>(undefined);
  const [access, setAccess] = useState<Employee | null>(null);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');
  const [filter, setFilter] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  useEffect(() => {
    setQuery(searchTerm);
  }, [searchTerm]);
  const load = useCallback(async () => {
    try {
      const state = await api<{ configured: boolean }>('/auth/setup');
      setConfigured(state.configured);
      if (!state.configured) {
        setSession(null);
        if (pathname !== '/setup') router.replace('/setup');
        return;
      }
      const current = await api<Session>('/auth/me');
      setSession(current);
      if (current.user.mustChangePassword) {
        if (pathname !== '/password') router.replace('/password');
        return;
      }
      if (['/login', '/setup', '/password'].includes(pathname)) router.replace('/');
      const [employees, events] = await Promise.all([
        api<Employee[]>('/employees'),
        current.user.role === 'EMPLOYEE' ? Promise.resolve([]) : api<Activity[]>('/activity'),
      ]);
      setPeople(employees);
      setActivity(events);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setSession(null);
        if (pathname !== '/login') router.replace('/login');
      } else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [pathname, router]);
  useEffect(() => {
    load();
    setDrawer(false);
  }, [load]);
  async function saved() {
    await load();
    setNotice('Changes saved successfully.');
  }
  async function logout() {
    try {
      await api('/auth/logout', 'POST');
      window.location.assign('/login');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function globalSearch(event: FormEvent) {
    event.preventDefault();
    setQuery(globalQuery);
    router.push(`/employees?search=${encodeURIComponent(globalQuery)}`);
  }
  if (loading)
    return (
      <div className="page-loader">
        <Brand />
        <span className="spinner" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (configured === false) return <AuthScreen setup />;
  if (!session)
    return error ? (
      <div className="page-loader">
        <Brand />
        <Alert message={error} />
        <Button
          onClick={() => {
            setError('');
            load();
          }}
        >
          Try again
        </Button>
      </div>
    ) : (
      <AuthScreen />
    );
  if (session.user.mustChangePassword) return <AuthScreen passwordChange />;
  const canManage = session.user.role !== 'EMPLOYEE';
  const isSuper = session.user.role === 'SUPER_ADMIN';
  const nav = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/employees', label: canManage ? 'Employees' : 'My profile', icon: UsersRound },
    ...(isSuper ? [{ href: '/access', label: 'Roles & access', icon: ShieldCheck }] : []),
  ];
  const departments = [...new Set(people.map((p) => p.department).filter(Boolean))];
  const filtered = people.filter(
    (p) =>
      `${p.name} ${p.email} ${p.designation} ${employeeId(p.employeeNumber)}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (department === 'all' || p.department === department) &&
      (status === 'all' || p.status === status),
  );
  const own = people.find((p) => p.id === session.user.id);
  function exportPeople() {
    const escape = (value: string) =>
      `"${(/^[=+\-@\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
    const rows = [
      [
        'Employee ID',
        'Name',
        'Email',
        'Department',
        'Designation',
        'Employment type',
        'Status',
        'Joining date',
      ],
      ...filtered.map((p) => [
        employeeId(p.employeeNumber),
        p.name,
        p.email,
        p.department,
        p.designation,
        p.employmentType,
        p.status,
        p.joiningDate,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(['\ufeff' + rows.map((r) => r.map(escape).join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8;',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'employees.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className={`workspace ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {drawer && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside className={`sidebar ${drawer ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand compact={collapsed} />
          <button
            className="collapse-button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronsLeft size={16} />
          </button>
          <button className="mobile-close" onClick={() => setDrawer(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <div className="company-switch">
          <span className="company-letter">{initials(session.company.name).slice(0, 1)}</span>
          <span>
            <strong>{session.company.name}</strong>
            <small>Your workspace</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`nav-link ${pathname === item.href ? 'active' : ''}`}
              aria-current={pathname === item.href ? 'page' : undefined}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.href === '/employees' && <small>{people.length}</small>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-icon">
            <FolderHeart size={20} />
          </span>
          <h3>Made for your people.</h3>
          <p>
            A little more connection.
            <br />A little less paperwork.
          </p>
          <div className="sidebar-note-line" />
        </div>
        <div className="sidebar-bottom">
          {isSuper && (
            <Link
              className={`nav-link ${pathname === '/settings' ? 'active' : ''}`}
              href="/settings"
              title="Settings"
            >
              <Settings2 size={20} />
              <span>Settings</span>
            </Link>
          )}
          <button className="nav-link" onClick={() => setHelp(true)} title="Help & support">
            <CircleHelp size={20} />
            <span>Help & support</span>
          </button>
          <button className="nav-link logout" onClick={logout} title="Log out">
            <LogOut size={20} />
            <span>Log out</span>
          </button>
          <div className="sidebar-foot">
            <span className="dot" /> Open source. People first.
          </div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <button
            className="mobile-menu button button-ghost button-icon"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
          <form className="global-search" onSubmit={globalSearch}>
            <Search size={18} />
            <input
              aria-label="Search workspace"
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              placeholder="Search your workspace…"
            />
            <kbd>↵</kbd>
          </form>
          <div className="topbar-right">
            <span className="workspace-status">
              <span className="dot" /> Workspace active
            </span>
            {canManage && (
              <Button size="sm" onClick={() => setEditor(null)}>
                <Plus size={17} /> Add employee
              </Button>
            )}
            <span className="topbar-divider" />
            <Link href="/account" className="account-button">
              <Avatar name={session.user.name} />
              <span>
                <strong>{session.user.name}</strong>
                <small>{roleLabels[session.user.role]}</small>
              </span>
              <ChevronDown size={15} />
            </Link>
          </div>
        </header>
        <div className="page-content" id="main-content" tabIndex={-1}>
          <Alert message={error} />
          {notice && (
            <div className="notice" role="status">
              <Check size={16} />
              {notice}
              <button onClick={() => setNotice('')} aria-label="Dismiss notification">
                <X size={15} />
              </button>
            </div>
          )}
          {pathname === '/' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">A GOOD DAY TO MAKE GOOD THINGS HAPPEN</span>
                  <h1>
                    Your people, at a glance<span className="heading-dot">.</span>
                  </h1>
                  <p>A little clarity for everything that makes your team, your team.</p>
                </div>
                <span className="date-pill">
                  <CalendarDays size={17} />
                  {new Date().toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: session.company.timezone,
                  })}
                </span>
              </div>
              <section className="overview-top">
                <article className="card welcome-card">
                  <div className="card-heading">
                    <h2>
                      <span className="blue-dot" />
                      Your workspace
                    </h2>
                    <span className="badge badge-blue">{roleLabels[session.user.role]}</span>
                  </div>
                  <div className="welcome-body">
                    <div className="profile-avatar">
                      <Avatar name={session.user.name} large />
                      <span>
                        <Check size={12} />
                      </span>
                    </div>
                    <div className="welcome-details">
                      <h3>
                        Welcome, {session.user.name.split(' ')[0]}{' '}
                        <span className="welcome-spark">
                          <Sparkles size={20} />
                        </span>
                      </h3>
                      <p>Great teams start with a place to belong.</p>
                      <div className="profile-mini-grid">
                        <div>
                          <small>Company</small>
                          <strong>{session.company.name}</strong>
                        </div>
                        <div>
                          <small>Work email</small>
                          <strong>{session.user.email}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="welcome-footer">
                    <span>
                      <span className="dot" /> Your workspace is ready to grow
                    </span>
                    <Link href={canManage ? '/employees' : '/account'}>
                      View {canManage ? 'your team' : 'your account'} <ArrowUpRight size={16} />
                    </Link>
                  </div>
                </article>
                <div className="stats-grid">
                  {[
                    {
                      title: canManage ? 'Total employees' : 'Your profile',
                      value: people.length,
                      sub: canManage ? 'People in your workspace' : 'Connected to your workspace',
                      icon: UsersRound,
                      color: 'blue',
                    },
                    {
                      title: 'Active employees',
                      value: people.filter((p) => p.status === 'Active').length,
                      sub: canManage ? 'Growing together' : 'Your employment status',
                      icon: UserCheck,
                      color: 'green',
                    },
                    {
                      title: 'Departments',
                      value: departments.length,
                      sub: 'A place for every skill',
                      icon: Building2,
                      color: 'purple',
                    },
                    {
                      title: 'Onboarding',
                      value: people.filter((p) => p.status === 'Onboarding').length,
                      sub: 'New beginnings',
                      icon: UserRoundPlus,
                      color: 'orange',
                    },
                  ].map((stat) => (
                    <article key={stat.title} className="card stat-card">
                      <div>
                        <span>{stat.title}</span>
                        <stat.icon size={18} className={`stat-icon ${stat.color}`} />
                      </div>
                      <strong>{stat.value.toString().padStart(2, '0')}</strong>
                      <small>{stat.sub}</small>
                    </article>
                  ))}
                </div>
              </section>
              <section className="card people-preview">
                <div className="card-heading">
                  <div>
                    <h2>
                      <span className="blue-dot" />
                      {canManage ? 'The people behind the work' : 'Your employee profile'}
                    </h2>
                    <p>
                      {canManage
                        ? 'A shared space for everyone on your team.'
                        : 'Your work details, all in one place.'}
                    </p>
                  </div>
                  <Link href="/employees" className="text-link">
                    {canManage ? 'View all employees' : 'View profile'}
                    <ArrowRight size={16} />
                  </Link>
                </div>
                <div className="preview-people">
                  {people
                    .slice(-4)
                    .reverse()
                    .map((p, i) => (
                      <Link href="/employees" key={p.id} className="person-card">
                        <Avatar name={p.name} index={i} />
                        <h3>{p.name}</h3>
                        <p>{p.designation || 'Team member'}</p>
                        <span>{p.department || 'Unassigned department'}</span>
                        <Badge value={p.status} />
                      </Link>
                    ))}
                  {canManage && people.length < 4 && (
                    <button className="person-card add-person-card" onClick={() => setEditor(null)}>
                      <span className="add-person-icon">
                        <Plus size={24} />
                      </span>
                      <h3>Room for someone new</h3>
                      <p>Bring your next teammate on board.</p>
                      <span className="text-link">
                        Add employee <ArrowRight size={14} />
                      </span>
                    </button>
                  )}
                </div>
              </section>
              <div className="overview-bottom">
                <section className="card department-card">
                  <div className="card-heading">
                    <div>
                      <h2>Teams that make it happen</h2>
                      <p>Your people, by department.</p>
                    </div>
                    <Building2 size={19} />
                  </div>
                  <div className="department-list">
                    {departments.slice(0, 5).map((d, i) => {
                      const count = people.filter((p) => p.department === d).length;
                      return (
                        <div className="department-row" key={d}>
                          <span className={`department-icon tone-${i % 4}`}>
                            <Layers3 size={17} />
                          </span>
                          <div>
                            <strong>{d}</strong>
                            <div className="bar-track">
                              <span style={{ width: `${(count / people.length) * 100}%` }} />
                            </div>
                          </div>
                          <span>
                            {count} <small>{count === 1 ? 'person' : 'people'}</small>
                          </span>
                        </div>
                      );
                    })}
                    {!departments.length && (
                      <p className="empty-small">Assign departments when you add your team.</p>
                    )}
                  </div>
                </section>
                <section className="card activity-card">
                  <div className="card-heading">
                    <div>
                      <h2>
                        {canManage ? 'Around your workspace' : 'A workspace that grows with you'}
                      </h2>
                      <p>
                        {canManage
                          ? 'The latest updates, in one place.'
                          : 'Your everyday HR essentials.'}
                      </p>
                    </div>
                    <Clock3 size={19} />
                  </div>
                  {canManage ? (
                    <div className="activity-list">
                      {activity.slice(0, 4).map((event) => (
                        <div className="activity-row" key={event.id}>
                          <span className="activity-dot">
                            <Check size={13} />
                          </span>
                          <div>
                            <strong>{activityLabel(event)}</strong>
                            <small>
                              {event.actorName} ·{' '}
                              {new Date(event.createdAt).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="personal-note">
                      <FolderHeart size={34} />
                      <p>
                        Keep your profile current and your account secure. Attendance, leave, and
                        payslips will join your workspace in upcoming releases.
                      </p>
                      <Link href="/account" className="text-link">
                        Manage your account <ArrowRight size={16} />
                      </Link>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {pathname === '/employees' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">GOOD PEOPLE. GREAT POSSIBILITIES.</span>
                  <h1>
                    {canManage ? 'Employee directory' : 'My profile'}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {canManage
                      ? 'Every person, every detail. A little closer together.'
                      : 'Your place in the team, and the details that matter.'}
                  </p>
                </div>
                {canManage && (
                  <Button variant="outline" onClick={exportPeople}>
                    <ArrowDownToLine size={17} /> Export directory
                  </Button>
                )}
              </div>
              {canManage ? (
                <section className="card directory-card">
                  <div className="directory-tabs">
                    <span>
                      All employees <b>{people.length}</b>
                    </span>
                    <small>{departments.length} departments · One team</small>
                  </div>
                  <div className="table-toolbar">
                    <div className="table-search">
                      <Search size={18} />
                      <input
                        aria-label="Search employees"
                        placeholder="Search by name, email or employee ID…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setFilter(!filter)}
                      aria-expanded={filter}
                    >
                      <SlidersHorizontal size={16} /> Filters
                      {(department !== 'all' || status !== 'all') && <span className="blue-dot" />}
                    </Button>
                    <Button onClick={() => setEditor(null)}>
                      <Plus size={17} /> Add employee
                    </Button>
                  </div>
                  {filter && (
                    <div className="filter-row">
                      <label>
                        Department
                        <select
                          aria-label="Department"
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                        >
                          <option value="all">All departments</option>
                          {departments.map((d) => (
                            <option key={d}>{d}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Status
                        <select
                          aria-label="Status"
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                        >
                          <option value="all">All statuses</option>
                          {['Active', 'Onboarding', 'Inactive'].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setDepartment('all');
                          setStatus('all');
                          setQuery('');
                        }}
                      >
                        Reset filters
                      </Button>
                    </div>
                  )}
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Employee ID</th>
                          <th>Department</th>
                          <th>Employment</th>
                          <th>Joining date</th>
                          <th>Status</th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((p, i) => (
                          <tr key={p.id}>
                            <td>
                              <div className="person-cell">
                                <Avatar name={p.name} index={i} />
                                <div>
                                  <strong>{p.name}</strong>
                                  <small>{p.email}</small>
                                </div>
                              </div>
                            </td>
                            <td className="id-cell">{employeeId(p.employeeNumber)}</td>
                            <td>
                              <strong className="cell-primary">
                                {p.department || 'Not assigned'}
                              </strong>
                              <small className="cell-secondary">{p.designation || '—'}</small>
                            </td>
                            <td>{p.employmentType}</td>
                            <td>{formatDate(p.joiningDate)}</td>
                            <td>
                              <Badge value={p.status} />
                            </td>
                            <td>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Edit ${p.name}`}
                                onClick={() => setEditor(p)}
                              >
                                <Pencil size={16} />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!filtered.length && (
                    <div className="empty-state">
                      <Search size={30} />
                      <h3>No employees found</h3>
                      <p>Try a different search or clear your filters.</p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setQuery('');
                          setDepartment('all');
                          setStatus('all');
                        }}
                      >
                        Clear filters
                      </Button>
                    </div>
                  )}
                  <div className="table-footer">
                    <span>
                      Showing {filtered.length} of {people.length} employees
                    </span>
                    <span>Your team, in one place.</span>
                  </div>
                </section>
              ) : (
                own && <Profile employee={own} />
              )}
            </>
          )}
          {pathname === '/access' &&
            (isSuper ? (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">THE RIGHT ACCESS FOR EVERY PERSON</span>
                    <h1>
                      Roles & access<span className="heading-dot">.</span>
                    </h1>
                    <p>Keep your workspace open to your team, and protected where it matters.</p>
                  </div>
                  <span className="badge badge-blue">
                    <ShieldCheck size={14} /> Super Admin only
                  </span>
                </div>
                <div className="role-cards">
                  {Object.entries(roleLabels).map(([role, label]) => (
                    <div className="card role-card" key={role}>
                      <ShieldCheck size={20} />
                      <strong>{label}</strong>
                      <span>{people.filter((p) => p.role === role).length} accounts</span>
                    </div>
                  ))}
                </div>
                <section className="card directory-card">
                  <div className="card-heading">
                    <h2>Workspace accounts</h2>
                    <span className="badge badge-muted">{people.length} accounts</span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Person</th>
                          <th>Role</th>
                          <th>Account status</th>
                          <th>Manage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {people.map((p, i) => (
                          <tr key={p.id}>
                            <td>
                              <div className="person-cell">
                                <Avatar name={p.name} index={i} />
                                <div>
                                  <strong>{p.name}</strong>
                                  <small>{p.email}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="badge badge-blue">{roleLabels[p.role]}</span>
                            </td>
                            <td>
                              <Badge value={p.accountActive ? 'Enabled' : 'Disabled'} />
                            </td>
                            <td>
                              <Button variant="outline" size="sm" onClick={() => setAccess(p)}>
                                Manage access
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : (
              <Restricted />
            ))}
          {pathname === '/settings' &&
            (isSuper ? <Settings session={session} onSaved={load} /> : <Restricted />)}
          {pathname === '/account' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">A SPACE THAT’S YOURS</span>
                  <h1>
                    My account<span className="heading-dot">.</span>
                  </h1>
                  <p>Your details and account security.</p>
                </div>
                <span className="badge badge-blue">{roleLabels[session.user.role]}</span>
              </div>
              {own && <Profile employee={own} />}
              <div className="account-security">
                <PasswordForm />
              </div>
            </>
          )}
          {![
            '/',
            '/employees',
            '/access',
            '/settings',
            '/account',
            '/login',
            '/setup',
            '/password',
          ].includes(pathname) && (
            <div className="empty-state">
              <h1>Page not found</h1>
              <p>This page isn’t part of your workspace.</p>
              <Link href="/" className="button button-primary">
                Back to overview
              </Link>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <Layers3 size={14} /> Open HRMS
            </span>
            <span>A happier workspace starts with people.</span>
          </footer>
        </div>
      </main>
      {editor !== undefined && (
        <EmployeeDialog
          employee={editor}
          employees={people}
          role={session.user.role}
          onClose={() => setEditor(undefined)}
          onSaved={saved}
        />
      )}
      {access && <AccessDialog employee={access} onClose={() => setAccess(null)} onSaved={saved} />}
      <Dialog
        open={help}
        onOpenChange={setHelp}
        title="A little help, when you need it."
        description="Getting around your Open HRMS workspace."
      >
        <div className="help-content">
          <h3>People and access</h3>
          <p>
            Admins and HR can add employee profiles. Super Admins manage account roles and sign-in
            access. Employees see their own records.
          </p>
          <h3>Signing in for the first time</h3>
          <p>
            Use the temporary password shared by your administrator. You’ll choose a new password
            before entering the workspace.
          </p>
          <h3>What’s next</h3>
          <p>
            Attendance, leave, payroll, and the desktop tracker are planned for upcoming releases.
            This release focuses on your people and workspace setup.
          </p>
          <h3>Need an account correction?</h3>
          <p>Contact your company’s HR team or Super Admin.</p>
        </div>
      </Dialog>
    </div>
  );
}
function Restricted() {
  return (
    <div className="empty-state">
      <ShieldCheck size={36} />
      <h2>This space is for your Super Admin.</h2>
      <p>Contact your administrator if you need help with these settings.</p>
      <Link href="/" className="button button-outline">
        Back to overview
      </Link>
    </div>
  );
}
function Profile({ employee: p }: { employee: Employee }) {
  return (
    <section className="card profile-card">
      <div className="card-heading">
        <h2>
          <span className="blue-dot" />
          Employee details
        </h2>
        <Badge value={p.status} />
      </div>
      <div className="profile-header">
        <Avatar name={p.name} large />
        <div>
          <h2>{p.name}</h2>
          <p>
            {p.designation || 'Team member'} · {employeeId(p.employeeNumber)}
          </p>
        </div>
      </div>
      <dl className="profile-grid">
        {[
          ['Work email', p.email],
          ['Phone', p.phone || 'Not added'],
          ['Department', p.department || 'Not assigned'],
          ['Employment type', p.employmentType],
          ['Joining date', formatDate(p.joiningDate)],
          ['Reporting manager', p.managerName || 'Not assigned'],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function activityLabel(event: Activity) {
  const labels: Record<string, string> = {
    'workspace.created': 'A new workspace began',
    'employee.created': `${event.details.name || 'An employee'} joined the workspace`,
    'employee.updated': `${event.details.name || 'Employee'} details updated`,
    'access.updated': 'Account access updated',
    'company.updated': 'Company details updated',
    'email.configured': 'Email provider configured',
    'email.test_sent': 'Test email sent',
    'password.changed': 'Account password updated',
  };
  return labels[event.action] || 'Workspace updated';
}
