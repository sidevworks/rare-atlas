// The voice agent: OpenAI Realtime over WebRTC.
//
// The server mints a short-lived secret (the real key never reaches this
// page), the browser connects straight to OpenAI, and audio flows both ways.
// The agent has no knowledge of its own to draw on here: when it wants a
// fact it asks for a lookup, the lookup runs through src/retrieval.js, and
// only what comes back is handed to it to speak from.

import { api } from '../api.js';
import { emit, on, EVENT } from '../bus.js';
import { getLanguage } from '../language.js';
import { runTool } from '../retrieval.js';

const CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

const MESSAGE = {
  unsupported: 'This browser cannot open a live conversation here. The typed search still works.',
  micOff: 'The microphone is off, so type your question. The agent will still answer aloud and in writing.',
  dropped: 'The voice connection dropped. Approach the desk again to reconnect.',
};

const languageNote = language =>
  `The visitor has chosen ${language.english}. From now on speak and write only in ${language.english}, ` +
  'whatever language earlier turns were in. Keep translating names to English for lookups.';

export function createVoice() {
  let state = 'idle';
  let starting = false;
  let attempt = 0;
  let peer = null;
  let channel = null;
  let micStream = null;
  let audioElement = null;
  let audioContext = null;
  let meterFrame = 0;
  let agentText = '';
  let personText = '';
  const answered = new Set();

  function setState(next, message) {
    if (state === next && !message) return;
    state = next;
    emit(EVENT.VOICE_STATE, message ? { state, message } : { state });
  }

  function send(event) {
    if (channel?.readyState === 'open') channel.send(JSON.stringify(event));
  }

  // --- Levels, so the librarian's glow can follow the voices ---------------

  function startMeter(agentStream) {
    if (!audioContext) return;
    const tap = stream => {
      if (!stream) return null;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      return analyser;
    };
    const micAnalyser = tap(micStream);
    const agentAnalyser = tap(agentStream);
    const samples = new Uint8Array(128);
    let last = 0;
    const tick = now => {
      meterFrame = requestAnimationFrame(tick);
      if (now - last < 50) return;
      last = now;
      // While the agent speaks, show the agent; otherwise show the person.
      const analyser = state === 'speaking' ? agentAnalyser : micAnalyser;
      if (!analyser) {
        emit(EVENT.VOICE_LEVEL, { level: 0 });
        return;
      }
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += (sample - 128) ** 2;
      emit(EVENT.VOICE_LEVEL, { level: Math.min(1, Math.sqrt(sum / samples.length) / 40) });
    };
    cancelAnimationFrame(meterFrame);
    meterFrame = requestAnimationFrame(tick);
  }

  // --- Lookups --------------------------------------------------------------

  async function answerCalls(calls) {
    setState('thinking');
    for (const call of calls) {
      let output;
      try {
        const args = call.arguments ? JSON.parse(call.arguments) : {};
        output = (await runTool(call.name, args)).forAgent;
      } catch (error) {
        output = {
          found: false,
          lookupFailed: true,
          say: 'Tell the person the atlas could not be reached just now. Do not answer from memory.',
          detail: error.message,
        };
      }
      send({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output) },
      });
    }
    send({ type: 'response.create' });
  }

  // --- Events from the agent ------------------------------------------------

  function handle(event) {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        personText = '';
        setState('listening');
        break;
      case 'input_audio_buffer.speech_stopped':
        setState('thinking');
        break;
      case 'conversation.item.input_audio_transcription.delta':
        personText += event.delta || '';
        emit(EVENT.VOICE_TRANSCRIPT, { role: 'person', text: personText, final: false });
        break;
      case 'conversation.item.input_audio_transcription.completed':
        emit(EVENT.VOICE_TRANSCRIPT, { role: 'person', text: event.transcript || personText, final: true });
        personText = '';
        break;
      case 'response.created':
        agentText = '';
        if (state !== 'speaking') setState('thinking');
        break;
      case 'output_audio_buffer.started':
        setState('speaking');
        break;
      case 'response.output_audio_transcript.delta':
        agentText += event.delta || '';
        if (state !== 'speaking') setState('speaking');
        emit(EVENT.VOICE_TRANSCRIPT, { role: 'agent', text: agentText, final: false });
        break;
      case 'response.output_audio_transcript.done':
        emit(EVENT.VOICE_TRANSCRIPT, { role: 'agent', text: event.transcript || agentText, final: true });
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        if (state === 'speaking') setState('listening');
        break;
      case 'response.done': {
        const calls = (event.response?.output || []).filter(
          item => item.type === 'function_call' && !answered.has(item.call_id),
        );
        calls.forEach(call => answered.add(call.call_id));
        if (calls.length) answerCalls(calls);
        else if (state === 'thinking') setState('listening');
        break;
      }
      case 'error':
        // Most of these are harmless (for example, cancelling when nothing
        // is playing), so the session carries on.
        console.warn('Voice agent:', event.error?.message || event);
        break;
      default:
        break;
    }
  }

  // --- Connecting -----------------------------------------------------------

  async function start() {
    if (peer || starting) return;
    if (!window.RTCPeerConnection) {
      setState('error', MESSAGE.unsupported);
      return;
    }
    starting = true;
    // If the visitor steps away while this is still connecting, stop() moves
    // the attempt number on and the checks below abandon this attempt.
    const mine = ++attempt;
    const abandoned = () => {
      if (mine === attempt) return false;
      micStream?.getTracks().forEach(track => track.stop());
      micStream = null;
      starting = false;
      return true;
    };
    setState('connecting');

    // Both of these are begun before the first await, so they still count as
    // part of the tap or key press that brought the visitor to the desk.
    // Phones refuse a microphone or a sound that no gesture asked for.
    const micRequest = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      : Promise.reject(new Error('This device offers no microphone.'));
    micRequest.catch(() => {});
    const sessionRequest = api.realtimeSession(getLanguage().code);
    sessionRequest.catch(() => {});
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContext.resume?.();
    } catch {
      audioContext = null;
    }
    audioElement = document.createElement('audio');
    audioElement.autoplay = true;
    audioElement.playsInline = true;

    // A refused or missing microphone does not end the conversation: the
    // visitor types, and the agent still answers aloud and in writing.
    let micOff = false;
    try {
      micStream = await micRequest;
    } catch {
      micStream = null;
      micOff = true;
    }
    if (abandoned()) return;

    try {
      const session = await sessionRequest;
      if (abandoned()) return;
      peer = new RTCPeerConnection();
      peer.ontrack = event => {
        audioElement.srcObject = event.streams[0];
        audioElement.play?.().catch(() => {});
        startMeter(event.streams[0]);
      };
      peer.onconnectionstatechange = () => {
        if (peer && ['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
          stop();
          setState('error', MESSAGE.dropped);
        }
      };
      if (micStream) micStream.getAudioTracks().forEach(track => peer.addTrack(track, micStream));
      else peer.addTransceiver('audio', { direction: 'recvonly' });

      channel = peer.createDataChannel('oai-events');
      channel.onmessage = message => {
        try {
          handle(JSON.parse(message.data));
        } catch (error) {
          console.warn('Voice agent sent something unreadable.', error);
        }
      };
      // The agent speaks first; its greeting is set on the server.
      channel.onopen = () => {
        setState('listening', micOff ? MESSAGE.micOff : undefined);
        send({ type: 'response.create' });
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch(CALLS_URL, {
        method: 'POST',
        body: offer.sdp,
        headers: { Authorization: `Bearer ${session.clientSecret}`, 'Content-Type': 'application/sdp' },
      });
      if (!response.ok) throw new Error(`The voice service answered ${response.status}.`);
      const answer = await response.text();
      if (abandoned()) return;
      await peer.setRemoteDescription({ type: 'answer', sdp: answer });
      starting = false;
    } catch (error) {
      if (abandoned()) return;
      starting = false;
      stop();
      setState('error', error.message);
    }
  }

  function stop() {
    attempt += 1;
    cancelAnimationFrame(meterFrame);
    meterFrame = 0;
    try { channel?.close(); } catch { /* already closed */ }
    try { peer?.close(); } catch { /* already closed */ }
    micStream?.getTracks().forEach(track => track.stop());
    if (audioElement) audioElement.srcObject = null;
    audioContext?.close?.().catch(() => {});
    peer = null;
    channel = null;
    micStream = null;
    audioElement = null;
    audioContext = null;
    answered.clear();
    emit(EVENT.VOICE_LEVEL, { level: 0 });
    if (!starting && state !== 'error') setState('idle');
  }

  // A typed question, put to the agent while the conversation is live.
  // Returns false when there is no live conversation to put it to.
  function sendText(text) {
    const clean = String(text || '').trim();
    if (!clean || channel?.readyState !== 'open') return false;
    send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: clean }] },
    });
    send({ type: 'response.create' });
    emit(EVENT.VOICE_TRANSCRIPT, { role: 'person', text: clean, final: true });
    return true;
  }

  // A change of language mid-conversation: tell the agent, and let it
  // acknowledge in the new language so the switch is heard.
  on(EVENT.LANGUAGE_CHANGE, ({ language }) => {
    if (channel?.readyState !== 'open') return;
    send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: languageNote(language) }] },
    });
    send({ type: 'response.create' });
  });

  on(EVENT.VISITOR_APPROACH, () => start());
  on(EVENT.VISITOR_LEAVE, () => stop());
  window.addEventListener('pagehide', () => stop());

  return { start, stop, sendText, state: () => state };
}
