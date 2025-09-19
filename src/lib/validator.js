export function validateSchoolData(obj) {
  const errors = [];

  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['Invalid data object'] };
    }

  const { workingDays, periodsPerDay, subjects, teachers, classes } = obj;

  // Numbers
  if (typeof workingDays !== 'number' || workingDays <= 0) {
    errors.push('workingDays: positive number');
  }
  if (typeof periodsPerDay !== 'number' || periodsPerDay <= 0) {
    errors.push('periodsPerDay: positive number');
  }

  // Subjects
  if (!Array.isArray(subjects) || subjects.length === 0) {
    errors.push('subjects: non-empty array');
  } else {
    subjects.forEach((s, i) => {
      if (!s || typeof s !== 'object') {
        errors.push(`subjects[${i}]: invalid`);
        return;
      }
      if (typeof s.id !== 'string' || !s.id) errors.push(`subjects[${i}].id`);
      if (typeof s.name !== 'string' || !s.name) errors.push(`subjects[${i}].name`);
      if (typeof s.weeklyPeriods !== 'number' || s.weeklyPeriods < 0) {
        errors.push(`subjects[${i}].weeklyPeriods`);
      }
    });
  }

  // Teachers
  if (!Array.isArray(teachers) || teachers.length === 0) {
    errors.push('teachers: non-empty array');
  } else {
    teachers.forEach((t, i) => {
      if (!t || typeof t !== 'object') {
        errors.push(`teachers[${i}]: invalid`);
        return;
      }
      if (typeof t.id !== 'string' || !t.id) errors.push(`teachers[${i}].id`);
      if (typeof t.name !== 'string' || !t.name) errors.push(`teachers[${i}].name`);
      if (!Array.isArray(t.subjects) || t.subjects.length === 0) errors.push(`teachers[${i}].subjects`);
      if (typeof t.maxLoad !== 'number' || t.maxLoad <= 0) errors.push(`teachers[${i}].maxLoad`);

      if (!Array.isArray(t.availability) || t.availability.length !== workingDays) {
        errors.push(`teachers[${i}].availability: ${workingDays} days`);
      } else {
        t.availability.forEach((dayArr, d) => {
          if (!Array.isArray(dayArr) || dayArr.length !== periodsPerDay) {
            errors.push(`teachers[${i}].availability[${d}]: ${periodsPerDay} periods`);
          } else {
            for (let p = 0; p < dayArr.length; p++) {
              if (typeof dayArr[p] !== 'boolean') {
                errors.push(`teachers[${i}].availability[${d}][${p}]: boolean`);
                break;
              }
            }
          }
        });
      }
    });
  }

  // Classes
  if (!Array.isArray(classes) || classes.length === 0) {
    errors.push('classes: non-empty array');
  } else {
    classes.forEach((c, i) => {
      if (!c || typeof c !== 'object') {
        errors.push(`classes[${i}]: invalid`);
        return;
      }
      if (typeof c.id !== 'string' || !c.id) errors.push(`classes[${i}].id`);
      if (typeof c.name !== 'string' || !c.name) errors.push(`classes[${i}].name`);
      if (!c.subjects || typeof c.subjects !== 'object') {
        errors.push(`classes[${i}].subjects: mapping`);
      } else {
        const keys = Object.keys(c.subjects);
        if (keys.length === 0) errors.push(`classes[${i}].subjects: empty`);
        keys.forEach((sid) => {
          const cnt = c.subjects[sid];
          if (typeof cnt !== 'number' || cnt < 0) errors.push(`classes[${i}].subjects['${sid}']`);
        });
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
