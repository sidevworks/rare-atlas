// A small XML reader, enough for the ClinVar records this loader opens. It
// builds a tree of { name, attrs, children, text } and nothing more: no
// namespaces, no validation.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decode(text) {
  return String(text).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

function readAttributes(source) {
  const attrs = {};
  const pattern = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = pattern.exec(source))) attrs[match[1]] = decode(match[3] ?? match[4] ?? '');
  return attrs;
}

export function parseXml(xml) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let at = 0;
  while (at < xml.length) {
    const open = xml.indexOf('<', at);
    if (open === -1) break;
    if (open > at) stack[stack.length - 1].text += decode(xml.slice(at, open));
    if (xml.startsWith('<!--', open)) {
      const end = xml.indexOf('-->', open);
      at = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', open)) {
      const end = xml.indexOf(']]>', open);
      stack[stack.length - 1].text += xml.slice(open + 9, end === -1 ? xml.length : end);
      at = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<?', open) || xml.startsWith('<!', open)) {
      const end = xml.indexOf('>', open);
      at = end === -1 ? xml.length : end + 1;
      continue;
    }
    const close = xml.indexOf('>', open);
    if (close === -1) break;
    const inside = xml.slice(open + 1, close);
    if (inside[0] === '/') {
      const name = inside.slice(1).trim();
      // Close up to the matching tag, so one stray tag cannot lose the rest.
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth].name === name) {
          stack.length = depth;
          break;
        }
      }
    } else {
      const selfClosing = inside.endsWith('/');
      const body = selfClosing ? inside.slice(0, -1) : inside;
      const space = body.search(/\s/);
      const node = {
        name: space === -1 ? body : body.slice(0, space),
        attrs: space === -1 ? {} : readAttributes(body.slice(space)),
        children: [],
        text: '',
      };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
    }
    at = close + 1;
  }
  return root;
}

export const kids = (node, name) => (node?.children || []).filter(child => child.name === name);
export const kid = (node, name) => (node?.children || []).find(child => child.name === name) || null;

// Every descendant with this tag name, at any depth.
export function all(node, name, found = []) {
  for (const child of node?.children || []) {
    if (child.name === name) found.push(child);
    all(child, name, found);
  }
  return found;
}

export const textOf = node => (node ? node.text.replace(/\s+/g, ' ').trim() : '');
