/**
 * The flow recorder's in-page half, delivered as a string.
 *
 * Like observe's walker it runs in the customer's page, so it never goes
 * through the host transpiler: the script below is plain ES2020 in a string
 * constant, wrapped around observe's prebuilt walker bundle so that a
 * recorded element is described (role, accessible name, naming source,
 * labels, landmark, data-block, test id, id, tag, input type) exactly the
 * way an observation describes it. Everything it defines is local to one
 * evaluated arrow function; the only global it leaves is the non-enumerable
 * `window.__tesseractRecorder` control object.
 *
 * It is installed for every document (page.addInitScript) and, at the start
 * of a recording, for the current one (page.evaluate); a guard makes the
 * second install a no-op. On load it asks Node, through the
 * `__tesseractRecord` binding, whether a recording is running; until the
 * answer arrives events are buffered.
 *
 * What it reports, in the capture phase, from trusted user input (and from
 * untrusted change events on visible controls, which is how Playwright's
 * selectOption arrives):
 * - click on the nearest interactive ancestor (clicks that only focus a text
 *   field, or toggle a checkbox or radio, are left to fill / check);
 * - change on a select (the selected option's label), checkbox, or radio;
 * - the final value of a text field, coalesced: sent on change, blur, a key
 *   press, a pointer press elsewhere, page hide, the Stop button, or after
 *   1.5 s without typing — never per keystroke;
 * - keydown Enter, Escape, Tab (and Shift+Tab); the click a browser
 *   synthesizes for Enter is suppressed.
 *
 * Password fields, fields with a password autocomplete hint, and fields
 * whose accessible name (or label, placeholder, name, id) matches an entry
 * of the recording's redact list never send their value: only
 * `{ secret: true }`.
 *
 * Each event carries the element's ref in the observe registry
 * (`window.__tesseract`) when it is registered there, plus the description.
 * The element itself is kept (bounded) under the event's seq, so Node can
 * later ask where it is in whatever snapshot is registered then.
 */
import { IN_PAGE_BUNDLE } from '../observe/in-page/bundle.generated.js';

/** Global control object the script leaves on the page (non-enumerable). */
export const RECORDER_GLOBAL = '__tesseractRecorder';

/** Name of the binding Node exposes for the page to report to. */
export const RECORDER_BINDING = '__tesseractRecord';

/** Attribute that marks Tesseract's own UI; observe's walker skips it. */
export const IGNORE_ATTRIBUTE = 'data-tesseract-ignore';

/** Idle time after the last keystroke before a text field's value is reported anyway. */
export const FILL_IDLE_MS = 1_500;

