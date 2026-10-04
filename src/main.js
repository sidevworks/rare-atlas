// Opens the atlas: fetch the map, build the library, wake the voice, lay the
// readable layer over both.

import { api } from './api.js';
import { createUI } from './ui/index.js';
import { t, pickLocale, setLocale } from './ui/strings.js';

const worldElement = document.getElementById('world');
const uiElement = document.getElementById('ui');
const bootElement = document.getElementById('boot');

setLocale(pickLocale(document.documentElement.lang));

function boot(message, retry) {
  const line = document.createElement('p');
  line.textContent = message;
  bootElement.replaceChildren(line);
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = t('bootRetry');
    button.addEventListener('click', retry);
    bootElement.append(button);
    button.focus();
  }
  bootElement.hidden = false;
}

// The library and the voice are fetched while the map loads. Either can fail
// (no WebGL, no microphone support) without taking the readable atlas down
// with it: the search, the desk and the evidence still work.
const load = (what, path) => path.catch(error => {
  console.warn(`The ${what} could not be loaded.`, error);
  return null;
});
const worldModule = load('library', import('./world/index.js'));
const voiceModule = load('voice', import('./voice/index.js'));

async function open() {
  boot(t('bootOpening'));

  let map;
  try {
    map = await api.map();
  } catch {
    boot(t('bootFailed'), open);
    return;
  }

  const [worldParts, voiceParts] = await Promise.all([worldModule, voiceModule]);

  if (worldParts?.createWorld) {
    try {
      worldParts.createWorld(worldElement, { map });
    } catch (error) {
      console.warn('The library could not be drawn.', error);
      document.documentElement.classList.add('no-world');
    }
  } else {
    document.documentElement.classList.add('no-world');
  }

  let voice = null;
  if (voiceParts?.createVoice) {
    try {
      voice = voiceParts.createVoice();
    } catch (error) {
      console.warn('The voice could not be started.', error);
    }
  }

  createUI({ root: uiElement, map, voice });
  bootElement.hidden = true;
  bootElement.replaceChildren();
}

open();
