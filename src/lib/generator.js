/*
  Timetable Generator (browser-friendly, no external libs)
  - Export: generateTimetable(schoolData, options)
  - Returns: { timetable, diagnostics }
  - Greedy deterministic assignment + local swap optimizer
*/

// Simple deterministic PRNG (LCG). Seedable to make optimization reproducible.
function createRng(seed = 42) {
  let s = (seed >>> 0) || 42;
  return {
    next() {
      // LCG constants (Numerical Recipes)
      s = (1664525 * s + 1013904223) >>> 0;
      return s;
    },
    nextFloat() {
      return (this.next() >>> 0) / 0xffffffff;
    },
    pick(arr) {
      if (!arr || arr.length === 0) return undefined;
      const i = Math.floor(this.nextFloat() * arr.length);
      return arr[i];
    }
  };
}

// Build quick lookup indices and normalized structures
function buildIndex(data) {
  const subjectsById = new Map();
  (data.subjects || []).forEach((s) => subjectsById.set(s.id, s));

  const teachersById = new Map();
  (data.teachers || []).forEach((t) => teachersById.set(t.id, t));

  const resources = Array.isArray(data.resources) ? data.resources : [];
  const resourcesByType = new Map();
  for (const r of resources) {
    if (!resourcesByType.has(r.type)) resourcesByType.set(r.type, []);
    resourcesByType.get(r.type).push(r);
  }

  return { subjectsById, teachersById, resourcesByType };
}

function inferSubjectResourceType(subject) {
  // Prefer explicit .resourceType; else infer from .lab flag and name
  if (subject.resourceType) return subject.resourceType;
  if (subject.lab) {
    const name = (subject.name || '').toLowerCase();
    if (name.includes('computer')) return 'computer_lab';
    return 'lab';
  }
  return null;
}

function makeEmptyGrid(days, periods, fill = null) {
  const grid = new Array(days);
  for (let d = 0; d < days; d++) {
    grid[d] = new Array(periods);
    for (let p = 0; p < periods; p++) grid[d][p] = fill;
  }
  return grid;
}

function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

// Compute simple diagnostics/penalty
function computeDiagnostics(timetable, data) {
  const { workingDays: days, periodsPerDay: periods } = data;
  let unassignedCount = 0;
  let penalty = 0;

  // Teacher loads
  const teacherLoads = new Map();

  // For teacher idle-gap, we need per-teacher schedule by day
  const teacherDayUsage = new Map(); // tid -> day -> periods boolean

  for (const [classId, grid] of Object.entries(timetable)) {
    for (let d = 0; d < days; d++) {
      // same subject consecutive periods for same class
      for (let p = 0; p < periods; p++) {
        const entry = grid[d][p];
        if (!entry) continue;
        if (entry.unassigned) {
          unassignedCount += 1;
          penalty += 20;
          continue;
        }
        if (entry.teacherId) {
          teacherLoads.set(entry.teacherId, (teacherLoads.get(entry.teacherId) || 0) + 1);
          if (!teacherDayUsage.has(entry.teacherId)) teacherDayUsage.set(entry.teacherId, new Map());
          const dayMap = teacherDayUsage.get(entry.teacherId);
          if (!dayMap.has(d)) dayMap.set(d, new Array(periods).fill(false));
          dayMap.get(d)[p] = true;
        }
        if (p + 1 < periods) {
          const next = grid[d][p + 1];
          if (
            next &&
            !next.unassigned &&
            entry.subjectId &&
            next.subjectId &&
            entry.subjectId === next.subjectId
          ) {
            penalty += 10;
          }
        }
      }
    }
  }

  // Teacher idle-gap: pattern assigned, free, assigned in the same day
  for (const [, dayMap] of teacherDayUsage.entries()) {
    for (const [, dayArr] of dayMap.entries()) {
      for (let p = 1; p + 1 < dayArr.length; p++) {
        if (dayArr[p - 1] && !dayArr[p] && dayArr[p + 1]) penalty += 5;
      }
    }
  }

  // Convert teacherLoads map to plain object
  const teacherLoadsObj = {};
  for (const [k, v] of teacherLoads.entries()) teacherLoadsObj[k] = v;

  return { unassignedCount, penaltyScore: penalty, teacherLoads: teacherLoadsObj };
}

// Check if teacher is free and available in given slots
function teacherCanTeach(teacher, subjectId) {
  return Array.isArray(teacher.subjects) && teacher.subjects.includes(subjectId);
}

