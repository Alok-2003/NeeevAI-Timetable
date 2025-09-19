import { useEffect, useMemo, useState } from 'react';
import { listTimetables, loadSchoolData } from '../lib/store';
import { generateCSVRowsForView, downloadCSV } from '../lib/exporter';

/**
 * TimetablesPage (theme-styled)
 * Uses CSS theme variables provided in app.css:
 *  --color-primary, --color-secondary, --color-tertiary, --color-gray, --color-black, --color-white
 *
 * Polished layout:
 * - Left: saved timetables list (cards)
 * - Right: detail view with segmented controls (Class/Teacher/Room), filters and grid
 * - Buttons and accents use theme variables
 *
 * Functional notes:
 * - listTimetables() provides the saved items (id, name, savedAt, data)
 * - generateCSVRowsForView and downloadCSV used to export current view
 */

export default function TimetablesPage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null); // full timetable object { id, name, savedAt, data }
  const [schoolData, setSchoolData] = useState(null);

  // View controls
  const [viewType, setViewType] = useState('teacher'); // 'class' | 'teacher' | 'room'
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');

  useEffect(() => {
    setItems(listTimetables());
    setSchoolData(loadSchoolData() || null);
  }, []);

  useEffect(() => {
    // Initialize selectors when schoolData changes
    if (!schoolData) return;
    if (schoolData.teachers?.length && !selectedTeacherId) {
      setSelectedTeacherId(schoolData.teachers[0].id);
    }
    if (schoolData.classes?.length && !selectedClassId) {
      setSelectedClassId(schoolData.classes[0].id);
    }
    if (schoolData.resources?.length && !selectedRoomId) {
      setSelectedRoomId(schoolData.resources[0].id);
    }
  }, [schoolData]);

  const days = schoolData?.workingDays || 5;
  const periods = schoolData?.periodsPerDay || 6;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].slice(0, days);

  const subjectsById = useMemo(() => {
    const m = new Map();
    (schoolData?.subjects || []).forEach((s) => m.set(s.id, s));
    return m;
  }, [schoolData]);

  const teachersById = useMemo(() => {
    const m = new Map();
    (schoolData?.teachers || []).forEach((t) => m.set(t.id, t));
    return m;
  }, [schoolData]);

  const classesById = useMemo(() => {
    const m = new Map();
    (schoolData?.classes || []).forEach((c) => m.set(c.id, c));
    return m;
  }, [schoolData]);

  const roomsById = useMemo(() => {
    const m = new Map();
    (schoolData?.resources || []).forEach((r) => m.set(r.id, r));
    return m;
  }, [schoolData]);

  // Load full saved item (with data) by id from localStorage
  function loadFullTimetableById(id) {
    try {
      const raw = localStorage.getItem('timetables-v1') || localStorage.getItem('timetables');
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return arr.find((x) => x.id === id) || null;
    } catch {
      return null;
    }
  }

  const handleView = (id) => {
    const full = loadFullTimetableById(id);
    if (!full) {
      window.alert('Could not load timetable data.');
      return;
    }
    setSelected(full);
    // Ensure sensible defaults
    if (schoolData?.teachers?.length) setSelectedTeacherId((prev) => prev || schoolData.teachers[0].id);
    if (schoolData?.resources?.length) setSelectedRoomId((prev) => prev || schoolData.resources[0].id);
    // Default class selection: prefer first key present in saved data
    const dataKeys = Object.keys(full.data || {});
    if (dataKeys.length) {
      setSelectedClassId((prev) => (prev && dataKeys.includes(prev) ? prev : dataKeys[0]));
    }
    // Default to 'class' view to show grid quickly
    setViewType('class');
  };

  const cellLabel = (entry) => {
    if (!entry || entry.unassigned) return '—';
    const subj = entry.subjectId ? subjectsById.get(entry.subjectId) : null;
    const t = entry.teacherId ? teachersById.get(entry.teacherId) : null;
    const subjText = subj?.name || entry.subjectId || '';
    const teacherText = t?.name ? t.name.split(/\s+/)[0] : '';
    return teacherText ? `${subjText}\n${teacherText}` : subjText;
  };

  // Build grid for chosen view
  const grid = useMemo(() => {
    if (!selected?.data || !schoolData) return null;

    const g = Array.from({ length: days }, () => Array.from({ length: periods }, () => '—'));

    if (viewType === 'class' && selectedClassId) {
      // Resolve class key: it might be the class id in saved data, or we try to map by class name
      let key = selectedClassId;
      let classGrid = selected.data[key];
      if (!classGrid) {
        // Try to find by matching class name
        const targetName = classesById.get(selectedClassId)?.name;
        if (targetName) {
          const matchKey = Object.keys(selected.data).find((k) => (classesById.get(k)?.name === targetName) || k === targetName);
          if (matchKey) {
            key = matchKey;
            classGrid = selected.data[matchKey];
          }
        }
      }
      if (!classGrid) {
        // Fallback to first available
        const firstKey = Object.keys(selected.data)[0];
        key = firstKey;
        classGrid = selected.data[firstKey];
      }
      // Keep UI selection in sync if remapped
      if (key !== selectedClassId) {
        setSelectedClassId(key);
      }
      if (!classGrid) return g;
      for (let d = 0; d < days; d++) {
        for (let p = 0; p < periods; p++) {
          g[d][p] = cellLabel(classGrid[d][p]);
        }
      }
      return g;
    }

    if (viewType === 'teacher' && selectedTeacherId) {
      for (let d = 0; d < days; d++) {
        for (let p = 0; p < periods; p++) {
          let cell = '—';
          for (const [classId, classGrid] of Object.entries(selected.data)) {
            const entry = classGrid[d][p];
            if (entry && !entry.unassigned && entry.teacherId === selectedTeacherId) {
              const cls = classesById.get(classId);
              const subj = entry.subjectId ? subjectsById.get(entry.subjectId) : null;
              const clsName = cls?.name || classId;
              const subjName = subj?.name || entry.subjectId || '';
              cell = `${clsName}\n${subjName}`;
              break;
            }
          }
          g[d][p] = cell;
        }
      }
      return g;
    }

    if (viewType === 'room' && selectedRoomId) {
      for (let d = 0; d < days; d++) {
        for (let p = 0; p < periods; p++) {
          let cell = '—';
          for (const [classId, classGrid] of Object.entries(selected.data)) {
            const entry = classGrid[d][p];
            if (entry && !entry.unassigned && entry.resourceId === selectedRoomId) {
              const cls = classesById.get(classId);
              const subj = entry.subjectId ? subjectsById.get(entry.subjectId) : null;
              const t = entry.teacherId ? teachersById.get(entry.teacherId) : null;
              const clsName = cls?.name || classId;
              const subjName = subj?.name || entry.subjectId || '';
              const tName = t?.name ? t.name.split(/\s+/)[0] : '';
              cell = tName ? `${clsName}\n${subjName} (${tName})` : `${clsName}\n${subjName}`;
              break;
            }
          }
          g[d][p] = cell;
        }
      }
      return g;
    }

    return g;
  }, [selected, schoolData, viewType, selectedClassId, selectedTeacherId, selectedRoomId, days, periods, subjectsById, classesById, teachersById]);

  const exportCurrentView = () => {
    if (!selected?.data) {
      window.alert('No timetable selected.');
      return;
    }
    let id = '';
    if (viewType === 'class') id = selectedClassId;
    if (viewType === 'teacher') id = selectedTeacherId;
    if (viewType === 'room') id = selectedRoomId;
    const rows = generateCSVRowsForView(selected.data, viewType, id, { days, periods, dayNames });
    const name = `${selected.name || 'timetable'}_${viewType}_${id || 'all'}.csv`;
    downloadCSV(name, rows);
  };

  return (
    <section className="space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--color-black)]">Saved Timetables</h2>
          <p className="text-sm text-[var(--color-gray)]">Open, view and export previously saved timetables.</p>
        </div>

        <div className="hidden sm:flex items-center gap-3">
          <button
            onClick={() => { setSelected(null); setItems(listTimetables()); }}
            className="px-3 py-2 rounded-md border hover:bg-[var(--color-secondary)]"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: list */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            {items.length === 0 ? (
              <div className="p-6 text-center">
                <div className="text-gray-500 mb-3">No timetables saved yet</div>
                <div className="text-xs text-[var(--color-gray)]">Generate a timetable in the Generate tab and save it here.</div>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((t) => (
                  <li key={t.id} className="p-4 flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-[var(--color-black)]">{t.name}</div>
                          <div className="text-xs text-[var(--color-gray)] mt-1">Saved {new Date(t.savedAt || t.createdAt || Date.now()).toLocaleString()}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleView(t.id)}
                            style={{ background: 'var(--color-primary)', color: 'var(--color-white)' }}
                            className="px-3 py-1.5 rounded-md text-sm shadow-sm hover:brightness-95 transition"
                          >
                            View
                          </button>
                        </div>
                      </div>
                      {t.description && <div className="text-xs text-[var(--color-gray)] mt-2">{t.description}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: detail */}
        <div className="lg:col-span-3 space-y-4">
          {!selected ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
              <div className="text-lg font-semibold text-[var(--color-black)] mb-2">No timetable selected</div>
              <div className="text-sm text-[var(--color-gray)] mb-4">Pick a saved timetable from the left to view details, or generate a new one in the Generate page.</div>
              <div className="inline-flex items-center gap-3">
                <button
                  onClick={() => { /* guide user */ }}
                  className="px-4 py-2 rounded-md border hover:bg-[var(--color-secondary)]"
                >
                  View Guide
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-sm text-[var(--color-gray)]">Viewing:</div>
                  <div className="font-medium text-[var(--color-black)]">{selected.name}</div>
                </div>

                <div className="flex items-center gap-2">
                  {/* segmented */}
                  <div className="inline-flex rounded-md bg-[var(--color-secondary)] p-1">
                    <button
                      onClick={() => setViewType('class')}
                      className={`px-3 py-2 text-sm rounded-md transition ${viewType === 'class' ? 'bg-[var(--color-primary)] text-[var(--color-white)]' : 'text-[var(--color-black)]'}`}
                    >
                      View by Class
                    </button>
                    <button
                      onClick={() => setViewType('teacher')}
                      className={`px-3 py-2 text-sm rounded-md transition ${viewType === 'teacher' ? 'bg-[var(--color-primary)] text-[var(--color-white)]' : 'text-[var(--color-black)]'}`}
                    >
                      View by Teacher
                    </button>
                    <button
                      onClick={() => setViewType('room')}
                      className={`px-3 py-2 text-sm rounded-md transition ${viewType === 'room' ? 'bg-[var(--color-primary)] text-[var(--color-white)]' : 'text-[var(--color-black)]'}`}
                    >
                      View by Room
                    </button>
                  </div>

                  <button
                    onClick={exportCurrentView}
                    style={{ background: 'var(--color-tertiary)', color: 'var(--color-black)' }}
                    className="px-3 py-2 rounded-md shadow-sm hover:brightness-95 transition"
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                {viewType === 'teacher' && (
                  <>
                    <label className="text-sm text-[var(--color-gray)]">Teacher</label>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-2 bg-white"
                    >
                      {(schoolData?.teachers || []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {viewType === 'class' && (
                  <>
                    <label className="text-sm text-[var(--color-gray)]">Class</label>
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-2 bg-white"
                    >
                      {Object.keys(selected?.data || {}).map((key) => {
                        const c = classesById.get(key);
                        const label = c?.name || key;
                        return (
                          <option key={key} value={key}>{label}</option>
                        );
                      })}
                    </select>
                  </>
                )}
                {viewType === 'room' && (
                  <>
                    <label className="text-sm text-[var(--color-gray)]">Room</label>
                    <select
                      value={selectedRoomId}
                      onChange={(e) => setSelectedRoomId(e.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-2 bg-white"
                    >
                      {(schoolData?.resources || []).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              {/* Grid */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
                {grid ? (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--color-secondary)]">
                        <th className="px-4 py-3 text-left font-medium text-[var(--color-gray)]">Day</th>
                        {Array.from({ length: periods }).map((_, i) => (
                          <th key={i} className="px-4 py-3 text-center font-medium text-[var(--color-gray)]">{i + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grid.map((row, d) => (
                        <tr key={d} className="border-t border-gray-100 align-top">
                          <td className="px-4 py-3 font-medium text-[var(--color-black)]">{dayNames[d] || `D${d + 1}`}</td>
                          {row.map((text, p) => (
                            <td key={p} className="px-3 py-3 text-center whitespace-pre-line text-[var(--color-black)]" style={{ minWidth: 140 }}>
                              <div className="mx-auto max-w-[14rem]">
                                {text === '—' ? (
                                  <div className="text-sm text-[var(--color-gray)]">—</div>
                                ) : (
                                  <div className="text-sm text-[var(--color-black)]">{text}</div>
                                )}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-8 text-center text-[var(--color-gray)]">No grid available for the selected view.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
