/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react';
import { loadEditLogs } from '../lib/store';
import { getPreferencePenalties } from '../lib/learn';

export default function LearningPanel() {
  const [logs, setLogs] = useState([]);
  const [penalties, setPenalties] = useState({ teacherPeriods: {}, subjectPeriods: {} });
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    setLogs(loadEditLogs() || []);
    setPenalties(getPreferencePenalties());
    setApplied(sessionStorage.getItem('applyLearnedPenalties') === '1');
  }, []);

  const teacherTop = useMemo(() => {
    const rows = [];
    for (const [tid, perMap] of Object.entries(penalties.teacherPeriods || {})) {
      for (const [per, pen] of Object.entries(perMap)) {
        rows.push({ kind: 'teacher', id: tid, period: Number(per), penalty: Number(pen) });
      }
    }
    rows.sort((a, b) => b.penalty - a.penalty);
    return rows.slice(0, 5);
  }, [penalties]);

  const subjectTop = useMemo(() => {
    const rows = [];
    for (const [sid, perMap] of Object.entries(penalties.subjectPeriods || {})) {
      for (const [per, pen] of Object.entries(perMap)) {
        rows.push({ kind: 'subject', id: sid, period: Number(per), penalty: Number(pen) });
      }
    }
    rows.sort((a, b) => b.penalty - a.penalty);
    return rows.slice(0, 5);
  }, [penalties]);

  const toggleApply = () => {
    const next = !applied;
    setApplied(next);
    if (next) sessionStorage.setItem('applyLearnedPenalties', '1');
    else sessionStorage.removeItem('applyLearnedPenalties');
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-base font-semibold">Learning</h3>
        <button
          type="button"
          onClick={toggleApply}
          className={`px-3 py-1.5 rounded-md border ${applied ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-800 border-gray-300'}`}
        >
          {applied ? 'Applied to Next Generate' : 'Apply learned penalties to next generate'}
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <div className="font-medium mb-2">Top Teacher-Period Penalties</div>
          {teacherTop.length === 0 ? (
            <div className="text-gray-500">No data.</div>
          ) : (
            <ul className="space-y-1">
              {teacherTop.map((row, idx) => (
                <li key={idx} className="flex items-center justify-between">
                  <span className="text-gray-700">Teacher {row.id} • P{row.period + 1}</span>
                  <span className="font-semibold text-gray-900">{row.penalty}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="font-medium mb-2">Top Subject-Period Penalties</div>
          {subjectTop.length === 0 ? (
            <div className="text-gray-500">No data.</div>
          ) : (
            <ul className="space-y-1">
              {subjectTop.map((row, idx) => (
                <li key={idx} className="flex items-center justify-between">
                  <span className="text-gray-700">Subject {row.id} • P{row.period + 1}</span>
                  <span className="font-semibold text-gray-900">{row.penalty}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 text-xs text-gray-500 border-t border-gray-100">
        Logs: {logs.length}
      </div>
    </section>
  );
}
