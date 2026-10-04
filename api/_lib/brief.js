// The one-page proposal, and the check that stands between a model and the
// reader.
//
// The writer (a model, or with no key a plain assembly of edge statements)
// is handed a fixed set of edges and must say, paragraph by paragraph, which
// of them it rests on. check() then removes every paragraph that cites
// nothing, or cites an edge that was not handed over, and counts what it
// removed. What reaches the reader is only what the graph can back.

import { BASIS, CONFIDENCE } from '../../shared/schema.js';
import { linkBetween, workOf } from './graph.js';
import { languageName, openai } from './openai.js';

const DEFAULT_MODEL = 'gpt-6.1-sol';

const sourceNames = edge => [...new Set((edge.sources || []).map(source => source.name).filter(Boolean))];
const disputeNames = edge => [...new Set((edge.contradictedBy || []).map(source => source.name).filter(Boolean))];

/**
 * Everything a brief between two diseases may draw on, or null when the
 * atlas holds no supported link between them.
 */
export function gather(from, to) {
  const link = linkBetween(from, to);
  if (!link) return null;
  const flat = work => [...work.groups, ...work.assets, ...work.studies];
  // One page: the first few shared facts, a pair at a time, are enough.
  const support = link.support.slice(0, 8);
  const theirs = flat(workOf(to)).slice(0, 8);
  const ours = flat(workOf(from)).slice(0, 6);

  const supplied = [];
  const roles = new Map();
  const supply = (edges, role) => {
    for (const edge of edges) {
      if (roles.has(edge.id)) continue;
      roles.set(edge.id, role);
      supplied.push(edge);
    }
  };
  supply([link.edge], 'the link between the two diseases');
  supply(support, 'an observed fact the link rests on');
  supply(theirs, `already in place for ${to.name}`);
  supply(ours, `already in place for ${from.name}`);

  return { from, to, link, support, theirs, ours, supplied, roles };
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/**
 * @param {{ paragraphs: { text: string, cites: string[] }[] }} draft
 * @param {import('../../shared/schema.js').Edge[]} supplied
 */
export function check(draft, supplied) {
  const known = new Map(supplied.map(edge => [edge.id, edge]));
  const paragraphs = [];
  let dropped = 0;
  for (const paragraph of Array.isArray(draft?.paragraphs) ? draft.paragraphs : []) {
    const text = typeof paragraph?.text === 'string' ? paragraph.text.trim() : '';
    const cites = Array.isArray(paragraph?.cites) ? [...new Set(paragraph.cites.map(String))] : [];
    if (!text) continue;
    if (!cites.length || cites.some(id => !known.has(id))) {
      dropped += 1;
      continue;
    }
    paragraphs.push({ text, cites });
  }
  const cited = [...new Set(paragraphs.flatMap(paragraph => paragraph.cites))];
  return { paragraphs, edges: cited.map(id => known.get(id)), checked: { cited: cited.length, dropped } };
}

// ---------------------------------------------------------------------------
// With no model: the edge statements, in order, in English
// ---------------------------------------------------------------------------

const withSource = edge => {
  const names = sourceNames(edge);
  const text = edge.statement.trim().replace(/\.$/, '');
  return names.length ? `${text} (source: ${names.join(', ')}).` : `${text}.`;
};

function questions({ from, to, link }) {
  const { edge } = link;
  const asks = [];
  if (edge.basis === BASIS.INFERRED) {
    asks.push(`Does a clinician or researcher who knows both ${from.name} and ${to.name} agree that this link is worth testing?`);
  }
  if (edge.confidence === CONFIDENCE.LOW) {
    asks.push(`The atlas rates this link as low confidence${edge.confidenceWhy ? ` (${edge.confidenceWhy.replace(/\.$/, '')})` : ''}. What evidence would raise it or rule it out?`);
  }
  for (const line of link.differs.slice(0, 3)) {
    asks.push(`${line} Does this difference change whether the two can learn from each other?`);
  }
  for (const disputed of [edge, ...link.support].filter(item => item.contradictedBy?.length).slice(0, 2)) {
    asks.push(`A source disagrees (${disputeNames(disputed).join(', ')}) with this record: "${disputed.statement}" Which reading holds for these patients?`);
  }
  return asks;
}

export function plainBrief(material) {
  const { from, to, link, support, theirs, ours } = material;
  const { edge } = link;
  const paragraphs = [
    {
      text: [
        `We are writing on behalf of families living with ${from.name}.`,
        `The Rare Atlas, which connects published research and public records, shows a possible connection with ${to.name}.`,
        withSource(edge),
        edge.basis === BASIS.INFERRED
          ? 'The atlas worked this link out from the records below. It is a lead to check, not a finding.'
          : 'A source states this link directly.',
      ].join(' '),
      cites: [edge.id],
    },
  ];
  if (support.length) {
    paragraphs.push({
      text: `What the link rests on, each from a named source: ${support.map(withSource).join(' ')}`,
      cites: support.map(item => item.id),
    });
  }
  if (theirs.length) {
    paragraphs.push({
      text: `Already in place for ${to.name}: ${theirs.map(withSource).join(' ')}`,
      cites: theirs.map(item => item.id),
    });
  }
  if (ours.length) {
    paragraphs.push({
      text: `Already in place for ${from.name}: ${ours.map(withSource).join(' ')}`,
      cites: ours.map(item => item.id),
    });
  }
  paragraphs.push({
    text: [
      'Our request: a short call this month to compare what each community has learned,',
      'and to ask someone who knows both conditions whether this lead is worth testing.',
      'Nothing in this note is medical advice; a clinician decides what it means for any one person.',
    ].join(' '),
    cites: [edge.id],
  });
  return {
    title: `A proposal to compare notes: ${from.name} and ${to.name}`,
    paragraphs,
    toCheck: questions(material),
  };
}

// ---------------------------------------------------------------------------
// With a model
// ---------------------------------------------------------------------------

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          cites: { type: 'array', items: { type: 'string' } },
        },
        required: ['text', 'cites'],
        additionalProperties: false,
      },
    },
    toCheck: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'paragraphs', 'toCheck'],
  additionalProperties: false,
};

