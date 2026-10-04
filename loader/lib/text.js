// Small helpers for writing plain sentences.

// "a", "a and b", "a, b and c"
export function listInWords(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Lower-cases the first letter unless the word looks like an abbreviation
// ("EEG abnormality" stays as it is).
export function lowerFirst(text) {
  if (text.length < 2) return text.toLowerCase();
  const second = text[1];
  return second === second.toLowerCase() && second !== second.toUpperCase() ? text[0].toLowerCase() + text.slice(1) : text;
}

export const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export const round = (value, places = 3) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};