function checkTeacherAvailability(teacher, day, periods) {
  // periods: array of period indices we want
  if (!Array.isArray(teacher.availability)) return false;
  if (day < 0 || day >= teacher.availability.length) return false;
  const dayArr = teacher.availability[day];
  if (!Array.isArray(dayArr)) return false;
  return periods.every((p) => dayArr[p] === true);
}

function slotsAreFree(grid, day, periods) {
  return periods.every((p) => !grid[day][p]);
}

function teacherFreeSchedule(teacherSchedule, teacherId, day, periods) {
  const dayMap = teacherSchedule.get(teacherId) || new Map();
  const usedArr = dayMap.get(day) || new Set();
  for (const p of periods) if (usedArr.has(p)) return false;
  return true;
}

function occupyTeacherSchedule(teacherSchedule, teacherId, day, periods) {
  if (!teacherSchedule.has(teacherId)) teacherSchedule.set(teacherId, new Map());
  const dayMap = teacherSchedule.get(teacherId);
  if (!dayMap.has(day)) dayMap.set(day, new Set());
  const used = dayMap.get(day);
  for (const p of periods) used.add(p);
}

function resourceFree(resource, day, periods) {
  // Resource has its own availability matrix
  if (!Array.isArray(resource.availability)) return true;
  if (day < 0 || day >= resource.availability.length) return false;
  const dayArr = resource.availability[day];
  if (!Array.isArray(dayArr)) return false;
  return periods.every((p) => dayArr[p] === true);
}

function resourceOccupied(resourceSchedule, resourceId, day, periods) {
  const dayMap = resourceSchedule.get(resourceId) || new Map();
  const usedArr = dayMap.get(day) || new Set();
  for (const p of periods) if (usedArr.has(p)) return true;
  return false;
}

function occupyResource(resourceSchedule, resourceId, day, periods) {
  if (!resourceSchedule.has(resourceId)) resourceSchedule.set(resourceId, new Map());
  const dayMap = resourceSchedule.get(resourceId);
  if (!dayMap.has(day)) dayMap.set(day, new Set());
  const used = dayMap.get(day);
  for (const p of periods) used.add(p);
}

function totalTeacherLoad(teacherLoads, teacherId) {
  return teacherLoads.get(teacherId) || 0;
}

function incTeacherLoad(teacherLoads, teacherId, by = 1) {
  teacherLoads.set(teacherId, (teacherLoads.get(teacherId) || 0) + by);
}

function tryAssignSlot(args) {
  const {
    classGrid,
    subjectId,
    requiresDouble,
    teacherList,
    teachersById,
    teacherSchedule,
    teacherLoads,
    maxLoadByTeacher,
    dayCount,
    periodCount,
    resourceType,
    availableResources,
    resourceSchedule,
  } = args;

  const periodSpan = requiresDouble ? 2 : 1;

  for (let d = 0; d < dayCount; d++) {
    for (let p = 0; p + periodSpan - 1 < periodCount; p++) {
      const periods = requiresDouble ? [p, p + 1] : [p];
      if (!slotsAreFree(classGrid, d, periods)) continue;

      // Try teachers in deterministic order (by id)
      for (const teacherId of teacherList) {
        const t = teachersById.get(teacherId);
        if (!t) continue;
        if (!teacherCanTeach(t, subjectId)) continue;
        if (!checkTeacherAvailability(t, d, periods)) continue;
        if (!teacherFreeSchedule(teacherSchedule, teacherId, d, periods)) continue;
        if (totalTeacherLoad(teacherLoads, teacherId) + periodSpan > (maxLoadByTeacher.get(teacherId) || 0)) continue;

        // Resource if needed
        let chosenResource = null;
        if (resourceType) {
          const list = availableResources.get(resourceType) || [];
          for (const r of list) {
            if (!resourceFree(r, d, periods)) continue;
            if (resourceOccupied(resourceSchedule, r.id, d, periods)) continue;
            chosenResource = r;
            break;
          }
          if (!chosenResource) continue; // need resource but none free
        }

        // Assign
        const entry = { subjectId, teacherId };
        if (chosenResource) entry.resourceId = chosenResource.id;
        if (requiresDouble) entry.double = true, entry.headOfDouble = true;
        classGrid[d][p] = entry;
        if (requiresDouble) {
          classGrid[d][p + 1] = { ...entry, headOfDouble: false };
        }
        occupyTeacherSchedule(teacherSchedule, teacherId, d, periods);
        if (chosenResource) occupyResource(resourceSchedule, chosenResource.id, d, periods);
        incTeacherLoad(teacherLoads, teacherId, periodSpan);
        return true;
      }
    }
  }

  // Mark first available class slots as unassigned to preserve need
  for (let d = 0; d < dayCount; d++) {
    for (let p = 0; p + periodSpan - 1 < periodCount; p++) {
      const periods = requiresDouble ? [p, p + 1] : [p];
      if (!slotsAreFree(classGrid, d, periods)) continue;
      const un = { subjectId, unassigned: true };
      classGrid[d][p] = un;
      if (requiresDouble) classGrid[d][p + 1] = { ...un };
      return false;
    }
  }
  return false;
}

