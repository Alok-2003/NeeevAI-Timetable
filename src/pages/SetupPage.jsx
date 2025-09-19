import { useEffect, useMemo, useState } from 'react';
import { saveSchoolData, loadSchoolData, logEdit } from '../lib/store';
import { validateSchoolData } from '../lib/validator';

/**
 * Improved SetupPage UI
 * - Uses your theme CSS variables (e.g. --color-primary) via inline styles for buttons/chips
 * - Cleaner sections with "Card-like" containers, improved spacing and responsive layout
 * - Keeps existing logic & behavior untouched
 */

/* Helpers */
function makeDefaultAvailability(days, periods) {
  return Array.from({ length: days }, () => Array.from({ length: periods }, () => true));
}

function normalizeFormData(data, fallbackDays, fallbackPeriods) {
  const workingDays = Number.isFinite(data?.workingDays) ? data.workingDays : (fallbackDays || 5);
  const periodsPerDay = Number.isFinite(data?.periodsPerDay) ? data.periodsPerDay : (fallbackPeriods || 6);

  // Normalize breaks to an array list [{name, period}]
  let breaks = [];
  if (Array.isArray(data?.breaks)) {
    breaks = data.breaks
      .map((b) => ({ name: b?.name || 'Break', period: Number(b?.period) || 1 }))
      .filter((b) => Number.isFinite(b.period));
  } else if (data?.breaks && typeof data.breaks === 'object') {
    breaks = Object.entries(data.breaks).map(([name, val]) => ({
      name,
      period: Number(val?.period) || 1,
    }));
  } else {
    breaks = [];
  }

  // Normalize teachers/resources availability matrices
  const ensureGrid = (grid) => {
    if (!Array.isArray(grid) || grid.length !== workingDays) return makeDefaultAvailability(workingDays, periodsPerDay);
    return Array.from({ length: workingDays }, (_, d) => {
      const row = Array.isArray(grid[d]) ? grid[d] : [];
      return Array.from({ length: periodsPerDay }, (_, p) => row[p] ?? true);
    });
  };

  const teachers = (data?.teachers || []).map((t) => ({
    ...t,
    availability: ensureGrid(t.availability),
  }));

  const resources = (data?.resources || []).map((r) => ({
    ...r,
    availability: ensureGrid(r.availability),
  }));

  return {
    ...data,
    workingDays,
    periodsPerDay,
    breaks,
    teachers,
    resources,
  };
}

