// The brief: the one page the visitor leaves with. It is the only light
// surface in the atlas. Each numbered mark opens the link it cites, and the
// page can be copied, shared or printed with its sources attached.

import { h, icon, safeUrl } from './dom.js';
import { t, tn, getLocale, directionOf, formatDate } from './strings.js';

export function createBrief({ onChange, onCite }) {
  let brief = null;
  let opener = null;
  let copiedTimer = 0;

  const status = h('p', { class: 'visually-hidden', role: 'status' });
  const copyText = h('span', {}, t('briefCopy'));
  const page = h('article', { class: 'brief-page' });

  const tools = [
    h('button', { class: 'btn btn-quiet', type: 'button', onClick: copy }, icon('copy', 20), copyText),
    // Phones offer their own share sheet, which is how most people will send it.
    typeof navigator.share === 'function'
      && h('button', { class: 'btn btn-quiet', type: 'button', onClick: share }, icon('share', 20), h('span', {}, t('briefShare'))),
    typeof window.print === 'function'
      && h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => window.print() }, icon('print', 20), h('span', {}, t('briefPrint'))),
  ];

  const closeButton = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('close'), onClick: close }, icon('close'));
  const element = h('section', { class: 'brief', role: 'dialog', 'aria-labelledby': 'brief-label', hidden: true },
    h('header', { class: 'brief-bar' },
      closeButton,
      h('p', { class: 'sheet-label', id: 'brief-label' }, t('briefLabel')),
      h('div', { class: 'brief-tools' }, tools)),
    h('div', { class: 'brief-scroll' }, page),
    status);

  // Citations are numbered in the order the page first uses them.
  function numbering() {
    const numbers = new Map();
    for (const paragraph of brief.paragraphs || []) {
      for (const id of paragraph.cites || []) if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
    }
    return numbers;
  }

  const edgeById = id => (brief.edges || []).find(edge => edge?.id === id) || null;

  function sourceLines(edge) {
    return (edge.sources || []).filter(Boolean).map(source => {
      const url = safeUrl(source.url);
      return h('span', { class: 'brief-source-line' },
        [source.name, source.recordId, source.retrieved && t('evRead', { date: formatDate(source.retrieved) })].filter(Boolean).join(', '),
        url && h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, url));
    });
  }

  function render() {
    const numbers = numbering();
    const interfaceLang = getLocale();

    const mark = id => {
      const n = numbers.get(id);
      const edge = edgeById(id);
      return edge
        ? h('button', { class: 'cite', type: 'button', 'aria-label': t('briefCite', { n }), onClick: event => onCite(edge, event.currentTarget) }, String(n))
        : h('span', { class: 'cite cite-missing', title: t('briefCiteMissing') }, String(n), h('span', { class: 'visually-hidden' }, t('briefCiteMissing')));
    };

    const entry = ([id, n]) => {
      const edge = edgeById(id);
      return h('li', { value: String(n) }, edge
        ? [
          h('span', { class: 'brief-source-says' }, edge.statement),
          sourceLines(edge),
          h('button', { class: 'brief-open', type: 'button', lang: interfaceLang, onClick: event => onCite(edge, event.currentTarget) }, t('connOpen')),
        ]
        : h('span', { lang: interfaceLang }, t('briefCiteMissing')));
    };

    const checked = brief.checked || {};
    page.lang = brief.language || interfaceLang;
    page.dir = directionOf(brief.language || interfaceLang);
    page.replaceChildren(
      h('h1', { class: 'brief-title', tabindex: '-1' }, brief.title || t('briefLabel')),
      ...(brief.paragraphs || []).map(paragraph => h('p', { class: 'brief-para' }, paragraph.text, (paragraph.cites || []).map(mark))),
      ...(brief.toCheck?.length ? [h('section', { class: 'brief-check' },
        h('h2', { lang: interfaceLang }, t('briefToCheck')),
        h('ul', {}, brief.toCheck.map(question => h('li', {}, question))))] : []),
      ...(numbers.size ? [h('section', { class: 'brief-sources' },
        h('h2', { lang: interfaceLang }, t('briefSources')),
        h('ol', {}, [...numbers].map(entry)))] : []),
      h('footer', { class: 'brief-foot', lang: interfaceLang },
        Number.isFinite(checked.cited) && h('p', {}, tn('briefCited', checked.cited)),
        checked.dropped > 0 && h('p', {}, tn('briefDropped', checked.dropped)),
        h('p', {}, t('briefFooter'))),
    );
  }

  // The same page as plain text, with the sources written out, so it can be
  // pasted into an email and still say where each statement comes from.
  function asText() {
    const numbers = numbering();
    const lines = [brief.title || '', ''];
    for (const paragraph of brief.paragraphs || []) {
      const marks = (paragraph.cites || []).map(id => `[${numbers.get(id)}]`).join('');
      lines.push(`${paragraph.text}${marks ? ` ${marks}` : ''}`, '');
    }
    if (brief.toCheck?.length) {
      lines.push(t('briefToCheck'), ...brief.toCheck.map(question => `- ${question}`), '');
    }
    if (numbers.size) {
      lines.push(t('briefSources'));
      for (const [id, n] of numbers) {
        const edge = edgeById(id);
        if (!edge) {
          lines.push(`[${n}] ${t('briefCiteMissing')}`);
          continue;
        }
        lines.push(`[${n}] ${edge.statement}`);
        for (const source of edge.sources || []) {
          lines.push(`    ${[source.name, source.recordId, source.retrieved && t('evRead', { date: formatDate(source.retrieved) }), safeUrl(source.url)].filter(Boolean).join(', ')}`);
        }
      }
      lines.push('');
    }
    lines.push(t('briefFooter'));
    return lines.join('\n');
  }

  function say(message) {
    status.textContent = '';
    status.textContent = message;
  }

  async function copy() {
    const text = asText();
    let done = false;
    try {
      await navigator.clipboard.writeText(text);
      done = true;
    } catch {
      // Older browsers and some app shells have no clipboard permission;
      // the selection route still works there.
      const area = h('textarea', { class: 'visually-hidden', readonly: true, 'aria-hidden': 'true' });
      area.value = text;
      element.append(area);
      area.select();
      area.setSelectionRange(0, text.length);
      try {
        done = document.execCommand('copy');
      } catch { /* reported below */ }
      area.remove();
    }
    copyText.textContent = t(done ? 'briefCopied' : 'briefCopy');
    say(t(done ? 'briefCopied' : 'briefCopyFailed'));
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copyText.textContent = t('briefCopy'); }, 2400);
  }

  async function share() {
    try {
      await navigator.share({ title: brief.title || t('briefLabel'), text: asText() });
    } catch { /* the person closed the share sheet */ }
  }

  function open(next) {
    if (!next) return;
    if (!brief) opener = document.activeElement;
    brief = next;
    render();
    element.hidden = false;
    document.documentElement.classList.add('has-brief');
    element.querySelector('.brief-scroll').scrollTop = 0;
    onChange?.(true);
    page.querySelector('.brief-title').focus({ preventScroll: true });
  }

  function close() {
    if (!brief) return;
    brief = null;
    element.hidden = true;
    page.replaceChildren();
    document.documentElement.classList.remove('has-brief');
    onChange?.(false);
    const back = opener;
    opener = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }

  return { element, open, close, isOpen: () => Boolean(brief) };
}