function collectAssignedSlots(timetable, data) {
  const items = [];
  for (const [classId, grid] of Object.entries(timetable)) {
    for (let d = 0; d < data.workingDays; d++) {
      for (let p = 0; p < data.periodsPerDay; p++) {
        const e = grid[d][p];
        if (!e || e.unassigned) continue;
        // Avoid double-counting the second half of doubles
        if (e.double && e.headOfDouble === false) continue;
        items.push({ classId, day: d, period: p, entry: e });
      }
    }
  }
  return items;
}

function swapFeasible(a, b, timetable, data, indices) {
  // Try swapping entries a and b; ensure no teacher/resource conflicts across their target slots
  const { teachersById, resourcesByType } = indices;
  const days = data.workingDays;
  const periods = data.periodsPerDay;

  const Agrid = timetable[a.classId];
  const Bgrid = timetable[b.classId];

  const Aentry = Agrid[a.day][a.period];
  const Bentry = Bgrid[b.day][b.period];

  // Determine spans
  const Aperiods = Aentry.double ? [a.period, a.period + 1] : [a.period];
  const Bperiods = Bentry.double ? [b.period, b.period + 1] : [b.period];

  if (Aentry.double && a.period + 1 >= periods) return false;
  if (Bentry.double && b.period + 1 >= periods) return false;

  // Destination occupancy within target grids
  // Ensure destination slots are free or belong to the counterpart entry (so swap doesn't overlap others)
  function destFree(targetGrid, day, perArr, exceptEntry) {
    for (const p of perArr) {
      const x = targetGrid[day][p];
      if (!x) continue;
      if (x === exceptEntry) continue;
      // Allow the second half of the same double being moved together
      if (exceptEntry.double && x.double && x.subjectId === exceptEntry.subjectId && x.teacherId === exceptEntry.teacherId) continue;
      return false;
    }
    return true;
  }

  if (!destFree(Bgrid, a.day, Aperiods, Bentry)) return false;
  if (!destFree(Agrid, b.day, Bperiods, Aentry)) return false;

  // Teacher conflicts at new times: teacher cannot teach two classes at same time
  function teacherHasConflict(movingEntry, destClassId, day, perArr) {
    for (const p of perArr) {
      // Scan all other classes at (day,p)
      for (const [cid, grid] of Object.entries(timetable)) {
        if (cid === destClassId) continue; // other classes only
        const e = grid[day][p];
        if (!e || e.unassigned) continue;
        if (e.teacherId && movingEntry.teacherId && e.teacherId === movingEntry.teacherId) return true;
        if (movingEntry.resourceId && e.resourceId && e.resourceId === movingEntry.resourceId) return true;
      }
    }
    return false;
  }

  if (teacherHasConflict(Aentry, b.classId, b.day, Bperiods)) return false;
  if (teacherHasConflict(Bentry, a.classId, a.day, Aperiods)) return false;

  return true;
}

function applySwap(a, b, timetable) {
  const Agrid = timetable[a.classId];
  const Bgrid = timetable[b.classId];
  const A = Agrid[a.day][a.period];
  const B = Bgrid[b.day][b.period];

  // Clear original spans
  function clearSpan(grid, day, startEntry) {
    const periods = startEntry.double ? [startEntry, grid[day][a.period + 1]] : [startEntry];
  }

  // Move A -> B location
  function moveEntry(srcGrid, src, dstGrid, dst) {
    const entry = srcGrid[src.day][src.period];
    const span = entry.double ? [0, 1] : [0];

    // Clear original
    srcGrid[src.day][src.period] = null;
    if (entry.double) srcGrid[src.day][src.period + 1] = null;

    // Place at destination
    dstGrid[dst.day][dst.period] = { ...entry, headOfDouble: entry.double ? true : undefined };
    if (entry.double) dstGrid[dst.day][dst.period + 1] = { ...entry, headOfDouble: false };
  }

  moveEntry(Agrid, a, Bgrid, b);
  moveEntry(Bgrid, b, Agrid, a);
}

