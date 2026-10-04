// One way to compare names: lower case, accents removed, punctuation gone.
// "Síndrome de Dravet" and "sindrome de dravet" must find the same record.

export function normalise(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokens(text) {
  const clean = normalise(text);
  return clean ? clean.split(' ') : [];
}

// "2" must not match "22q11", and "a" must not match every word starting
// with a, so single characters and numbers match whole words only.
const wholeWordOnly = token => token.length === 1 || /^\d+$/.test(token);

export function tokenMatches(queryToken, fieldTokens) {
  return wholeWordOnly(queryToken)
    ? fieldTokens.includes(queryToken)
    : fieldTokens.some(fieldToken => fieldToken.startsWith(queryToken));
}

export function list(items, max = 3) {
  const shown = items.slice(0, max).join(', ');
  return items.length > max ? `${shown} (and ${items.length - max} more)` : shown;
}
