// The readable layer over the library: one search box, the desk, the
// evidence behind each card, the brief, and the voice controls. It never
// calls the world or the voice directly. It listens on the bus, and it asks
// for lookups through the same door the voice agent uses.

import { emit, on, EVENT } from '../bus.js';
import { LANGUAGES, getLanguage, setLanguage } from '../language.js';
import { h, icon, wideScreen } from './dom.js';
import { t, pickLocale, setLocale, directionOf } from './strings.js';
import { createState } from './state.js';
import { createSearch } from './search.js';
import { createDesk } from './desk.js';
import { createEvidence } from './evidence.js';
import { createBrief } from './brief.js';
import { createAbout } from './about.js';
import { createVoiceBar } from './voicebar.js';
import { lookUpDisease, findConnections, findAssets, draftBrief } from './lookup.js';

export function createUI({ root, map, voice = null }) {
  // The words of the interface have their own language and direction, which
  // is the visitor's only once a table for it exists in strings.js. What the
  // visitor hears and takes away (captions, the brief) follows them always.
  const locale = setLocale(pickLocale(getLanguage().code));
  root.lang = locale;
  root.dir = directionOf(locale);
  const wide = wideScreen();
  const state = createState(map);

  const actions = {
    lookUp: id => lookUpDisease(id),
    findConnections,
    findAssets,
    // A proposal always starts from the visitor's own disease.
    draft: toId => (state.homeId ? draftBrief(state.homeId, toId, state.language) : null),
    backHome() {
      if (!state.homeId) return;
      state.focusOn(state.homeId);
      emit(EVENT.ATLAS_FOCUS, { id: state.homeId });
    },
  };

  const evidence = createEvidence({ state, onChange: layers, onLookUp: actions.lookUp });
  const brief = createBrief({ onChange: layers, onCite: openEvidence });
  const about = createAbout({ build: map?.build, onChange: layers });

  const search = createSearch({
    // Choosing a disease in the box says "this one is mine".
    onChoose: item => {
      state.chooseHome(item.id);
      lookUpDisease(item.id);
    },
    askAgent: q => voiceBar.isLive() && voice?.sendText?.(q) === true,
  });

  const voiceBar = createVoiceBar({
    voice,
    nameOf: state.nameOf,
    onTypeInstead: () => search.focus(),
    // Leaving clears the desk and the sky for whoever walks up next.
    onLeave: () => {
      emit(EVENT.VISITOR_LEAVE, {});
      emit(EVENT.DESK_CLEAR, {});
      emit(EVENT.ATLAS_RESET, {});
    },
  });

  const desk = createDesk({
    state,
    actions,
    onOpenEdge: openEvidence,
    onVisibility: visible => {
      root.classList.toggle('has-desk', visible);
      voiceBar.setDeskVisible(visible);
    },
  });

  // Each language is listed under its own name, so it can be found by
  // someone who reads no English.
  const languagePicker = h('select', {
    class: 'language',
    'aria-label': t('language'),
    onChange: event => setLanguage(event.target.value),
  }, LANGUAGES.map(language => h('option', {
    value: language.code,
    lang: language.code,
    selected: language.code === getLanguage().code,
  }, language.name)));

  const topbar = h('header', { class: 'topbar' },
    h('div', { class: 'brand' },
      h('h1', { class: 'wordmark' }, t('appName')),
      map?.build?.synthetic && h('span', { class: 'badge', title: t('sampleDataWhy') }, t('sampleData')),
      languagePicker,
      h('button', {
        class: 'icon-btn about-btn',
        type: 'button',
        'aria-label': t('aboutData'),
        'aria-haspopup': 'dialog',
        onClick: event => {
          if (evidence.isOpen()) evidence.close();
          about.open(event.currentTarget);
        },
      }, icon('info'))),
    search.element);

  const lower = h('div', { class: 'lower' }, voiceBar.captions, voiceBar.invite, desk.element, voiceBar.bar);

  root.replaceChildren(topbar, lower, brief.element, about.scrim, about.element, evidence.scrim, evidence.element);

  function openEvidence(edge, from) {
    if (about.isOpen()) about.close();
    evidence.openEdge(edge, from);
  }

  // Which layers can be reached. On a phone a sheet covers the whole screen,
  // so what is under it is taken out of reach of the keyboard and of screen
  // readers. On a wide screen the sheet takes the side and the rest moves over.
  function layers() {
    const narrow = !wide.matches;
    const sheetOpen = evidence.isOpen() || about.isOpen();
    const covered = brief.isOpen() || (sheetOpen && narrow);
    root.classList.toggle('has-side', sheetOpen && !narrow);
    topbar.toggleAttribute('inert', covered);
    lower.toggleAttribute('inert', covered);
    brief.element.toggleAttribute('inert', sheetOpen && narrow);
  }

  // A star was chosen in the sky. Show the evidence that leads to it if the
  // desk holds any; otherwise say that nothing is on the desk for it yet and
  // offer to look it up.
  function onStar({ id }) {
    if (!id) return;
    if (about.isOpen()) about.close();
    const edge = state.findEdge(id);
    if (edge) {
      evidence.openEdge(edge);
      return;
    }
    const connection = state.connectionTo(id);
    if (connection) {
      evidence.openEdge(connection.edge);
      return;
    }
    if (id === state.focusId) {
      desk.reveal();
      return;
    }
    const touching = state.edgeTouching(id);
    if (touching) evidence.openEdge(touching);
    else evidence.openStar(id);
  }

  const syncSearch = () => search.setLive(voiceBar.isLive());

  const stops = [
    on(EVENT.NODE_SELECT, onStar),
    on(EVENT.VOICE_STATE, syncSearch),
    on(EVENT.VISITOR_APPROACH, syncSearch),
    on(EVENT.VISITOR_LEAVE, syncSearch),
    on(EVENT.LANGUAGE_CHANGE, ({ language }) => {
      if (language?.code) languagePicker.value = language.code;
    }),
    on(EVENT.DESK_BRIEF, ({ brief: next }) => {
      if (!next) return;
      if (evidence.isOpen()) evidence.close();
      if (about.isOpen()) about.close();
      brief.open(next);
    }),
    on(EVENT.DESK_CLEAR, () => {
      evidence.close();
      about.close();
      brief.close();
    }),
  ];

  const onKey = event => {
    if (event.key !== 'Escape') return;
    if (evidence.isOpen()) evidence.close();
    else if (about.isOpen()) about.close();
    else if (brief.isOpen()) brief.close();
    else return;
    event.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  // Keys pressed in the search box or the language list are for those. The
  // world may listen for keys to move the visitor, and should not hear these.
  const keepTyping = event => {
    if (event.key !== 'Escape' && event.target.closest?.('input, textarea, select')) event.stopPropagation();
  };
  root.addEventListener('keydown', keepTyping);
  root.addEventListener('keyup', keepTyping);

  wide.addEventListener?.('change', layers);
  desk.render();

  return {
    dispose() {
      stops.forEach(stop => stop());
      document.removeEventListener('keydown', onKey);
      root.removeEventListener('keydown', keepTyping);
      root.removeEventListener('keyup', keepTyping);
      wide.removeEventListener?.('change', layers);
      desk.dispose();
      search.dispose();
      voiceBar.dispose();
      state.dispose();
      root.replaceChildren();
      root.classList.remove('has-desk', 'has-side');
      document.documentElement.classList.remove('has-brief');
    },
  };
}