const BODY = String.raw`
var KEY = '__tesseractRecorder';
var BINDING = '__tesseractRecord';
var IGNORE = 'data-tesseract-ignore';
var REGISTRY = '__tesseract';
var FILL_IDLE_MS = 1500;
var MAX_KEPT = 200;
var api = __tesseractInPage;
var docId = Math.random().toString(36).slice(2, 10);
var nextElementId = 0;
var elementIds = new WeakMap();
var state = {
  configured: false,
  active: false,
  token: null,
  redact: [],
  stopButton: false,
  buffer: [],
  seq: 0,
  kept: new Map(),
  lastSent: new WeakMap(),
  dirty: new Set(),
  idleTimer: null,
  lastEnterAt: 0,
  host: null,
  hostTimer: null,
  held: null
};

var norm = function (text) { return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().toLowerCase(); };

var send = function (payload) {
  var fn = window[BINDING];
  if (typeof fn !== 'function') return;
  try {
    var result = fn(payload);
    if (result && typeof result.catch === 'function') result.catch(function () {});
  } catch (e) {}
};

var emit = function (event) {
  if (!state.configured) {
    if (state.buffer.length < 100) state.buffer.push(event);
    return;
  }
  if (!state.active) return;
  event.token = state.token;
  send(event);
};

var registry = function () {
  var value = window[REGISTRY];
  if (value === null || typeof value !== 'object') return null;
  return typeof value.snapshotId === 'string' && value.refs instanceof Map ? value : null;
};

var setRegistry = function (value) {
  Object.defineProperty(window, REGISTRY, { value: value, configurable: true, writable: true, enumerable: false });
};

var refIn = function (reg, el) {
  if (reg === null) return null;
  var found = null;
  reg.refs.forEach(function (candidate, ref) { if (found === null && candidate === el) found = ref; });
  return found;
};

var elementKey = function (el) {
  var id = elementIds.get(el);
  if (id === undefined) { nextElementId += 1; id = nextElementId; elementIds.set(el, id); }
  return docId + ':' + id;
};

var pathOf = function (event) {
  var raw = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  var out = [];
  for (var i = 0; i < raw.length; i += 1) { if (raw[i] && raw[i].nodeType === 1) out.push(raw[i]); }
  return out;
};

var ignored = function (path) {
  for (var i = 0; i < path.length; i += 1) { if (path[i].hasAttribute(IGNORE)) return true; }
  return false;
};

var INTERACTIVE_ROLES = ['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'combobox', 'textbox', 'searchbox', 'listbox', 'slider', 'spinbutton', 'treeitem'];
var NON_TEXT_INPUTS = ['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'hidden', 'range', 'color'];

var ownsClickHandler = function (el) {
  if (el.hasAttribute('onclick')) return true;
  var keys = Object.keys(el);
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    if (key.indexOf('__reactProps$') === 0 || key.indexOf('__reactEventHandlers$') === 0) {
      var props = el[key];
      if (props && typeof props === 'object' && typeof props.onClick === 'function') return true;
    }
  }
  return false;
};

var isTextEntry = function (el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') return NON_TEXT_INPUTS.indexOf(String(el.type).toLowerCase()) < 0;
  return el.isContentEditable === true && el !== document.body && el !== document.documentElement;
};

var isToggle = function (el) {
  return el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio');
};

var isInteractive = function (el) {
  var tag = el.tagName;
  if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'SUMMARY') return true;
  if (tag === 'INPUT') return String(el.type).toLowerCase() !== 'hidden';
  if ((tag === 'A' || tag === 'AREA') && el.hasAttribute('href')) return true;
  var role = String(el.getAttribute('role') || '').trim().split(/\s+/)[0];
  if (role && INTERACTIVE_ROLES.indexOf(role) >= 0) return true;
  if (ownsClickHandler(el)) return true;
  var tabindex = el.getAttribute('tabindex');
  if (tabindex !== null && parseInt(tabindex, 10) >= 0) return true;
  if (el.hasAttribute('data-link') || el.hasAttribute('data-button')) return true;
  return el.isContentEditable === true && el.hasAttribute('contenteditable');
};

/** The control a click lands on: the nearest interactive ancestor; a label stands for its control. */
var clickTarget = function (path) {
  for (var i = 0; i < path.length; i += 1) {
    var el = path[i];
    if (el === document.body || el === document.documentElement) return null;
    if (el.tagName === 'LABEL') return { label: el };
    if (isInteractive(el)) return { el: el };
  }
  return null;
};

var visible = function (el) {
  try {
    if (typeof el.checkVisibility === 'function') return el.checkVisibility();
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  } catch (e) { return false; }
};

var keep = function (seq, el) {
  state.kept.set(seq, el);
  if (state.kept.size > MAX_KEPT) state.kept.delete(state.kept.keys().next().value);
};

var describe = function (el) {
  var reg = registry();
  var ref = refIn(reg, el);
  var descriptor = null;
  try { descriptor = api.describeElement(el, ref === null ? 'recorded' : ref); } catch (e) { descriptor = null; }
  return { snapshotId: ref === null ? null : reg.snapshotId, ref: ref, descriptor: descriptor };
};

var isSecret = function (el, descriptor) {
  if (el.tagName === 'INPUT' && String(el.type).toLowerCase() === 'password') return true;
  if (el.hasAttribute('data-tesseract-secret')) return true;
  var autocomplete = norm(el.getAttribute('autocomplete'));
  if (autocomplete.indexOf('password') >= 0 || autocomplete.indexOf('one-time-code') >= 0 || autocomplete.indexOf('cc-number') >= 0 || autocomplete.indexOf('cc-csc') >= 0) return true;
  if (state.redact.length === 0) return false;
  var names = [el.getAttribute('name'), el.getAttribute('id'), el.getAttribute('aria-label')];
  if (descriptor) names.push(descriptor.name, descriptor.labelText, descriptor.placeholder);
  for (var i = 0; i < names.length; i += 1) {
    var name = norm(names[i]);
    if (name.length > 0 && state.redact.indexOf(name) >= 0) return true;
  }
  return false;
};

var record = function (action, el, extra) {
  state.seq += 1;
  var seq = state.seq;
  var info = el ? describe(el) : { snapshotId: null, ref: null, descriptor: null };
  if (el) keep(seq, el);
  var event = {
    type: 'action',
    doc: docId,
    seq: seq,
    action: action,
    element: el ? elementKey(el) : null,
    url: String(location.href),
    at: Date.now(),
    snapshotId: info.snapshotId,
    ref: info.ref,
    descriptor: info.descriptor
  };
  var fields = typeof extra === 'function' ? extra(info.descriptor) : extra;
  if (fields) { for (var k in fields) { if (Object.prototype.hasOwnProperty.call(fields, k)) event[k] = fields[k]; } }
  emit(event);
};

var valueOf = function (el) {
  if ('value' in el && typeof el.value === 'string') return el.value;
  return String(el.innerText || el.textContent || '');
};

var flush = function (el) {
  if (!state.dirty.has(el)) return;
  state.dirty.delete(el);
  if (!el.isConnected) return;
  var value = valueOf(el);
  if (state.lastSent.get(el) === value) return;
  state.lastSent.set(el, value);
  record('fill', el, function (descriptor) {
    return isSecret(el, descriptor) ? { secret: true } : { value: value.length > 10000 ? value.slice(0, 10000) : value };
  });
};

var flushAll = function () {
  if (state.idleTimer !== null) { clearTimeout(state.idleTimer); state.idleTimer = null; }
  Array.from(state.dirty).forEach(flush);
};

var onInput = function (event) {
  var path = pathOf(event);
  if (path.length === 0 || ignored(path)) return;
  var el = path[0];
  if (!isTextEntry(el)) return;
  state.dirty.add(el);
  if (state.idleTimer !== null) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(function () { state.idleTimer = null; flushAll(); }, FILL_IDLE_MS);
};

var onChange = function (event) {
  var path = pathOf(event);
  if (path.length === 0 || ignored(path)) return;
  var el = path[0];
  if (isTextEntry(el)) { state.dirty.add(el); flush(el); return; }
  if (!event.isTrusted && !visible(el)) return;
  if (el.tagName === 'SELECT') {
    flushAll();
    var option = el.selectedOptions && el.selectedOptions[0];
    var label = option ? String(option.label || option.textContent || option.value || '').replace(/\s+/g, ' ').trim() : '';
    record('select', el, { value: label });
    return;
  }
  if (isToggle(el)) {
    flushAll();
    record(el.checked ? 'check' : 'uncheck', el);
  }
};

var onFocusOut = function (event) {
  var path = pathOf(event);
  if (path.length > 0 && isTextEntry(path[0])) flush(path[0]);
};

var onPointerDown = function (event) {
  if (!event.isTrusted) return;
  flushAll();
};

var onClick = function (event) {
  if (!event.isTrusted) return;
  var path = pathOf(event);
  if (path.length === 0 || ignored(path)) return;
  if (event.detail === 0 && Date.now() - state.lastEnterAt < 600) return;
  flushAll();
  var hit = clickTarget(path);
  if (hit === null || hit.label) return;
  var el = hit.el;
  if (isTextEntry(el) || isToggle(el) || el.tagName === 'SELECT' || el.tagName === 'OPTION') return;
  record('click', el);
};

var onKeyDown = function (event) {
  if (!event.isTrusted || event.isComposing) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  var key = event.key;
  if (key !== 'Enter' && key !== 'Escape' && key !== 'Tab') return;
  var path = pathOf(event);
  if (ignored(path)) return;
  flushAll();
  if (key === 'Enter') state.lastEnterAt = Date.now();
  var target = path.length > 0 ? path[0] : null;
  if (target === document.body || target === document.documentElement) target = null;
  record('press', target, { key: key === 'Tab' && event.shiftKey ? 'Shift+Tab' : key });
};

var hideStop = function () {
  if (state.hostTimer !== null) { clearInterval(state.hostTimer); state.hostTimer = null; }
  if (state.host !== null) { state.host.remove(); state.host = null; }
};

var showStop = function () {
  if (!state.active || !state.stopButton) return;
  if (state.host !== null && state.host.isConnected) return;
  if (document.body === null) {
    document.addEventListener('DOMContentLoaded', showStop, { once: true });
    return;
  }
  if (state.host === null) {
    var host = document.createElement('div');
    host.setAttribute(IGNORE, '');
    host.setAttribute('style', 'position:fixed;right:16px;bottom:16px;z-index:2147483647;margin:0;padding:0;border:0;background:none;');
    var root = host.attachShadow({ mode: 'closed' });
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Stop recording';
    button.setAttribute('style', 'display:block;margin:0;font:600 13px/1.2 system-ui,sans-serif;padding:8px 14px;border-radius:6px;border:1px solid #991b1b;background:#dc2626;color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);');
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      flushAll();
      emit({ type: 'stop', at: Date.now() });
    });
    root.appendChild(button);
    state.host = host;
  }
  document.body.appendChild(state.host);
  if (state.hostTimer === null) {
    state.hostTimer = setInterval(function () {
      if (state.active && state.host !== null && !state.host.isConnected && document.body !== null) document.body.appendChild(state.host);
    }, 1000);
  }
};

var configure = function (config) {
  state.configured = true;
  state.active = !!(config && config.active);
  state.token = state.active ? String(config.token) : null;
  state.redact = config && Array.isArray(config.redact) ? config.redact.map(norm).filter(function (r) { return r.length > 0; }) : [];
  state.stopButton = state.active && !!config.stopButton;
  var buffered = state.buffer;
  state.buffer = [];
  if (state.active) {
    buffered.forEach(emit);
    if (state.stopButton) showStop(); else hideStop();
  } else {
    state.dirty.clear();
    hideStop();
  }
  return state.active;
};

/** Where the element of event (doc, seq) is now: attached or not, and its ref in the registered snapshot. */
var locate = function (doc, seq) {
  var el = doc === docId ? state.kept.get(seq) : undefined;
  if (el === undefined) return { known: false, attached: false, snapshotId: null, ref: null };
  var attached = el.isConnected === true;
  var reg = registry();
  var ref = attached ? refIn(reg, el) : null;
  return { known: true, attached: attached, snapshotId: ref === null ? null : reg.snapshotId, ref: ref };
};

/** Remember the registered snapshot before the recorder observes. */
var hold = function () {
  state.held = registry();
  return state.held === null ? null : state.held.snapshotId;
};

/**
 * After the recorder observed: put back the snapshot someone else (an agent's
 * app.observe / app.act) had registered, so their refs stay valid, unless
 * another observation registered in the meantime.
 */
var release = function (own) {
  var held = state.held;
  state.held = null;
  if (held === null || own.indexOf(held.snapshotId) >= 0) return false;
  var current = registry();
  if (current === null || own.indexOf(current.snapshotId) < 0) return false;
  setRegistry(held);
  return true;
};

var status = function () {
  return { configured: state.configured, active: state.active, stopButton: state.host !== null && state.host.isConnected, buffered: state.buffer.length };
};

Object.defineProperty(window, KEY, {
  value: { configure: configure, locate: locate, hold: hold, release: release, status: status, flush: flushAll },
  configurable: true,
  writable: false,
  enumerable: false
});

window.addEventListener('pointerdown', onPointerDown, true);
window.addEventListener('click', onClick, true);
window.addEventListener('input', onInput, true);
window.addEventListener('change', onChange, true);
window.addEventListener('focusout', onFocusOut, true);
window.addEventListener('keydown', onKeyDown, true);
window.addEventListener('pagehide', flushAll, true);

var hello = window[BINDING];
if (typeof hello === 'function') {
  try {
    var answer = hello({ type: 'hello' });
    if (answer && typeof answer.then === 'function') {
      answer.then(function (config) { if (!state.configured) configure(config); }, function () { configure({ active: false }); });
    }
  } catch (e) {}
}
`;

/**
 * The whole init script: top frame only, installed once per document, the
 * walker bundle and the recorder body inside one arrow so nothing leaks.
 */
export const RECORDER_SCRIPT = `(() => {
if (window.top !== window || Object.prototype.hasOwnProperty.call(window, '${RECORDER_GLOBAL}')) return;
${IN_PAGE_BUNDLE}
${BODY}
})()`;

/** An expression calling one method of the recorder's control object; undefined when it is not installed. */
export const recorderCall = (method: 'configure' | 'locate' | 'hold' | 'release' | 'status' | 'flush', ...args: readonly unknown[]): string =>
  `(() => { const r = window.${RECORDER_GLOBAL}; return r === undefined ? undefined : r.${method}(...${JSON.stringify(args)}); })()`;
