// Everything about talking to the atlas: the invitation before the visitor
// has walked up, the microphone and what it is doing, live captions (the
// room may be loud, and they make a change of language visible), and the
// quiet line that says the atlas is looking something up.

import { emit, on, EVENT } from '../bus.js';
import { getLanguage } from '../language.js';
import { h, icon } from './dom.js';
import { t } from './strings.js';

const LIVE = new Set(['connecting', 'listening', 'thinking', 'speaking']);
const TALKING = new Set(['listening', 'thinking', 'speaking']);
const STATE_TEXT = {
  idle: 'voiceIdle',
  connecting: 'voiceConnecting',
  listening: 'voiceListening',
  thinking: 'voiceThinking',
  speaking: 'voiceSpeaking',
  error: 'voiceError',
};
const CAPTION_TAIL = 220;       // long answers show their latest words, as subtitles do
const CAPTION_FADES_MS = 9000;
const ERROR_SHOWS_MS = 8000;

export function createVoiceBar({ voice, nameOf, onLeave, onTypeInstead }) {
  let approached = false;
  let voiceState = 'idle';
  let voiceMessage = '';
  let pending = 0;
  let levelFrame = 0;
  let nextLevel = 0;
  let errorTimer = 0;
  const lines = { person: null, agent: null };

  try {
    voiceState = voice?.state?.() || 'idle';
  } catch { /* treated as idle */ }

  // ---- The invitation -----------------------------------------------------

  const invite = h('section', { class: 'invite', 'aria-labelledby': 'invite-title' },
    h('h1', { class: 'invite-title', id: 'invite-title' }, t('inviteTitle')),
    h('p', { class: 'invite-body' }, t(voice ? 'inviteBody' : 'inviteBodyNoVoice')),
    h('div', { class: 'invite-actions' },
      voice && h('button', { class: 'btn btn-approach', type: 'button', onClick: approach }, t('inviteApproach')),
      h('button', { class: voice ? 'btn btn-quiet' : 'btn btn-approach', type: 'button', onClick: () => onTypeInstead?.() }, t('inviteType'))));

  // ---- Captions and the lookup line --------------------------------------

  // What is seen updates word by word; what a screen reader is told is only
  // each finished line, so it is not read out again on every word.
  const captionList = h('div', { class: 'caption-lines', 'aria-hidden': 'true' });
  const captionLog = h('div', { class: 'visually-hidden', role: 'log', 'aria-live': 'polite', 'aria-label': t('captionsLabel') });
  const looking = h('p', { class: 'looking', role: 'status' });
  const captions = h('div', { class: 'captions' }, captionList, looking, captionLog);

  // ---- The bar ------------------------------------------------------------

  const mic = h('button', { class: 'mic', type: 'button', onClick: onMic }, icon('mic', 26));
  const stateText = h('p', { class: 'voice-state' });
  const stateDetail = h('p', { class: 'voice-detail', role: 'status' });
  const leaveButton = h('button', { class: 'link-btn voice-leave', type: 'button', onClick: () => onLeave?.() }, t('leave'));
  const main = h('div', { class: 'voicebar-main' },
    voice ? mic : null,
    h('div', { class: 'voice-text' }, stateText, stateDetail),
    leaveButton);
  const bar = h('footer', { class: 'voicebar' }, main, h('p', { class: 'legal' }, t('notAdvice')));

  function approach() {
    // The voice starts itself on this event. Emitting it straight from the
    // tap keeps the microphone request inside the visitor's own gesture.
    emit(EVENT.VISITOR_APPROACH, {});
  }

  async function onMic() {
    if (!approached) {
      approach();
      return;
    }
    try {
      if (LIVE.has(voiceState)) await voice.stop();
      else await voice.start();
    } catch (error) {
      setVoice('error', error?.message || '');
    }
  }

  // A note that comes with a state (the microphone is off, say) stays for as
  // long as the conversation it belongs to.
  function setVoice(next, message = '') {
    voiceState = next || 'idle';
    if (message) voiceMessage = message;
    else if (!TALKING.has(voiceState)) voiceMessage = '';
    drawBar();
  }

  function drawBar() {
    const live = approached && LIVE.has(voiceState);
    mic.dataset.state = approached ? voiceState : 'away';
    mic.setAttribute('aria-pressed', String(live));
    mic.setAttribute('aria-label', !approached ? t('inviteApproach') : live ? t('micStop') : t('micStart'));
    leaveButton.hidden = !approached;
    if (!voice) {
      stateText.textContent = t('voiceUnavailable');
      stateDetail.textContent = '';
      return;
    }
    stateText.textContent = approached ? t(STATE_TEXT[voiceState] || 'voiceIdle') : t('voiceAway');
    // The voice's own note, in its words: what went wrong, or that the
    // microphone is off and questions should be typed.
    stateDetail.textContent = approached ? voiceMessage : '';
    stateDetail.classList.toggle('is-failed', voiceState === 'error');
    if (!live) mic.style.setProperty('--level', '0');
  }

  // ---- Captions -----------------------------------------------------------

  function tail(text) {
    if (text.length <= CAPTION_TAIL) return text;
    const cut = text.slice(-CAPTION_TAIL);
    const space = cut.indexOf(' ');
    return `…${space > 0 && space < 24 ? cut.slice(space + 1) : cut}`;
  }

  // The voice sends the whole line so far each time, then the finished line,
  // so each message replaces what is shown for that speaker.
  function caption({ role, text, final }) {
    const who = role === 'person' ? 'person' : 'agent';
    let line = lines[who];
    if (!line) {
      // A new turn replaces what the same speaker said before.
      captionList.querySelectorAll(`.caption[data-role="${who}"]`).forEach(old => old.remove());
      const said = h('span', { class: 'caption-said', dir: 'auto', lang: getLanguage().code });
      const element = h('p', { class: 'caption', dataset: { role: who } },
        h('span', { class: 'caption-who' }, t(who === 'person' ? 'captionYou' : 'captionAtlas')), said);
      line = lines[who] = { element, said, text: '' };
      captionList.append(element);
    }
    line.text = String(text || '') || line.text;
    line.said.textContent = tail(line.text);
    // Whoever is speaking now is the lower line.
    if (captionList.lastElementChild !== line.element) captionList.append(line.element);
    if (!final) return;

    lines[who] = null;
    const { element } = line;
    if (!line.text.trim()) {
      element.remove();
      return;
    }
    captionLog.append(h('p', {}, `${t(who === 'person' ? 'captionYou' : 'captionAtlas')}: ${line.text}`));
    while (captionLog.childElementCount > 6) captionLog.firstElementChild.remove();
    // A finished line stays long enough to read, then steps back.
    setTimeout(() => {
      element.classList.add('is-fading');
      setTimeout(() => element.remove(), 600);
    }, CAPTION_FADES_MS);
  }

  function clearCaptions() {
    lines.person = null;
    lines.agent = null;
    captionList.replaceChildren();
    captionLog.replaceChildren();
  }

  // ---- The lookup line ----------------------------------------------------

  function lookingFor(tool, args = {}) {
    const name = args.id ? nameOf(args.id) : '';
    if (tool === 'find_disease') return t('lookFind', { query: args.query || '' });
    if (tool === 'get_disease') return t('lookDisease', { name });
    if (tool === 'find_connections') return t('lookConnections', { name });
    if (tool === 'find_shared_assets') return t('lookAssets', { name });
    if (tool === 'draft_brief') return t('lookBrief');
    return t('lookGeneric');
  }

  function setLooking(text, failed = false) {
    clearTimeout(errorTimer);
    looking.textContent = text;
    looking.classList.toggle('is-failed', failed);
    looking.classList.toggle('is-on', Boolean(text));
  }

  // ---- Wiring -------------------------------------------------------------

  function setApproached(next) {
    approached = next;
    invite.hidden = approached;
    if (!approached) clearCaptions();
    drawBar();
  }

  const stops = [
    on(EVENT.VISITOR_APPROACH, () => setApproached(true)),
    on(EVENT.VISITOR_LEAVE, () => setApproached(false)),
    on(EVENT.VOICE_STATE, ({ state, message }) => setVoice(state, message)),
    on(EVENT.VOICE_LEVEL, ({ level }) => {
      nextLevel = Math.max(0, Math.min(1, Number(level) || 0));
      if (levelFrame) return;
      levelFrame = requestAnimationFrame(() => {
        levelFrame = 0;
        mic.style.setProperty('--level', nextLevel.toFixed(2));
      });
    }),
    on(EVENT.VOICE_TRANSCRIPT, caption),
    on(EVENT.RETRIEVAL_START, ({ tool, args }) => {
      pending += 1;
      setLooking(lookingFor(tool, args));
    }),
    on(EVENT.RETRIEVAL_RESULT, () => {
      pending = Math.max(0, pending - 1);
      if (!pending) setLooking('');
    }),
    on(EVENT.RETRIEVAL_ERROR, ({ message }) => {
      pending = Math.max(0, pending - 1);
      setLooking(t('lookFailed', { message: message || '' }), true);
      errorTimer = setTimeout(() => {
        if (!pending) setLooking('');
      }, ERROR_SHOWS_MS);
    }),
  ];

  drawBar();

  return {
    invite,
    captions,
    bar,
    // True while there is a conversation a typed question can be put to.
    isLive: () => approached && TALKING.has(voiceState),
    // The invitation steps aside once there is something to read.
    setDeskVisible(visible) {
      invite.hidden = approached || visible;
    },
    dispose() {
      stops.forEach(stop => stop());
      cancelAnimationFrame(levelFrame);
      clearTimeout(errorTimer);
      clearCaptions();
    },
  };
}
