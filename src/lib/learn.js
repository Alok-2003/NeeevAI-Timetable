// Learning module: aggregates manual edit logs to produce soft penalties
// Penalties are intended to guide the generator by discouraging assignments
// that users repeatedly moved away from.
//
// Data contract (from store.logEdit usage in GeneratePage):
// log entry example:
//   {
//     before: { subjectId, teacherId } | null,
//     after:  { subjectId, teacherId } | null,
//     location: { classId, day, period },
//     reason: 'manual',
//     at: <timestamp>
//   }
//
// Aggregations we compute (by period index across days):
// - teacherPeriodMoves: teacherId -> period -> count
// - subjectPeriodMoves: subjectId -> period -> count
//
// Exported API:
// - getPreferencePenalties():
//     Returns an object { teacherPeriods: {tid: {period: penalty}}, subjectPeriods: {sid: {period: penalty}} }
//     where penalty = count*5 for teacher-period, and count*3 for subject-period, only when count >= 2
// - applyLearnedPenaltiesToOptions(options):
//     Shallow-copies options and attaches { learnedPenalties } for the generator to use.

import { loadEditLogs } from './store';

function incNested(mapObj, a, b, by = 1) {
  if (!mapObj[a]) mapObj[a] = {};
  mapObj[a][b] = (mapObj[a][b] || 0) + by;
}

export function getAggregates() {
  const logs = loadEditLogs() || [];
  const teacherPeriodMoves = {}; // tid -> period -> count
  const subjectPeriodMoves = {}; // sid -> period -> count

  for (const entry of logs) {
    if (!entry || !entry.location) continue;
    const period = Number(entry.location.period);
    if (!Number.isFinite(period)) continue;

    const before = entry.before || null;
    const after = entry.after || null;

    // Count a "move away" when there was something before and it changed/cleared
    if (before && (after == null || before.subjectId !== after.subjectId || before.teacherId !== after.teacherId)) {
      if (before.teacherId) incNested(teacherPeriodMoves, String(before.teacherId), String(period), 1);
      if (before.subjectId) incNested(subjectPeriodMoves, String(before.subjectId), String(period), 1);
    }
  }

  return { teacherPeriodMoves, subjectPeriodMoves };
}

export function getPreferencePenalties() {
  const { teacherPeriodMoves, subjectPeriodMoves } = getAggregates();

  const teacherPeriods = {};
  for (const [tid, perMap] of Object.entries(teacherPeriodMoves)) {
    for (const [per, count] of Object.entries(perMap)) {
      if (count >= 2) {
        if (!teacherPeriods[tid]) teacherPeriods[tid] = {};
        teacherPeriods[tid][Number(per)] = count * 5; // weight for teacher-period
      }
    }
  }

  const subjectPeriods = {};
  for (const [sid, perMap] of Object.entries(subjectPeriodMoves)) {
    for (const [per, count] of Object.entries(perMap)) {
      if (count >= 2) {
        if (!subjectPeriods[sid]) subjectPeriods[sid] = {};
        subjectPeriods[sid][Number(per)] = count * 3; // weight for subject-period
      }
    }
  }

  return { teacherPeriods, subjectPeriods };
}

export function applyLearnedPenaltiesToOptions(options = {}) {
  const learnedPenalties = getPreferencePenalties();
  return { ...options, learnedPenalties };
}
