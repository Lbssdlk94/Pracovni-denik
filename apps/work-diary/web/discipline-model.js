export const DISCIPLINES = Object.freeze(['irrigation', 'garden']);
export const DISCIPLINE_LABELS = Object.freeze({irrigation: 'Závlaha', garden: 'Garden'});

// "Obojí" is a label for two memberships, never a third stored discipline.
export function normalizeDisciplines(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 2 ||
      values.some(value => !DISCIPLINES.includes(value)) || new Set(values).size !== values.length) {
    throw new TypeError('Vyberte Závlaha, Garden nebo oba obory.');
  }
  return DISCIPLINES.filter(value => values.includes(value));
}

export function disciplineLabel(values) {
  const normalized = normalizeDisciplines(values);
  return normalized.length === 2 ? 'Obojí' : DISCIPLINE_LABELS[normalized[0]];
}