const writerRules = (from, to, language) => `
You write a one-page proposal for the Rare Atlas. A patient-group leader for "${from}" will send it this week to a group or researcher working on "${to}".

You are given a list of edges from the atlas's graph. Each has a key, a statement, a basis (observed or inferred), a confidence and its sources. These edges are the only facts you have.

Rules:
1. Use only the supplied edges. Every fact, name and number in a paragraph must come from the statement of an edge that paragraph cites. Add nothing from your own knowledge: no symptoms, genes, mechanisms, prevalence, prognosis, medicines, people, organisations or studies that are not in a supplied edge.
2. Each paragraph lists in "cites" the keys of the edges it rests on, exactly as given (for example "E3"). A checker runs after you and deletes any paragraph that cites nothing or cites a key that was not supplied.
3. An edge with basis "inferred" is a lead to check. Say so in those words, in the language you are writing in. Never call it a finding, a cause or a proven link.
4. When you state a fact, name its source briefly, using a name from that edge's "sources".
5. Where an edge lists "disputedBy", say that a source disagrees and name it.
6. No diagnosis, no advice on treatment, no promise of an outcome. Say once that a clinician decides what any of this means for one person.
7. Write in ${language}. Keep the names of diseases, genes, studies and organisations exactly as given.
8. Plain words a family can follow. Four to six short paragraphs, under 320 words in all, in this order: why we are writing; what the two diseases share and where that is recorded; what is already in place on each side, if any such edge is supplied; the one specific thing we ask for this week.
9. "title": one line, in ${language}, naming both diseases and saying this is a proposal.
10. "toCheck": two to five questions, in ${language}, that an expert must answer before anyone acts. Build them only from the supplied "differences", from any "disputedBy", and from the fact that the link is inferred or its confidence is low. Questions only: no new facts.
`.trim();