export function generateTimetable(schoolData, options = {}) {
  const t0 = Date.now();
  const { workingDays: days, periodsPerDay: periods } = schoolData;
  const { subjectsById, teachersById, resourcesByType } = buildIndex(schoolData);

  // Build empty timetable per class
  const timetable = {};
  for (const c of schoolData.classes || []) {
    timetable[c.id] = makeEmptyGrid(days, periods, null);
  }

  // Precompute teacher max loads
  const maxLoadByTeacher = new Map();
  (schoolData.teachers || []).forEach((t) => maxLoadByTeacher.set(t.id, t.maxLoad || 0));

  // Flatten required class-subject slots
  const required = [];
  for (const cls of schoolData.classes || []) {
    const subjMap = cls.subjects || {};
    for (const sid of Object.keys(subjMap)) {
      const count = subjMap[sid] | 0;
      const subj = subjectsById.get(sid) || { id: sid, name: sid };
      const requiresDouble = !!subj.doublePeriod;
      const resourceType = inferSubjectResourceType(subj);
      for (let i = 0; i < count; i++) {
        required.push({
          classId: cls.id,
          subjectId: sid,
          requiresDouble,
          weeklyPeriods: subj.weeklyPeriods || count,
          resourceType,
          priorityLab: !!resourceType,
        });
      }
    }
  }

  // Order slots by difficulty: double/lab first, then high weeklyPeriods
  required.sort((a, b) => {
    const a1 = a.requiresDouble === b.requiresDouble ? 0 : a.requiresDouble ? -1 : 1;
    if (a1 !== 0) return a1;
    const a2 = a.priorityLab === b.priorityLab ? 0 : a.priorityLab ? -1 : 1;
    if (a2 !== 0) return a2;
    const a3 = (b.weeklyPeriods | 0) - (a.weeklyPeriods | 0);
    if (a3 !== 0) return a3;
    // Stable deterministic tie-breakers
    if (a.classId !== b.classId) return a.classId < b.classId ? -1 : 1;
    if (a.subjectId !== b.subjectId) return a.subjectId < b.subjectId ? -1 : 1;
    return 0;
  });

  // Schedules and loads during greedy assignment
  const teacherSchedule = new Map(); // tid -> day -> Set(period)
  const resourceSchedule = new Map(); // rid -> day -> Set(period)
  const teacherLoads = new Map();

  // Deterministic teacher iteration order
  const teacherOrder = (schoolData.teachers || []).map((t) => t.id).sort();

  // Assign greedily per required slot
  for (const slot of required) {
    const classGrid = timetable[slot.classId];
    tryAssignSlot({
      classGrid,
      subjectId: slot.subjectId,
      requiresDouble: slot.requiresDouble,
      teacherList: teacherOrder,
      teachersById,
      teacherSchedule,
      teacherLoads,
      maxLoadByTeacher,
      dayCount: days,
      periodCount: periods,
      resourceType: slot.resourceType,
      availableResources: resourcesByType,
      resourceSchedule,
    });
  }

  // Local-swap optimizer
  const iterations = Math.max(0, options.optimizeIterations ?? 200);
  const rng = createRng((options && options.seed) || 42);

  function totalPenalty() {
    return computeDiagnostics(timetable, schoolData).penaltyScore;
  }

  let bestPenalty = totalPenalty();
  for (let it = 0; it < iterations; it++) {
    const pool = collectAssignedSlots(timetable, schoolData);
    if (pool.length < 2) break;
    // Pick two different entries
    const a = pool[Math.floor(rng.nextFloat() * pool.length)];
    let b = pool[Math.floor(rng.nextFloat() * pool.length)];
    if (!a || !b) continue;
    if (a.classId === b.classId && a.day === b.day && a.period === b.period) continue;

    if (!swapFeasible(a, b, timetable, schoolData, { teachersById, resourcesByType })) continue;

    // Apply swap and evaluate
    const snapshot = {
      Agr: cloneGrid(timetable[a.classId]),
      Bgr: cloneGrid(timetable[b.classId])
    };
    applySwap(a, b, timetable);
    const newPenalty = totalPenalty();
    if (newPenalty < bestPenalty) {
      bestPenalty = newPenalty; // keep
    } else {
      // revert
      timetable[a.classId] = snapshot.Agr;
      timetable[b.classId] = snapshot.Bgr;
    }
  }

  const diag = computeDiagnostics(timetable, schoolData);
  const t1 = Date.now();
  return {
    timetable,
    diagnostics: {
      ...diag,
      timeTakenMs: t1 - t0,
      timeMs: t1 - t0,
    },
  };
}

// UI-friendly helper: return a single numeric penalty for a timetable
export function computePenalty(timetable, schoolData, learnedPenalties) {
  // learnedPenalties is reserved for future use (e.g., user feedback weighting)
  const d = computeDiagnostics(timetable, schoolData);
  return d.penaltyScore || 0;
}
