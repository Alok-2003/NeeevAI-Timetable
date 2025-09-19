/* Client helpers for Gemini usage in-browser.
// WARNING: Storing API keys in the browser exposes them to end users. Use only for internal testing.
// - Explanations: getCellExplanation({ classId, subjectId, teacherId, resourceId, constraintsSummary })
// - Optimization hints: getOptimizationHints(schoolData, currentStats, userIterations)
// Setup in console for testing:
//   sessionStorage.setItem('VITE_GEMINI_API_KEY','paste-key-here')
//   sessionStorage.setItem('GEMINI_ENABLED','1')

export async function getCellExplanation({ classId, subjectId, teacherId, resourceId, constraintsSummary }) {
  const key = safeGetSession('VITE_GEMINI_API_KEY');
  const remoteEnabled = !!safeGetSession('GEMINI_ENABLED');

  const fallback = () => makeFallback({ classId, subjectId, teacherId, resourceId, constraintsSummary });

  if (!key || !remoteEnabled) {
    return fallback();
  }

// Generate a complete timetable using Gemini and return { timetable, raw }
export async function generateTimetableWithAI(schoolData) {
  const key = safeGetSession('VITE_GEMINI_API_KEY');
  if (!key) return null;
  const days = schoolData?.workingDays || 5;
  const periods = schoolData?.periodsPerDay || 6;
  const payload = JSON.stringify(schoolData);
  const prompt = `You are a timetable optimizer. Generate a conflict-free weekly timetable strictly as JSON.\n` +
    `Constraints:\n` +
    `- Days: ${days}, Periods per day: ${periods}\n` +
    `- A teacher cannot teach two classes at the same period.\n` +
    `- Respect teacher availability matrices (true means available).\n` +
    `- Respect subject weekly counts per class (classes[*].subjects mapping).\n` +
    `- If a subject requires lab (subject.lab==true), allocate a resource (type 'lab' or 'computer_lab') that is available.\n` +
    `- Allow null in slots where assignment is not possible, but minimize nulls.\n` +
    `Output format ONLY JSON (no code fences, no prose):\n` +
  const prompt = `Explain concisely (<=40 words) why this assignment is reasonable:
Class: ${classId || '-'}
Subject: ${subjectId || '-'}
Teacher: ${teacherId || '-'}
Resource: ${resourceId || '-'}
Constraints: ${constraintsSummary || '-'}`;

  // Gemini generateContent
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [
      { role: 'user', parts: [{ text: prompt }] }
    ]
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return fallback();
    }
    const data = await res.json();
    const text = extractGeminiText(data) || '';
    return text.trim() || fallback();
  } catch (err) {
    // timeout/abort/network
    return fallback();
  }
}

// Ask Gemini for suggested optimize iterations and seed. Returns safe defaults if disabled.
export async function getOptimizationHints(schoolData, currentStats = {}, userIterations = 200) {
  const key = safeGetSession('VITE_GEMINI_API_KEY');
  const enabled = true; // force using Gemini when key is available
  const fallback = () => null; // signal caller not to proceed without AI
  if (!key || !enabled) return fallback();

  const brief = summarizeSchool(schoolData);
  const diag = JSON.stringify(currentStats || {});
  const prompt = `Given this school timetable context and current diagnostics, suggest an integer optimizeIterations (0-1000) and a numeric seed (1-2^31-1) to reduce penalty and balance teacher loads.
Return ONLY a compact JSON object: {"iterations":number,"seed":number}.
School: ${brief}
Diagnostics: ${diag}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`;
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return fallback();
    const data = await res.json();
    const text = extractGeminiText(data) || '';
    console.log('[Gemini:getOptimizationHints] raw response:', data);
    console.log('[Gemini:getOptimizationHints] extracted text:', text);
    const json = safeJsonFromText(text);
    if (!json) return fallback();
    const it = clampInt(json.iterations, 0, 1000, Math.max(50, Number(userIterations) || 200));
    const seed = clampInt(json.seed, 1, 2147483647, 42);
    return { iterations: it, seed, _raw: text };
  } catch {
    return fallback();
  }
}

function safeGetSession(k) {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}

function makeFallback({ classId, subjectId, teacherId, resourceId, constraintsSummary }) {
  const parts = [];
  if (classId) parts.push(`for ${classId}`);
  if (subjectId) parts.push(`in ${subjectId}`);
  if (teacherId) parts.push(`with ${short(teacherId)}`);
  if (resourceId) parts.push(`using ${resourceId}`);
  const base = parts.length ? parts.join(' ') : 'this slot';
  const constraintHint = constraintsSummary ? ' Fits key constraints.' : '';
  // Keep within ~40 words (heuristic)
  return `${capitalize(base)} balances teacher availability and timetable load.${constraintHint}`.slice(0, 240);
}

function short(s) {
  return String(s).split(/\s+/)[0];
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Extract plain text from Gemini response
function extractGeminiText(data) {
  try {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts) && parts[0]?.text) return parts[0].text;
  } catch {}
  return '';
}

function safeJsonFromText(s) {
  if (!s) return null;
  // Try to find first {...} block
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function summarizeSchool(data) {
  if (!data) return '{}';
  const days = data.workingDays;
  const periods = data.periodsPerDay;
  const subj = (data.subjects || []).length;
  const teach = (data.teachers || []).length;
  const cls = (data.classes || []).map((c) => c.name || c.id).join(', ');
  return `days=${days}, periods=${periods}, subjects=${subj}, teachers=${teach}, classes=[${cls.slice(0, 200)}]`;
}

*/
export { generateTimetableWithAI, getOptimizationHints, getCellExplanation } from './ai';
