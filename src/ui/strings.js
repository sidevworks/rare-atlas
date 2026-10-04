// Every word the interface shows. One table per language; English fills any
// key another table lacks. What the atlas itself says (statements, sources,
// the brief) comes from the graph and is never written here.

const en = {
  appName: 'Rare Atlas',
  close: 'Close',
  back: 'Back',

  bootOpening: 'Opening the atlas…',
  bootFailed: 'The atlas could not be reached.',
  bootRetry: 'Try again',

  sampleData: 'Sample data',
  sampleDataWhy: 'These records are made up to show how the atlas works. None of them describes a real disease, gene, group or study.',
  notAdvice: 'Not medical advice. The atlas shows what public sources say and does not diagnose.',
  aboutData: 'About the data',

  // Before the visitor walks up
  inviteTitle: 'Every star is a rare disease.',
  inviteBody: 'Walk up to the desk and ask about one, in any language. The atlas answers only from sources it can lay in front of you.',
  inviteBodyNoVoice: 'Type a disease, a gene or a symptom in the search box. The atlas answers only from sources it can lay in front of you.',
  inviteApproach: 'Approach the desk',
  inviteType: 'Type instead',

  // Voice
  voiceAway: 'Approach the desk to talk',
  voiceIdle: 'Paused. Press the microphone to talk.',
  voiceConnecting: 'Connecting…',
  voiceListening: 'Listening. Ask in any language.',
  voiceThinking: 'Thinking…',
  voiceSpeaking: 'Speaking',
  voiceError: 'Voice is not working right now. The search box still works.',
  voiceUnavailable: 'Voice is not available here. Use the search box.',
  micStart: 'Start talking',
  micStop: 'Stop the microphone',
  leave: 'Leave the desk',
  captionsLabel: 'Captions',
  captionYou: 'You',
  captionAtlas: 'Atlas',

  // The quiet line while a lookup runs
  lookFind: 'Looking in the atlas for “{query}”…',
  lookDisease: 'Reading what the atlas holds on {name}…',
  lookConnections: 'Looking for diseases related to {name}…',
  lookAssets: 'Looking for groups, registries and studies linked to {name}…',
  lookBrief: 'Writing the one-page proposal from the sources…',
  lookGeneric: 'Looking in the atlas…',
  lookFailed: 'That lookup did not go through. {message}',

  // Search
  searchLabel: 'Search the atlas',
  searchPlaceholder: 'Disease, gene or symptom',
  searchSubmit: 'Search',
  searchResults: 'Search results',
  searchNoneYet: 'No match so far. Press Enter to search the whole atlas.',
  searchNone: 'Nothing matched “{q}”. Where the atlas looked is on the desk.',
  searchFailed: 'The search did not go through. {message}',
  searchCount_one: '{n} match. Use the arrow keys to choose.',
  searchCount_other: '{n} matches. Use the arrow keys to choose.',
  searchMatched: 'Matched on {text}',
  searchMatchedSynonym: 'Also called {text}',
  searchMatchedGene: 'Matches the gene {text}',
  searchMatchedPartial: 'Partial match: {text}',
  searchPlaceholderLive: 'Type a question or a disease name',
  searchAsk: 'Ask',
  language: 'Language',

  // The desk
  deskLabel: 'The desk',
  deskLoose: 'On the desk',
  deskBackHome: 'Back to {name}',
  layerDeep: 'Checked by hand',
  layerWide: 'From open files, not yet checked by hand',
  deskGrow: 'Show more of the desk',
  deskShrink: 'Show less of the desk',
  deskViews: 'Ways to read the desk',
  tabSources: 'Sources',
  tabConnections: 'Connections',
  tabSteps: 'Next steps',
  tabNew: 'new',
  definitionFrom: 'Definition recorded under {id}',
  alsoCalled: 'Also called {names}',
  readMore: 'Read more',
  readLess: 'Read less',
  deskEmpty: 'Nothing is on the desk yet.',
  deskAnnounce_one: '{n} source card is on the desk for {name}.',
  deskAnnounce_other: '{n} source cards are on the desk for {name}.',
  deskAnnounceGap: 'The atlas found nothing it can support. The details are on the desk.',
  withheld_one: '{n} link arrived without a source and is not shown.',
  withheld_other: '{n} links arrived without a source and are not shown.',
  showAll: 'Show all {n}',
  showAllDisputed: 'Show all {n} ({d} disputed)',
  showFewer: 'Show fewer',

  'group_disease-gene': 'Genes',
  'group_gene-mechanism': 'How the gene acts',
  'group_gene-pathway': 'Pathways',
  'group_disease-similar': 'Related diseases',
  'group_group-disease': 'Patient groups',
  'group_group-asset': 'Registries, biobanks and research tools',
  'group_study-disease': 'Studies and trials',
  'group_publication-claim': 'Published findings',
  'group_person-works-on': 'People working on this',
  'group_disease-phenotype': 'Symptoms',
  group_other: 'Other links',

  // A source card
  observed: 'Observed',
  inferred: 'Inferred: a lead to check',
  conf_high: 'High confidence',
  conf_medium: 'Medium confidence',
  conf_low: 'Low confidence',
  conf_unknown: 'Confidence not recorded',
  disputed: 'Another source disagrees',
  aboutDisease: 'About {name}',
  sourcesMore_one: 'and {n} more source',
  sourcesMore_other: 'and {n} more sources',

  // The gap card
  gapTitle: 'The atlas holds nothing that supports this.',
  gapAsked: 'What was asked',
  gapSearched: 'Where the atlas looked',
  gapNothing: 'nothing found',
  gapSearchedNone: 'The atlas did not record where it looked.',
  gapMissing: 'What evidence would change the answer',
  gapNext: 'What to do next',
  gapNoneRecorded: 'Nothing recorded.',
  gapEarlier: 'Asked earlier: {question}',

  // The evidence sheet
  evidenceLabel: 'Evidence',
  evKind: 'Kind of link',
  evBetween: 'Between',
  evBasis: 'How the atlas knows',
  evObserved: 'Observed. A source states this directly.',
  evInferred: 'Inferred. The atlas worked this out from observed links. It is a lead to check, not a finding.',
  evWhy: 'Why this confidence',
  evWhyMissing: 'The atlas did not record a reason.',
  evScore: 'Closeness score {score} out of 1',
  evSources: 'Sources',
  evNoSources: 'No source is recorded, so this link should not be relied on.',
  evRecord: 'Record {id}',
  evVersion: 'Release {version}',
  evRead: 'Read on {date}',
  evReadUnknown: 'Date read not recorded',
  evOpen: 'Open the source',
  evOpenAt: 'Open the source at {host}',
  evNoLink: 'No web address recorded',
  evDisputedTitle: 'Another source disagrees',
  evDisputedBody: 'The atlas keeps both. Read each before relying on this link.',
  evShared: 'The observed links it rests on',
  evSharedNone: 'No observed link is recorded under this connection.',
  evDiffers: 'What differs and must be checked',
  evDiffersNone: 'The atlas recorded no difference. That is not proof there is none.',
  evDetail: 'More from the record',
  detail_frequency: 'How often',
  detail_assetKind: 'Kind',
  detail_studyKind: 'Kind',
  detail_status: 'Status',
  detail_because: 'Why the atlas links them',
  starNothing: 'No source for this disease is on the desk yet.',
  starLook: 'Look up {name}',

  'relation_disease-gene': 'A disease and a gene',
  'relation_disease-phenotype': 'A disease and a symptom',
  'relation_gene-mechanism': 'A gene and how it acts',
  'relation_gene-pathway': 'A gene and a pathway',
  'relation_disease-similar': 'Two diseases that may be related',
  'relation_group-disease': 'A patient group and a disease',
  'relation_group-asset': 'A group and something it runs or holds',
  'relation_study-disease': 'A study and a disease',
  'relation_publication-claim': 'A publication and what it reports',
  'relation_person-works-on': 'A person and what they work on',
  relation_other: 'A link between two records',

  kind_disease: 'disease',
  kind_gene: 'gene',
  kind_phenotype: 'symptom',
  kind_mechanism: 'mechanism',
  kind_pathway: 'pathway',
  kind_group: 'patient group',
  kind_asset: 'registry, biobank or research tool',
  kind_study: 'study',
  kind_publication: 'publication',
  kind_person: 'person',

  // Connections
  connNotLooked: 'The atlas has not looked for related diseases yet.',
  connLook: 'Look for related diseases',
  connNone: 'The atlas found no supported connection for {name}.',
  connOpen: 'Open the evidence',
  connLookUp: 'Look up {name}',
  connFindAssets: 'Look for groups and studies',
  connDraft: 'Draft a one-page proposal',
  connAssets: 'Already working on {name}',
  connAssetsNone: 'The atlas holds no verified group, registry or study for {name} yet.',

  // Next steps
  stepsFor: 'For {name}',
  stepsNoHome: 'Look up a disease first. The steps the sources support are listed here.',
  stepsViable: 'Leads the sources support',
  stepsViableWhy: 'Each rests on links a source states. They are leads to check with an expert, not findings.',
  stepsViableNone: 'No supported lead yet.',
  stepsUnsupported: 'Not supported by the atlas',
  stepsUnsupportedWhy: 'The atlas could not back these with a source. Do not act on them yet.',
  stepsUnsupportedNone: 'Nothing unsupported has come up.',
  stepsNoSupport: 'No observed link is recorded under this connection.',
  stepsCheckFirst: 'Check first',

  // The brief
  briefLabel: 'One-page proposal',
  briefCopy: 'Copy',
  briefCopied: 'Copied',
  briefCopyFailed: 'Copy did not work. Select the text instead.',
  briefPrint: 'Print',
  briefShare: 'Share',
  briefToCheck: 'To check with an expert first',
  briefSources: 'Sources',
  briefCite: 'Open source {n}',
  briefCiteMissing: 'This source was not found in the atlas',
  briefCited_one: '{n} statement cites a link in the atlas.',
  briefCited_other: '{n} statements cite a link in the atlas.',
  briefDropped_one: '{n} sentence was removed because its source was not in the atlas.',
  briefDropped_other: '{n} sentences were removed because their sources were not in the atlas.',
  briefFooter: 'Drafted by Rare Atlas from public sources. Not medical advice.',

  // About the data
  aboutBuilt: 'Built on {date}',
  aboutHolds: 'What the atlas holds',
  aboutSources: 'Where it was read from',
  aboutNoSources: 'No sources are recorded for this build.',
};

