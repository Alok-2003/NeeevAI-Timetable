import { useEffect, useMemo, useState } from 'react';
import { computePenalty } from '../lib/generator';
import { generateTimetableWithAI, getApiKey } from '../lib/ai';
import { loadSchoolData, saveTimetable, logEdit } from '../lib/store';
import EditModal from '../components/EditModal';

/**
 * Polished GeneratePage
 * - Uses theme variables (assumes @theme in app.css)
 * - Better controls, nicer buttons, responsive two-column layout
 * - Timetable cells styled with lab accent, hover lift, and empty-state CTA
 * - Keeps existing generate/save/edit behavior intact
 */

export default function GeneratePage() {
  const [seed, setSeed] = useState('');
  const [optIterations, setOptIterations] = useState(200);
  const [savingName, setSavingName] = useState('Timetable');
  const [isGenerating, setIsGenerating] = useState(false);
  // Force AI-driven generation (no manual toggle)

  const [schoolData, setSchoolData] = useState(null);
  const [result, setResult] = useState(null); // { timetable, diagnostics }
  const [selectedClassId, setSelectedClassId] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editCell, setEditCell] = useState(null); // { classId, day, period }

  useEffect(() => {
    const data = loadSchoolData();
    setSchoolData(data);
    if (data && Array.isArray(data.classes) && data.classes.length > 0) {
      setSelectedClassId(data.classes[0].id);
    }
  }, []);

  // No explainability checkbox; always expect AI key present in session storage

  const subjectsById = useMemo(() => {
    const map = new Map();
    (schoolData?.subjects || []).forEach((s) => map.set(s.id, s));
    return map;
  }, [schoolData]);

  const teachersById = useMemo(() => {
    const map = new Map();
    (schoolData?.teachers || []).forEach((t) => map.set(t.id, t));
    return map;
  }, [schoolData]);

  const classSubjects = useMemo(() => {
    if (!schoolData || !selectedClassId) return [];
    const cls = schoolData.classes.find((c) => c.id === selectedClassId);
    if (!cls || !cls.subjects) return [];
    return Object.keys(cls.subjects)
      .map((sid) => subjectsById.get(sid) || { id: sid, name: sid })
      .filter(Boolean);
  }, [schoolData, selectedClassId, subjectsById]);

  const handleGenerate = async () => {
    if (!schoolData) {
      window.alert('Please load and save school data in Setup first.');
      return;
    }
    setIsGenerating(true);
    try {
      // Ensure API key is present in env
      const key = getApiKey();
      if (!key) {
        window.alert('AI generation requires a Gemini API key in .env (VITE_GEMINI_API_KEY).\nAfter setting it, restart the dev server.');
        return;
      }
      // Always require Gemini to generate the full timetable
      const ai = await generateTimetableWithAI(schoolData);
      if (!ai || !ai.timetable) {
        console.warn('[Generate] AI unavailable or invalid response. Aborting generation.');
        window.alert('AI returned an invalid response. Check the browser console for the raw AI output.');
        return;
      }
      console.log('[Generate] AI timetable raw:', ai.raw);

      const timetable = ai.timetable;
      // Build minimal diagnostics for display
      const days = schoolData.workingDays;
      const periods = schoolData.periodsPerDay;
      let unassignedCount = 0;
      const teacherLoads = {};
      for (const [classId, grid] of Object.entries(timetable)) {
        for (let d = 0; d < days; d++) {
          for (let p = 0; p < periods; p++) {
            const cell = grid?.[d]?.[p] || null;
            if (!cell) {
              unassignedCount += 1;
            } else if (cell && cell.teacherId) {
              teacherLoads[cell.teacherId] = (teacherLoads[cell.teacherId] || 0) + 1;
            }
          }
        }
      }
      const diagnostics = {
        unassignedCount,
        penaltyScore: computePenalty(timetable, schoolData),
        teacherLoads,
        timeMs: 0,
        timeTakenMs: 0,
      };
      setResult({ timetable, diagnostics });
    } catch (e) {
      console.error(e);
      window.alert('Generation error: ' + (e?.message || String(e)));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveTimetable = () => {
    if (!result?.timetable) {
      window.alert('No timetable to save. Generate first.');
      return;
    }
    const name = savingName?.trim() || 'Timetable';
    saveTimetable(name, result.timetable);
    window.alert('Saved as: ' + name);
  };

  const days = schoolData?.workingDays || 5;
  const periods = schoolData?.periodsPerDay || 6;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].slice(0, days);

  const gridForSelected = selectedClassId && result?.timetable ? result.timetable[selectedClassId] : null;

  const teacherLoadStddev = useMemo(() => {
    if (!result?.diagnostics?.teacherLoads) return 0;
    const vals = Object.values(result.diagnostics.teacherLoads);
    if (vals.length === 0) return 0;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length;
    return Math.sqrt(variance);
  }, [result]);

  const openEdit = (day, period) => {
    if (!gridForSelected) return;
    setEditCell({ classId: selectedClassId, day, period });
    setEditOpen(true);
  };

  const handleSaveEdit = ({ day, period, newSubjectId, newTeacherId }) => {
    if (!result || !selectedClassId) return;
    const prev = result.timetable[selectedClassId][day][period] || null;
    const next = newSubjectId
      ? { subjectId: newSubjectId, teacherId: newTeacherId || null }
      : null;
    // clone result shallowly
    const updated = { ...result, timetable: { ...result.timetable } };
    const newGrid = result.timetable[selectedClassId].map((row) => row.slice());
    newGrid[day][period] = next;
    updated.timetable[selectedClassId] = newGrid;
    setResult(updated);
    logEdit({
      before: prev,
      after: next,
      location: { classId: selectedClassId, day, period },
      reason: 'manual',
    });
    setEditOpen(false);
  };

  return (
    <section className="space-y-6 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--color-black)]">Generate</h2>
          <p className="text-sm text-[var(--color-gray)]">Create conflict-free timetables and preview per-class schedules</p>
        </div>
        {/* Explainability toggle removed: AI is always used */}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left panel */}
        <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-1 mb-2">
                <label className="text-sm font-medium text-[var(--color-gray)]">Random seed</label>
                <span
                  className="text-xs text-[var(--color-gray)] cursor-help"
                  title="Used to make results reproducible. Keeping the same seed can produce similar schedules."
                  aria-label="Random seed info"
                >
                  ⓘ
                </span>
              </div>
              <input
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="e.g. 12345"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1">
                  <label className="text-sm font-medium text-[var(--color-gray)]">Optimization rounds</label>
                  <span
                    className="text-xs text-[var(--color-gray)] cursor-help"
                    title="More rounds may improve schedule quality but take longer. Try 100–400."
                    aria-label="Optimization rounds info"
                  >
                    ⓘ
                  </span>
                </div>
                <div className="text-sm font-medium text-[var(--color-black)]">{optIterations}</div>
              </div>
              <input
                type="range"
                min={0}
                max={1000}
                step={10}
                value={optIterations}
                onChange={(e) => setOptIterations(parseInt(e.target.value, 10))}
                className="w-full accent-[var(--color-primary)]"
              />
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                style={{ background: 'var(--color-primary)', color: 'var(--color-white)' }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg shadow-md hover:brightness-95 transition disabled:opacity-60"
              >
                {isGenerating ? 'Generating...' : 'Generate Timetable'}
              </button>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <label className="block text-sm font-medium text-[var(--color-gray)] mb-2">Save timetable</label>
              <div className="flex items-center gap-2 w-full">
                <input
                  type="text"
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  placeholder="Timetable name"
                  className="flex-1 min-w-0 max-w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={handleSaveTimetable}
                  style={{ background: 'var(--color-tertiary)', color: 'var(--color-black)' }}
                  className="shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-md shadow-sm hover:brightness-95 transition"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="pt-3 text-sm text-[var(--color-gray)]">
              <div><strong>Tip:</strong> Increase iterations to improve soft-constraint penalties.</div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm text-[var(--color-gray)]">Class</label>
              <select
                className="rounded-md border border-gray-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                {(schoolData?.classes || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <div className="ml-3 text-xs text-[var(--color-gray)] px-2 py-1 rounded bg-[var(--color-secondary)]">
                {days} days · {periods} periods/day
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setResult(null); setSelectedClassId(schoolData?.classes?.[0]?.id || ''); }}
                className="text-sm px-3 py-2 rounded-md border border-gray-200 hover:bg-[var(--color-secondary)]"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
            {gridForSelected ? (
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
                  {gridForSelected.map((row, d) => (
                    <tr key={d} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-medium text-[var(--color-black)]">{dayNames[d] || `D${d + 1}`}</td>
                      {row.map((cell, p) => {
                        const subj = cell && cell.subjectId ? subjectsById.get(cell.subjectId) : null;
                        const teacher = cell && cell.teacherId ? teachersById.get(cell.teacherId) : null;
                        const isLab = subj?.lab || subj?.requiresLab;
                        return (
                          <td
                            key={p}
                            className="px-3 py-3 align-middle"
                            onClick={() => openEdit(d, p)}
                          >
                            <div
                              className={`mx-auto max-w-[12rem] rounded-md p-3 transition transform hover:-translate-y-0.5 hover:shadow-md cursor-pointer`}
                              style={{
                                border: '1px solid rgba(0,0,0,0.06)',
                                background: 'white',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: 56,
                                position: 'relative',
                                boxSizing: 'border-box',
                                ...(isLab ? { borderLeft: `4px solid var(--color-tertiary)` } : {}),
                              }}
                              title={subj ? `${subj.name} — ${teacher ? teacher.name : ''}` : 'Empty slot — click to edit'}
                            >
                              {cell && subj ? (
                                <>
                                  <div className="text-sm font-semibold text-[var(--color-black)] truncate">{subj.name}</div>
                                  <div className="text-xs text-[var(--color-gray)] mt-1">{teacher ? teacher.name : 'TBA'}</div>
                                  {isLab && (
                                    <div style={{ position: 'absolute', left: 6, top: 8 }} className="text-[var(--color-tertiary)] text-xs font-medium">
                                      Lab
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-xs text-[var(--color-gray)] flex items-center gap-2">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="opacity-60">
                                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  <span>Empty</span>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-[var(--color-gray)]">
                <div className="text-lg font-medium mb-2">No timetable yet</div>
                <div className="mb-4">Click "Generate Timetable" to create a schedule for your classes.</div>
                <button
                  onClick={handleGenerate}
                  style={{ background: 'var(--color-primary)', color: 'var(--color-white)' }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md shadow-sm hover:brightness-95 transition"
                >
                  Generate now
                </button>
              </div>
            )}
          </div>

          {/* Diagnostics */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-[var(--color-gray)]" title="Number of periods left empty across all classes. Lower is better." aria-label="Empty slots tooltip">Empty slots</div>
              <div className="text-2xl font-semibold">{result?.diagnostics?.unassignedCount ?? '-'}</div>
            </div>
            <div className="flex-1 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-[var(--color-gray)]" title="Overall schedule penalty from soft constraints. Lower is better." aria-label="Penalty score tooltip">Penalty score</div>
              <div className="text-2xl font-semibold">{result?.diagnostics?.penaltyScore ?? '-'}</div>
            </div>
            <div className="flex-1 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-[var(--color-gray)]" title="Variation in teaching load across teachers. Lower means more balanced." aria-label="Teacher load variation tooltip">Teacher load variation</div>
              <div className="text-2xl font-semibold">{Number(teacherLoadStddev || 0).toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <EditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        cellInfo={editCell ? (() => {
          const current = gridForSelected?.[editCell.day]?.[editCell.period] || null;
          return {
            day: editCell.day,
            period: editCell.period,
            classId: selectedClassId,
            classSubjects,
            teachers: schoolData?.teachers || [],
            subjectsById: subjectsById,
            currentSubjectId: current && !current.unassigned ? current.subjectId : null,
            currentTeacherId: current && !current.unassigned ? current.teacherId : null,
          };
        })() : null}
        onSave={handleSaveEdit}
      />
    </section>
  );
}