function textOf(data) {
  if (data?.status && data.status !== 'completed') {
    throw new Error(`the response ended as ${data.status}${data.incomplete_details?.reason ? ` (${data.incomplete_details.reason})` : ''}`);
  }
  for (const item of data?.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part.type === 'refusal') throw new Error(`the model declined: ${part.refusal}`);
      if (part.type === 'output_text' && part.text) return part.text;
    }
  }
  throw new Error('the response held no text');
}

/**
 * Asks the model for the brief. The model sees short keys (E1, E2, ...) in
 * place of edge ids, which are long and easy to miscopy; they are turned
 * back into ids here, and anything that is not one of the keys is left as
 * it was written so that check() rejects it.
 */
export async function modelBrief(material, language) {
  const { from, to, link, supplied, roles } = material;
  const keys = new Map(supplied.map((edge, index) => [`E${index + 1}`, edge.id]));
  const facts = {
    from: from.name,
    to: to.name,
    edges: supplied.map((edge, index) => ({
      key: `E${index + 1}`,
      role: roles.get(edge.id),
      statement: edge.statement,
      basis: edge.basis,
      confidence: edge.confidence,
      confidenceWhy: edge.confidenceWhy || '',
      sources: sourceNames(edge),
      disputedBy: disputeNames(edge),
    })),
    differences: link.differs,
  };

  const body = {
    model: (process.env.OPENAI_TEXT_MODEL || '').trim() || DEFAULT_MODEL,
    instructions: writerRules(from.name, to.name, `${languageName(language)} (${language})`),
    input: [{ role: 'user', content: JSON.stringify(facts) }],
    text: { format: { type: 'json_schema', name: 'sourced_brief', strict: true, schema: SCHEMA } },
    reasoning: { effort: (process.env.OPENAI_TEXT_EFFORT || '').trim() || 'low' },
    max_output_tokens: 4000,
    store: false,
  };

  let result = await openai('/responses', body, { timeoutMs: 45000 });
  // Not every model takes a reasoning setting; without it the model's own
  // default applies.
  if (!result.ok && result.status === 400) {
    const { reasoning, ...plain } = body;
    result = await openai('/responses', plain, { timeoutMs: 45000 });
  }
  if (!result.ok) throw new Error(`OpenAI answered ${result.status}: ${result.message}`);

  const draft = JSON.parse(textOf(result.data));
  return {
    title: draft.title,
    toCheck: draft.toCheck,
    paragraphs: (draft.paragraphs || []).map(paragraph => ({
      text: paragraph.text,
      cites: (paragraph.cites || []).map(key => keys.get(String(key).trim()) || String(key)),
    })),
  };
}

const lines = (items, max, length) => (Array.isArray(items) ? items : [])
  .filter(item => typeof item === 'string' && item.trim())
  .map(item => item.trim().slice(0, length))
  .slice(0, max);

/**
 * Writes, checks and returns the brief.
 * @returns {Promise<import('../../shared/schema.js').BriefResponse>}
 */
export async function writeBrief(material, language, useModel) {
  const plain = plainBrief(material);
  let draft = null;
  if (useModel) {
    try {
      draft = await modelBrief(material, language);
    } catch (error) {
      // The journey still ends with a brief: the plain one, in English.
      console.warn(`The brief was assembled without the model: ${error.message}`);
    }
  }

  // If the check leaves nothing of the model's draft, the plain brief stands
  // in, and the count of what was removed is kept.
  let result = draft ? check(draft, material.supplied) : null;
  const written = draft && result.paragraphs.length ? draft : null;
  if (!written) {
    const droppedFromModel = result ? result.checked.dropped : 0;
    result = check(plain, material.supplied);
    result.checked.dropped += droppedFromModel;
  }

  const title = written && typeof written.title === 'string' && written.title.trim() && written.title.length <= 200
    ? written.title.trim()
    : plain.title;
  const toCheck = written ? lines(written.toCheck, 6, 400) : [];

  return {
    // The language the text is actually in: the plain brief is English.
    language: written ? language : 'en',
    title,
    paragraphs: result.paragraphs,
    toCheck: toCheck.length ? toCheck : plain.toCheck,
    edges: result.edges,
    checked: result.checked,
  };
}