/* Small component: AvailabilityGrid - slightly restyled */
function AvailabilityGrid({ value, onChange, label }) {
  if (!value) return null;
  const days = value.length;
  const periods = value[0]?.length || 0;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].slice(0, days);
  return (
    <div className="space-y-2">
      {label && <div className="text-sm font-semibold text-[var(--color-black)]">{label}</div>}
      <div className="overflow-auto rounded-md border border-gray-200">
        <table className="min-w-full table-fixed text-xs">
          <thead>
            <tr className="bg-[var(--color-secondary)]">
              <th className="px-2 py-2 text-left">Day</th>
              {Array.from({ length: periods }).map((_, i) => (
                <th key={i} className="px-2 py-2 text-center">P{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.map((row, d) => (
              <tr key={d} className="border-t">
                <td className="px-2 py-2 font-medium">{dayNames[d] || `D${d + 1}`}</td>
                {row.map((cell, p) => (
                  <td key={p} className="px-2 py-2 text-center">
                    <label className="inline-flex items-center justify-center gap-1">
                      <input
                        type="checkbox"
                        checked={!!cell}
                        onChange={(e) => {
                          const v = value.map((r) => r.slice());
                          v[d][p] = e.target.checked;
                          onChange(v);
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                        aria-label={`Availability ${d}-${p}`}
                      />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SetupPage() {
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(() => ({
    workingDays: 5,
    periodsPerDay: 6,
    periodDuration: 40,
    breaks: [],
    subjects: [],
    teachers: [],
    classes: [],
    resources: [],
  }));

  // Load existing
  useEffect(() => {
    const existing = loadSchoolData();
    if (existing) {
      setForm((prev) => normalizeFormData(existing, prev.workingDays, prev.periodsPerDay));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When workingDays/periods change, resize matrices
  useEffect(() => {
    setForm((prev) => {
      const { workingDays, periodsPerDay } = prev;
      const fix = (grid) => {
        if (!Array.isArray(grid)) return makeDefaultAvailability(workingDays, periodsPerDay);
        const out = Array.from({ length: workingDays }, (_, d) => {
          const row = grid[d] || [];
          return Array.from({ length: periodsPerDay }, (_, p) => (row[p] ?? true));
        });
        return out;
      };
      return {
        ...prev,
        teachers: prev.teachers.map((t) => ({ ...t, availability: fix(t.availability) })),
        resources: prev.resources.map((r) => ({ ...r, availability: fix(r.availability) })),
      };
    });
  }, [form.workingDays, form.periodsPerDay]);

  const handleLoadExample = async () => {
    try {
      const res = await fetch('/exampleSchoolData.json');
      if (!res.ok) throw new Error('Example not found');
      const data = await res.json();
      setForm((prev) => normalizeFormData(data, prev.workingDays, prev.periodsPerDay));
    } catch (e) {
      window.alert('Failed to load example: ' + (e?.message || String(e)));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Validate then save
      const result = await Promise.resolve(validateSchoolData(form));
      const ok = !!(result && (result.valid || result.ok === true));
      if (!ok) {
        const errors = (result && result.errors) || ['Validation failed'];
        window.alert('Validation errors:\n' + errors.join('\n'));
        return;
      }
      saveSchoolData(form);
      logEdit({ type: 'saveSchoolData', at: Date.now() });
      window.alert('Saved successfully.');
    } catch (err) {
      window.alert('Error while saving: ' + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  /* Add/remove helpers */
  const addSubject = () => setForm((f) => ({ ...f, subjects: [...f.subjects, { id: '', name: '', weeklyPeriods: 1, lab: false, doublePeriod: false }] }));
  const removeSubject = (idx) => setForm((f) => ({ ...f, subjects: f.subjects.filter((_, i) => i !== idx) }));

  const addTeacher = () => setForm((f) => ({ ...f, teachers: [...f.teachers, { id: '', name: '', subjects: [], maxLoad: 20, availability: makeDefaultAvailability(f.workingDays, f.periodsPerDay) }] }));
  const removeTeacher = (idx) => setForm((f) => ({ ...f, teachers: f.teachers.filter((_, i) => i !== idx) }));

  const addClass = () => setForm((f) => ({ ...f, classes: [...f.classes, { id: '', name: '', subjects: {} }] }));
  const removeClass = (idx) => setForm((f) => ({ ...f, classes: f.classes.filter((_, i) => i !== idx) }));

  const addResource = () => setForm((f) => ({ ...f, resources: [...f.resources, { id: '', name: '', type: 'lab', availability: makeDefaultAvailability(f.workingDays, f.periodsPerDay) }] }));
  const removeResource = (idx) => setForm((f) => ({ ...f, resources: f.resources.filter((_, i) => i !== idx) }));

  const subjectIds = useMemo(() => form.subjects.map((s) => s.id).filter(Boolean), [form.subjects]);

  /* Small visual styles for theme-driven buttons */
  const primaryBtnStyle = { background: 'var(--color-primary)', color: 'var(--color-white)' };
  const linkStyle = { color: 'var(--color-primary)' };
  const tertiaryStyle = { background: 'var(--color-tertiary)', color: 'var(--color-black)' };

  return (
    <section className="space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--color-black)]">Setup</h2>
          <p className="text-sm text-[var(--color-gray)]">Configure your school, subjects, teachers and resources</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleLoadExample}
            style={{ borderColor: 'rgba(0,0,0,0.08)' }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-transparent hover:bg-[var(--color-secondary)] transition"
          >
            Load Example
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={primaryBtnStyle}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium shadow-sm hover:brightness-95 transition disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* School Setup Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">School Setup</h3>
          <div className="text-sm text-[var(--color-gray)]">General settings</div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-gray)] mb-1">Working Days</label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              value={form.workingDays}
              onChange={(e) => setForm({ ...form, workingDays: parseInt(e.target.value, 10) })}
            >
              <option value={5}>Mon–Fri (5)</option>
              <option value={6}>Mon–Sat (6)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-gray)] mb-1">Periods / Day</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              value={form.periodsPerDay}
              onChange={(e) => setForm({ ...form, periodsPerDay: parseInt(e.target.value, 10) || 1 })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-gray)] mb-1">Period Duration (min)</label>
            <input
              type="number"
              min={10}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              value={form.periodDuration}
              onChange={(e) => setForm({ ...form, periodDuration: parseInt(e.target.value, 10) || 40 })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-gray)] mb-1">Breaks</label>
            <div className="space-y-2">
              {form.breaks.map((b, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    className="flex-1 w-1/2 rounded-md border border-gray-300 px-3 py-2"
                    placeholder="Name"
                    value={b.name ?? ''}
                    onChange={(e) => setForm({ ...form, breaks: form.breaks.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })}
                  />
                  <input
                    type="number"
                    min={1}
                    className="w-14 rounded-md border border-gray-300 px-3 py-2 text-center"
                    placeholder="Period"
                    value={b.period ?? ''}
                    onChange={(e) => setForm({ ...form, breaks: form.breaks.map((x, k) => (k === i ? { ...x, period: parseInt(e.target.value, 10) || 1 } : x)) })}
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, breaks: form.breaks.filter((_, k) => k !== i) })}
                    className="text-[var(--color-black)] px-2 py-1 rounded-md hover:bg-[var(--color-secondary)]"
                    aria-label="Remove break"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setForm({ ...form, breaks: [...form.breaks, { name: '', period: 1 }] })}
                style={linkStyle}
                className="text-sm font-medium"
              >
                + Add break
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Subjects Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Subjects</h3>
          <button type="button" className="text-sm font-medium" onClick={addSubject} style={linkStyle}>+ Add subject</button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-secondary)]">
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-center">Weekly</th>
                <th className="px-3 py-2 text-center">Lab</th>
                <th className="px-3 py-2 text-center">Double</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {form.subjects.map((s, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">
                    <input className="w-28 rounded-md border border-gray-300 px-2 py-1" value={s.id ?? ''} onChange={(e) => setForm({ ...form, subjects: form.subjects.map((x, k) => (k === i ? { ...x, id: e.target.value } : x)) })} />
                  </td>
                  <td className="px-3 py-2">
                    <input className="w-full rounded-md border border-gray-300 px-2 py-1" value={s.name ?? ''} onChange={(e) => setForm({ ...form, subjects: form.subjects.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="number" min={0} className="w-20 rounded-md border border-gray-300 px-2 py-1 text-center" value={s.weeklyPeriods || 0} onChange={(e) => setForm({ ...form, subjects: form.subjects.map((x, k) => (k === i ? { ...x, weeklyPeriods: parseInt(e.target.value, 10) || 0 } : x)) })} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={!!s.lab} onChange={(e) => setForm({ ...form, subjects: form.subjects.map((x, k) => (k === i ? { ...x, lab: e.target.checked } : x)) })} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={!!s.doublePeriod} onChange={(e) => setForm({ ...form, subjects: form.subjects.map((x, k) => (k === i ? { ...x, doublePeriod: e.target.checked } : x)) })} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" className="text-rose-600" onClick={() => removeSubject(i)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Teachers */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Teachers</h3>
          <button type="button" className="text-sm font-medium" onClick={addTeacher} style={linkStyle}>+ Add teacher</button>
        </div>

        <div className="space-y-6">
          {form.teachers.map((t, i) => (
            <div key={i} className="border rounded-md p-4 hover:shadow-sm transition">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <input className="rounded-md border border-gray-300 px-3 py-2" placeholder="ID" value={t.id ?? ''} onChange={(e) => setForm({ ...form, teachers: form.teachers.map((x, k) => (k === i ? { ...x, id: e.target.value } : x)) })} />
                <input className="rounded-md border border-gray-300 px-3 py-2 md:col-span-2" placeholder="Name" value={t.name ?? ''} onChange={(e) => setForm({ ...form, teachers: form.teachers.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                <input type="number" min={1} className="rounded-md border border-gray-300 px-3 py-2" placeholder="Max Load" value={t.maxLoad ?? ''} onChange={(e) => setForm({ ...form, teachers: form.teachers.map((x, k) => (k === i ? { ...x, maxLoad: parseInt(e.target.value, 10) || 0 } : x)) })} />
              </div>

              <div className="mt-3">
                <label className="block text-sm font-medium text-[var(--color-gray)] mb-2">Subjects</label>
                <div className="flex flex-wrap gap-2">
                  {form.subjects.map((s) => {
                    const checked = Array.isArray(t.subjects) && t.subjects.includes(s.id);
                    return (
                      <label key={s.id} className="inline-flex items-center gap-2 text-sm bg-[var(--color-secondary)] px-2 py-1 rounded-md">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setForm({
                              ...form,
                              teachers: form.teachers.map((x, k) => {
                                if (k !== i) return x;
                                const curr = new Set(x.subjects || []);
                                if (e.target.checked) curr.add(s.id); else curr.delete(s.id);
                                return { ...x, subjects: Array.from(curr) };
                              }),
                            });
                          }}
                        />
                        <span className="text-sm">{s.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                <AvailabilityGrid label="Availability" value={t.availability} onChange={(v) => setForm({ ...form, teachers: form.teachers.map((x, k) => (k === i ? { ...x, availability: v } : x)) })} />
              </div>

              <div className="mt-3 text-right">
                <button type="button" className="text-rose-600" onClick={() => removeTeacher(i)}>Remove teacher</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Classes */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Classes / Sections</h3>
          <button type="button" className="text-sm font-medium" onClick={addClass} style={linkStyle}>+ Add class</button>
        </div>

        <div className="space-y-4">
          {form.classes.map((c, i) => (
            <div key={i} className="border rounded-md p-4 hover:shadow-sm transition">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <input className="rounded-md border border-gray-300 px-3 py-2" placeholder="ID" value={c.id ?? ''} onChange={(e) => setForm({ ...form, classes: form.classes.map((x, k) => (k === i ? { ...x, id: e.target.value } : x)) })} />
                <input className="rounded-md border border-gray-300 px-3 py-2 md:col-span-2" placeholder="Name" value={c.name ?? ''} onChange={(e) => setForm({ ...form, classes: form.classes.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
              </div>
              <div className="mt-3">
                <div className="text-sm font-medium text-[var(--color-gray)] mb-2">Subject periods per week</div>
                <div className="flex flex-wrap gap-2">
                  {form.subjects.map((s) => (
                    <label key={s.id} className="inline-flex items-center gap-2 text-sm border rounded px-2 py-1">
                      <span className="whitespace-nowrap">{s.name}</span>
                      <input
                        type="number"
                        min={0}
                        className="w-16 text-center rounded border border-gray-300 px-1 py-0.5"
                        value={(c.subjects && c.subjects[s.id] !== undefined) ? c.subjects[s.id] : ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setForm({
                            ...form,
                            classes: form.classes.map((x, k) => (k === i ? { ...x, subjects: { ...(x.subjects || {}), [s.id]: val } } : x)),
                          });
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-3 text-right">
                <button type="button" className="text-rose-600" onClick={() => removeClass(i)}>Remove class</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resources */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Resources (Labs, Computer Labs)</h3>
          <button type="button" className="text-sm font-medium" onClick={addResource} style={linkStyle}>+ Add resource</button>
        </div>

        <div className="space-y-6">
          {form.resources.map((r, i) => (
            <div key={i} className="border rounded-md p-4 hover:shadow-sm transition">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <input className="rounded-md border border-gray-300 px-3 py-2" placeholder="ID" value={r.id ?? ''} onChange={(e) => setForm({ ...form, resources: form.resources.map((x, k) => (k === i ? { ...x, id: e.target.value } : x)) })} />
                <input className="rounded-md border border-gray-300 px-3 py-2 md:col-span-2" placeholder="Name" value={r.name ?? ''} onChange={(e) => setForm({ ...form, resources: form.resources.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                <select className="rounded-md border border-gray-300 px-3 py-2" value={r.type ?? 'lab'} onChange={(e) => setForm({ ...form, resources: form.resources.map((x, k) => (k === i ? { ...x, type: e.target.value } : x)) })}>
                  <option value="lab">Lab</option>
                  <option value="computer_lab">Computer Lab</option>
                </select>
              </div>

              <div className="mt-3">
                <AvailabilityGrid label="Availability" value={r.availability} onChange={(v) => setForm({ ...form, resources: form.resources.map((x, k) => (k === i ? { ...x, availability: v } : x)) })} />
              </div>

              <div className="mt-3 text-right">
                <button type="button" className="text-rose-600" onClick={() => removeResource(i)}>Remove resource</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
