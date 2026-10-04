// A Gap is the atlas's honest "nothing supports that": what was asked, where
// it looked, what evidence would change the answer, and what to try next.
// The wording is plain English; the voice agent translates it when speaking.

const clean = items => items.filter(item => typeof item === 'string' && item.trim());

export function gap({ question, searched = [], missing = [], nextSteps = [] }) {
  return { question, searched: clean(searched), missing: clean(missing), nextSteps: clean(nextSteps) };
}

// One line naming the sources this build of the graph was made from.
export function sourcesLine(build) {
  const names = [...new Set((build?.sources || []).map(source => {
    if (!source?.name) return '';
    return source.version ? `${source.name} ${source.version}` : source.name;
  }).filter(Boolean))];
  if (!names.length) return 'This build of the atlas lists no sources.';
  const shown = names.slice(0, 6).join('; ');
  return names.length > 6
    ? `Sources in this build: ${shown}; and ${names.length - 6} more.`
    : `Sources in this build: ${shown}.`;
}
