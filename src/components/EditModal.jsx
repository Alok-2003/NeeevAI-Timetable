/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react';

export default function EditModal({ open, onClose, cellInfo, onSave }) {
  const [subjectId, setSubjectId] = useState(null);
  const [teacherId, setTeacherId] = useState(null);

  useEffect(() => {
    if (!open || !cellInfo) return;
    setSubjectId(cellInfo.currentSubjectId || (cellInfo.classSubjects[0]?.id ?? null));
    setTeacherId(cellInfo.currentTeacherId || null);
  }, [open, cellInfo]);

  const teacherOptions = useMemo(() => {
    if (!cellInfo || !subjectId) return [];
    const { teachers } = cellInfo;
    return (teachers || []).filter((t) => Array.isArray(t.subjects) && t.subjects.includes(subjectId));
  }, [cellInfo, subjectId]);

  if (!open) return null;

  const handleSave = () => {
    onSave({
      day: cellInfo.day,
      period: cellInfo.period,
      newSubjectId: subjectId || null,
      newTeacherId: teacherId || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white shadow-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold">Edit Period</h3>
          <button
            type="button"
            className="text-gray-500 hover:text-gray-700"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="text-sm text-gray-600">
            <div>Class: <span className="font-medium">{cellInfo?.classId}</span></div>
            <div>Day: <span className="font-medium">{cellInfo?.day + 1}</span>, Period: <span className="font-medium">{cellInfo?.period + 1}</span></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 bg-white"
              value={subjectId || ''}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              {(cellInfo?.classSubjects || []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 bg-white"
              value={teacherId || ''}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">— None —</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {subjectId && teacherOptions.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">No teachers available for this subject.</p>
            )}
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
