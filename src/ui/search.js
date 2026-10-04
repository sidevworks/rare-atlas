// The one search box. Typing offers matches quietly; pressing Enter runs the
// same find_disease lookup the voice agent runs, so the atlas moves and a
// search that finds nothing lays a gap card on the desk.

import { api } from '../api.js';
import { emit, EVENT } from '../bus.js';
import { runTool } from '../retrieval.js';
import { NODE, LAYER } from '../../shared/schema.js';
import { h, icon } from './dom.js';
import { t, tn, tOr } from './strings.js';

const LIST_ID = 'atlas-search-results';
const WAIT_BEFORE_SUGGESTING = 220;

const isDisease = item => !item.kind || item.kind === NODE.DISEASE;

// The server says what a result matched on: "name", "synonym: X", "gene: X",
// "partial: ...", or several joined. A match on the name itself needs no note.
function matchedNote(item) {
  const matched = String(item.matched || '');
  if (!matched || matched === 'name' || matched.toLowerCase() === String(item.name).toLowerCase()) return '';
  const single = !matched.includes(' and ');
  if (single && matched.startsWith('synonym: ')) return t('searchMatchedSynonym', { text: matched.slice(9) });
  if (single && matched.startsWith('gene: ')) return t('searchMatchedGene', { text: matched.slice(6) });
  if (matched.startsWith('partial: ')) return t('searchMatchedPartial', { text: matched.slice(9) });
  return t('searchMatched', { text: matched });
}

// askAgent(q) hands a typed question to a live conversation and returns true
// if one took it. The box is then both things: a search, and a way to talk
// when the room is too loud or the microphone is off.
export function createSearch({ onChoose, askAgent }) {
  let results = [];
  let active = -1;
  let request = 0;
  let timer = 0;

  const input = h('input', {
    class: 'search-input',
    id: 'atlas-search',
    type: 'search',
    role: 'combobox',
    'aria-label': t('searchLabel'),
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': LIST_ID,
    placeholder: t('searchPlaceholder'),
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
  });
  const go = h('button', { class: 'search-go', type: 'submit' }, t('searchSubmit'));
  const list = h('ul', { class: 'search-list', id: LIST_ID, role: 'listbox', 'aria-label': t('searchResults') });
  const note = h('p', { class: 'search-note', hidden: true });
  const pop = h('div', { class: 'search-pop', hidden: true }, list, note);
  const status = h('p', { class: 'visually-hidden', role: 'status' });
  const element = h('form', { class: 'search', role: 'search', novalidate: true },
    h('div', { class: 'search-field' },
      icon('search', 20),
      input,
      go),
    pop,
    status);

  function option(item, index) {
    const note = matchedNote(item);
    return h('li', {
      class: 'search-option',
      role: 'option',
      id: `${LIST_ID}-${index}`,
      'aria-selected': String(index === active),
      onClick: () => choose(item),
    },
      h('span', { class: 'search-name' }, item.name),
      h('span', { class: 'search-sub' },
        !isDisease(item) && h('span', {}, tOr(`kind_${item.kind}`, null) || item.kind),
        note && h('span', {}, note),
        item.layer === LAYER.DEEP && h('span', {}, t('layerDeep'))));
  }

  function draw({ message = '' } = {}) {
    list.replaceChildren(...results.map(option));
    list.hidden = !results.length;
    note.textContent = message;
    note.hidden = !message;
    const open = results.length > 0 || Boolean(message);
    pop.hidden = !open;
    input.setAttribute('aria-expanded', String(results.length > 0));
    mark();
  }

  function mark() {
    [...list.children].forEach((item, index) => item.setAttribute('aria-selected', String(index === active)));
    if (active >= 0 && list.children[active]) {
      input.setAttribute('aria-activedescendant', list.children[active].id);
      list.children[active].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function shut() {
    results = [];
    active = -1;
    draw();
  }

  function say(message) {
    status.textContent = '';
    status.textContent = message;
  }

  // Quiet matches while typing. These do not move the atlas, and a failure
  // here is left alone: pressing Enter reports it properly.
  async function suggest(q) {
    const mine = ++request;
    try {
      const response = await api.search(q);
      if (mine !== request) return;
      results = response.results || [];
      active = -1;
      draw({ message: results.length ? '' : t('searchNoneYet') });
      if (results.length) say(tn('searchCount', results.length));
    } catch { /* see above */ }
  }

  async function submit(q) {
    const mine = ++request;
    emit(EVENT.SEARCH_SUBMIT, { q });
    element.classList.add('is-busy');
    try {
      const { result } = await runTool('find_disease', { query: q });
      if (mine !== request) return;
      results = result.gap ? [] : result.results || [];
      if (!results.length) {
        active = -1;
        draw({ message: t('searchNone', { q }) });
        say(t('searchNone', { q }));
        return;
      }
      // A single clear answer is opened straight away.
      if (results.length === 1 && isDisease(results[0])) {
        choose(results[0]);
        return;
      }
      active = 0;
      draw();
      say(tn('searchCount', results.length));
    } catch (error) {
      if (mine !== request) return;
      results = [];
      active = -1;
      draw({ message: t('searchFailed', { message: error.message }) });
      say(t('searchFailed', { message: error.message }));
    } finally {
      if (mine === request) element.classList.remove('is-busy');
    }
  }

  function choose(item) {
    clearTimeout(timer);
    request += 1;
    element.classList.remove('is-busy');
    input.value = item.name;
    shut();
    if (isDisease(item)) {
      // Putting the keyboard away on a phone lets the desk be seen.
      input.blur();
      onChoose(item);
    } else {
      // A gene or a symptom is not a page of its own: search for the
      // diseases recorded under its name.
      submit(item.name);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      request += 1;
      shut();
      return;
    }
    timer = setTimeout(() => suggest(q), WAIT_BEFORE_SUGGESTING);
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!results.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + results.length + (active < 0 && step < 0 ? 1 : 0)) % results.length;
      mark();
    } else if (event.key === 'Escape' && !pop.hidden) {
      event.preventDefault();
      event.stopPropagation();
      shut();
    }
  });

  element.addEventListener('submit', event => {
    event.preventDefault();
    clearTimeout(timer);
    if (active >= 0 && results[active]) {
      choose(results[active]);
      return;
    }
    const q = input.value.trim();
    if (!q) return;
    if (askAgent?.(q)) {
      // The question shows up in the captions; the box is ready for the next.
      request += 1;
      input.value = '';
      shut();
      return;
    }
    submit(q);
  });

  // Keeps the keyboard in the box while a match is tapped or clicked.
  pop.addEventListener('mousedown', event => event.preventDefault());

  const onOutside = event => {
    if (!element.contains(event.target) && !pop.hidden) shut();
  };
  document.addEventListener('pointerdown', onOutside);

  return {
    element,
    focus: () => input.focus(),
    // While a conversation is live, Enter puts the words to the agent.
    setLive(live) {
      input.placeholder = t(live ? 'searchPlaceholderLive' : 'searchPlaceholder');
      go.textContent = t(live ? 'searchAsk' : 'searchSubmit');
    },
    dispose: () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', onOutside);
    },
  };
}
