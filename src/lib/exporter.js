// Generate rows for CSV from a timetable view.
// timetable: { [classId]: grid[day][period] = { subjectId, teacherId, resourceId?, unassigned? } }
// viewType: 'class' | 'teacher' | 'room'
// id: the selected id for the chosen view (classId / teacherId / roomId)
// options (optional): { days, periods, dayNames }
export function generateCSVRowsForView(timetable, viewType, id, options = {}) {
  const days = options.days || inferDays(timetable);
  const periods = options.periods || inferPeriods(timetable);
  const dayNames = options.dayNames || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].slice(0, days);

  const rows = [];
  // Header
  rows.push(['Day', ...Array.from({ length: periods }, (_, i) => `P${i + 1}`)]);

  if (viewType === 'class') {
    const grid = timetable?.[id];
    for (let d = 0; d < days; d++) {
      const row = [dayNames[d] || `D${d + 1}`];
      for (let p = 0; p < periods; p++) {
        const e = grid?.[d]?.[p];
        row.push(cellToString(e, { includeTeacher: false }));
      }
      rows.push(row);
    }
    return rows;
  }

  if (viewType === 'teacher') {
    for (let d = 0; d < days; d++) {
      const row = [dayNames[d] || `D${d + 1}`];
      for (let p = 0; p < periods; p++) {
        let txt = '';
        for (const [classId, grid] of Object.entries(timetable || {})) {
          const e = grid?.[d]?.[p];
          if (e && !e.unassigned && e.teacherId === id) {
            txt = `${classId}:${e.subjectId || ''}`;
            break;
          }
        }
        row.push(txt || '');
      }
      rows.push(row);
    }
    return rows;
  }

  if (viewType === 'room') {
    for (let d = 0; d < days; d++) {
      const row = [dayNames[d] || `D${d + 1}`];
      for (let p = 0; p < periods; p++) {
        let txt = '';
        for (const [classId, grid] of Object.entries(timetable || {})) {
          const e = grid?.[d]?.[p];
          if (e && !e.unassigned && e.resourceId === id) {
            txt = `${classId}:${e.subjectId || ''}`;
            break;
          }
        }
        row.push(txt || '');
      }
      rows.push(row);
    }
    return rows;
  }

  // default empty
  for (let d = 0; d < days; d++) {
    rows.push([dayNames[d] || `D${d + 1}`, ...Array.from({ length: periods }, () => '')]);
  }
  return rows;
}

function inferDays(timetable) {
  const first = timetable && Object.values(timetable)[0];
  return (first && first.length) || 5;
}

function inferPeriods(timetable) {
  const first = timetable && Object.values(timetable)[0];
  return (first && first[0] && first[0].length) || 6;
}

function cellToString(e, { includeTeacher } = { includeTeacher: false }) {
  if (!e || e.unassigned) return '';
  const subj = e.subjectId || '';
  const t = includeTeacher ? e.teacherId || '' : '';
  return includeTeacher && t ? `${subj} (${t})` : subj;
}

// Trigger a CSV download in the browser using Blob + anchor click
export function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map(escapeCSV).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'timetable.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/\"/g, '""')}"`;
  }
  return str;
}