const TABLES = { en };

const RIGHT_TO_LEFT = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'dv', 'ug', 'ckb']);

let locale = 'en';

export const primary = code => String(code || '').toLowerCase().split(/[-_]/)[0];
export const isRightToLeft = code => RIGHT_TO_LEFT.has(primary(code));
export const directionOf = code => (isRightToLeft(code) ? 'rtl' : 'ltr');

// The interface language. The visitor's chosen language (src/language.js) is
// used when it has a table here; until then the interface stays in English
// while the agent, the captions and the brief follow the visitor.
export function pickLocale(chosen) {
  const asked = [chosen, ...(navigator.languages || [navigator.language || 'en'])];
  return asked.map(primary).find(code => TABLES[code]) || 'en';
}

export function setLocale(code) {
  locale = TABLES[primary(code)] ? primary(code) : 'en';
  return locale;
}

export const getLocale = () => locale;

export function t(key, values) {
  const text = TABLES[locale]?.[key] ?? en[key] ?? key;
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole));
}

// A key that may not exist (an edge type or record field added later) falls
// back to a general wording instead of showing the key.
export function tOr(key, fallbackKey, values) {
  const known = key in (TABLES[locale] || en) || key in en;
  return known ? t(key, values) : fallbackKey ? t(fallbackKey, values) : '';
}

// Plural forms: looks for key_one, key_other and so on, as the language needs.
export function tn(key, n, values = {}) {
  let form = 'other';
  try {
    form = new Intl.PluralRules(locale).select(n);
  } catch { /* keep 'other' */ }
  const table = TABLES[locale] || en;
  const full = `${key}_${form}` in table || `${key}_${form}` in en ? `${key}_${form}` : `${key}_other`;
  return t(full, { n: formatNumber(n), ...values });
}

export function formatNumber(n) {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return String(n);
  }
}

// Dates the loader wrote are plain days ("2026-10-03"); reading them as UTC
// keeps the day from slipping in time zones behind it.
export function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  try {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date);
  } catch {
    return String(iso).slice(0, 10);
  }
}
