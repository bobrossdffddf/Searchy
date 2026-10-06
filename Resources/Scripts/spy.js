// Spy Mode — runs in the PAGE world at document start, before any site script, on tabs where it is switched on.
// 1. Event hijacking: focus/visibility/exit-intent events never reach the page.
// 2. Property spoofing: the page always sees a visible, focused, foreground tab.
(() => {
  if (window.__searchySpy) return;
  const hidden = { value: false };
  Object.defineProperty(window, '__searchySpy', { value: true, enumerable: false });

  const BLOCKED = new Set(['blur', 'focus', 'focusin', 'focusout', 'visibilitychange', 'webkitvisibilitychange',
                           'pagehide', 'pageshow', 'freeze', 'resume', 'mouseleave', 'mouseout']);
  // mouseout/mouseleave are only swallowed when the pointer leaves the document (exit-intent trackers).
  const leavesPage = (e) => (e.type === 'mouseout' || e.type === 'mouseleave') ? (e.relatedTarget === null && e.target === document.documentElement || e.target === document || e.target === window) : true;
  const isTopTarget = (t) => t === window || t === document || t === document.documentElement || t === document.body;

  // Capture-phase listeners registered first swallow the event before any page listener runs.
  const swallow = (e) => {
    if (BLOCKED.has(e.type) && (e.target === window || e.target === document || isTopTarget(e.target)) && leavesPage(e)) {
      e.stopImmediatePropagation();
    }
  };
  for (const type of BLOCKED) {
    window.addEventListener(type, swallow, true);
    document.addEventListener(type, swallow, true);
  }

  // Pages that try to register for these on window/document silently get nothing.
  const nativeAdd = EventTarget.prototype.addEventListener;
  const fakes = new WeakMap();
  const patched = function addEventListener(type, listener, options) {
    if (BLOCKED.has(String(type)) && isTopTarget(this)) return;
    return nativeAdd.call(this, type, listener, options);
  };
  EventTarget.prototype.addEventListener = patched;
  fakes.set(patched, nativeAdd);

  // on<event> handler properties.
  const handlerNames = ['onblur', 'onfocus', 'onfocusin', 'onfocusout', 'onvisibilitychange', 'onpagehide', 'onpageshow', 'onfreeze', 'onresume'];
  for (const target of [window, document]) {
    for (const name of handlerNames) {
      try { Object.defineProperty(target, name, { configurable: true, get() { return null; }, set() {} }); } catch (_) {}
    }
  }

  // Property spoofing.
  const define = (obj, key, getter) => {
    try { Object.defineProperty(obj, key, { configurable: true, enumerable: true, get: getter }); } catch (_) {}
  };
  const doc = Document.prototype;
  define(doc, 'hidden', () => false);
  define(doc, 'webkitHidden', () => false);
  define(doc, 'visibilityState', () => 'visible');
  define(doc, 'webkitVisibilityState', () => 'visible');
  define(doc, 'wasDiscarded', () => false);
  const hasFocus = function hasFocus() { return true; };
  fakes.set(hasFocus, Document.prototype.hasFocus);
  doc.hasFocus = hasFocus;
  // A window that is "not maximised" or split-screen looks like a regular full-size one.
  define(window, 'outerWidth', () => window.innerWidth);
  define(window, 'outerHeight', () => window.innerHeight + 0);

  // Make the patched functions look native.
  const nativeToString = Function.prototype.toString;
  const toString = function toString() {
    const original = fakes.get(this);
    return nativeToString.call(original || this);
  };
  fakes.set(toString, nativeToString);
  Function.prototype.toString = toString;
})();
