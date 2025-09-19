const KEY_SCHOOL_DATA = 'simple-timetable-v1';
const KEY_TIMETABLES = 'timetables-v1';
const KEY_EDIT_LOGS = 'editlogs-v1';

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// School Data
export function saveSchoolData(data) {
  if (data == null || typeof data !== 'object') {
    throw new Error('saveSchoolData expects an object');
  }
  safeSet(KEY_SCHOOL_DATA, data);
  return data;
}

export function loadSchoolData() {
  return safeGet(KEY_SCHOOL_DATA, null);
}

// Timetables
export function saveTimetable(name, timetable) {
  if (!name || typeof name !== 'string') {
    throw new Error('saveTimetable requires a name (string)');
  }
  const all = safeGet(KEY_TIMETABLES, []);
  const now = Date.now();
  const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = { id, name, data: timetable ?? null, savedAt: now };
  all.push(entry);
  safeSet(KEY_TIMETABLES, all);
  return entry;
}

export function listTimetables() {
  const all = safeGet(KEY_TIMETABLES, []);
  // Return metadata only to keep list light
  return all.map(({ id, name, savedAt }) => ({ id, name, savedAt }));
}

// Edit Logs
export function logEdit(edit) {
  const all = safeGet(KEY_EDIT_LOGS, []);
  const entry =
    typeof edit === 'object' && edit !== null
      ? { ...edit, at: edit.at ?? Date.now() }
      : { message: String(edit), at: Date.now() };
  all.push(entry);
  safeSet(KEY_EDIT_LOGS, all);
  return entry;
}

export function loadEditLogs() {
  return safeGet(KEY_EDIT_LOGS, []);
}
