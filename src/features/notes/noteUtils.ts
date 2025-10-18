const STYLE_WHITELIST = new Set(['text-align']);
const ALLOWED_ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify']);
const TAG_REMAP: Record<string, string> = {
  B: 'strong',
  I: 'em',
};

const ALLOWED_TAGS = new Set([
  'p',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'blockquote',
  'pre',
  'code',
  'a',
  'mark',
  'br',
  'hr',
  'span',
  'div',
]);

const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ['href'],
  span: ['style'],
  div: ['style'],
  p: ['style'],
  h1: ['style'],
  h2: ['style'],
  h3: ['style'],
  blockquote: ['style'],
  pre: ['style'],
};

const HTML_FALLBACK_REPLACEMENTS: Array<[RegExp, string]> = [
  [/<!DOCTYPE[^>]*>/gi, ''],
  [/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ''],
  [/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ''],
  [/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, ''],
  [/<object[\s\S]*?>[\s\S]*?<\/object>/gi, ''],
  [/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, ''],
];

export function sanitizeNoteHtml(html: string): string {
  if (!html) {
    return '';
  }

  if (typeof window === 'undefined') {
    return HTML_FALLBACK_REPLACEMENTS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), html)
      .replace(/ on[a-z]+="[^"]*"/gi, '')
      .replace(/ on[a-z]+='[^']*'/gi, '');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;

  sanitizeElement(body);
  normaliseStructure(body, doc);

  return body.innerHTML.trim();
}

export function extractPlainText(html: string): string {
  if (!html) {
    return '';
  }

  if (typeof window === 'undefined') {
    return html
      .replace(/<br\s*\/?>(\s|&nbsp;)*/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function generateNoteSummary(text: string, maxLength = 200): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  const truncated = trimmed.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const base = lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated;
  return `${base.trim()}…`;
}

export function computeNoteMetadata(html: string) {
  const sanitisedHtml = sanitizeNoteHtml(html);
  const plainText = extractPlainText(sanitisedHtml);
  const words = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
  const summary = generateNoteSummary(plainText);

  return {
    html: sanitisedHtml,
    plainText,
    wordCount: words,
    summary,
  };
}

function sanitizeElement(element: HTMLElement) {
  Array.from(element.childNodes).forEach(node => {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return;
    }

    if (!(node instanceof HTMLElement)) {
      node.remove();
      return;
    }

    let current = node;
    const tagName = current.tagName.toUpperCase();
    const remapTarget = TAG_REMAP[tagName];
    if (remapTarget) {
      current = remapTag(current, remapTarget);
    }

    const lowerTag = current.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(lowerTag)) {
      unwrapElement(current);
      return;
    }

    cleanAttributes(current);
    sanitizeElement(current);

    if (current.tagName.toLowerCase() === 'span' && current.attributes.length === 0) {
      unwrapElement(current);
    }
  });
}

function normaliseStructure(container: HTMLElement, doc: Document) {
  const nodes = Array.from(container.childNodes);
  nodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!text.trim()) {
        node.remove();
        return;
      }

      const paragraph = doc.createElement('p');
      paragraph.textContent = text.trim();
      container.insertBefore(paragraph, node);
      node.remove();
      return;
    }

    if (!(node instanceof HTMLElement)) {
      node.remove();
      return;
    }

    if (node.tagName.toLowerCase() === 'div') {
      const paragraph = remapTag(node, 'p');
      normaliseStructure(paragraph, doc);
    }

    if (node.tagName.toLowerCase() === 'p' && node.childNodes.length === 0) {
      node.appendChild(doc.createElement('br'));
    }
  });
}

function remapTag(element: HTMLElement, newTag: string): HTMLElement {
  const doc = element.ownerDocument;
  const replacement = doc.createElement(newTag);
  const textAlign = extractAlignFromStyle(element.getAttribute('style') ?? '');

  while (element.firstChild) {
    replacement.appendChild(element.firstChild);
  }

  element.replaceWith(replacement);

  if (textAlign) {
    replacement.setAttribute('style', `text-align: ${textAlign}`);
  }

  cleanAttributes(replacement);
  return replacement;
}

function unwrapElement(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) return;

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }

  element.remove();
}

function cleanAttributes(element: HTMLElement) {
  const tagName = element.tagName.toLowerCase();
  const allowedAttrs = ALLOWED_ATTRS[tagName] ?? [];

  Array.from(element.attributes).forEach(attr => {
    const name = attr.name.toLowerCase();

    if (name.startsWith('on')) {
      element.removeAttribute(attr.name);
      return;
    }

    if (name === 'style') {
      const safeStyle = sanitiseStyle(attr.value);
      if (safeStyle) {
        element.setAttribute('style', safeStyle);
      } else {
        element.removeAttribute('style');
      }
      return;
    }

    if (!allowedAttrs.includes(name)) {
      element.removeAttribute(attr.name);
      return;
    }

    if (tagName === 'a' && name === 'href') {
      const href = attr.value.trim();
      if (!href || href.toLowerCase().startsWith('javascript:')) {
        element.removeAttribute(attr.name);
        return;
      }
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

function sanitiseStyle(styleValue: string): string | null {
  const declarations = styleValue
    .split(';')
    .map(part => part.trim())
    .filter(Boolean);

  const safeDeclarations: string[] = [];

  declarations.forEach(declaration => {
    const [property, rawValue] = declaration.split(':').map(part => part.trim());
    if (!property || !rawValue) {
      return;
    }

    const lowerProperty = property.toLowerCase();
    if (!STYLE_WHITELIST.has(lowerProperty)) {
      return;
    }

    if (lowerProperty === 'text-align') {
      const alignValue = rawValue.toLowerCase();
      if (ALLOWED_ALIGN_VALUES.has(alignValue)) {
        safeDeclarations.push(`text-align: ${alignValue}`);
      }
    }
  });

  return safeDeclarations.length > 0 ? safeDeclarations.join('; ') : null;
}

function extractAlignFromStyle(styleValue: string): string | null {
  const match = /text-align\s*:\s*(left|center|right|justify)/i.exec(styleValue);
  return match ? match[1].toLowerCase() : null;
}
