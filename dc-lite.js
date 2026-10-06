/*
 * dc-lite — tiny runtime for the Ignite pages.
 * Supports: {{path}} text and attribute holes, <dc-if data-if>, <template data-for data-as>,
 * data-on-<event> handlers, data-prop-<name> (value/disabled), and a React-like DCLogic class
 * (state, setState(updater, cb), lifecycle). No dependencies.
 */
(function () {
  'use strict';

  function get(scope, path) {
    path = String(path).trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  function interp(tpl, scope) {
    return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, p) {
      var v = get(scope, p);
      return v == null ? '' : String(v);
    });
  }

  function eventName(el, name) {
    if (name === 'change' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.type !== 'file') return 'input';
    return name;
  }

  function dispatch(e) {
    var h = e.currentTarget.__dcHandlers && e.currentTarget.__dcHandlers[e.type];
    if (typeof h === 'function') h(e);
  }

  function processChildren(node, scope) {
    var kids = Array.prototype.slice.call(node.children);
    for (var i = 0; i < kids.length; i++) if (!kids[i].__dcItem) processEl(kids[i], scope);
  }

  function processEl(el, scope) {
    var tag = el.tagName;
    if (tag === 'TEMPLATE' && el.hasAttribute('data-for')) { renderFor(el, scope); return; }
    if (tag === 'DC-IF') {
      var on = !!get(scope, el.getAttribute('data-if'));
      if (el.hidden === on) el.hidden = !on;
      if (!on) return;
    }
    if (tag === 'DC-T') {
      var v = get(scope, el.getAttribute('data-text'));
      var s = v == null ? '' : String(v);
      if (el.textContent !== s) el.textContent = s;
      return;
    }
    var attrs = Array.prototype.slice.call(el.attributes);
    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i].name, val = attrs[i].value;
      if (a.indexOf('data-attr-') === 0) {
        var real = a.slice(10), out = interp(val, scope);
        if (el.getAttribute(real) !== out) el.setAttribute(real, out);
      } else if (a.indexOf('data-prop-') === 0) {
        var prop = a.slice(10), pv = get(scope, val);
        if (prop === 'value') {
          var sv = pv == null ? '' : String(pv);
          if (el.value !== sv) el.value = sv;
        } else if (prop === 'disabled' || prop === 'checked') {
          el[prop] = !!pv;
        } else {
          el[prop] = pv;
        }
      } else if (a.indexOf('data-on-') === 0) {
        var ev = eventName(el, a.slice(8));
        el.__dcHandlers = el.__dcHandlers || {};
        if (!el.__dcHandlers[ev]) el.addEventListener(ev, dispatch);
        el.__dcHandlers[ev] = get(scope, val);
      }
    }
    processChildren(el, scope);
  }

  function renderFor(tpl, scope) {
    var list = get(scope, tpl.getAttribute('data-for')) || [];
    var as = tpl.getAttribute('data-as') || 'item';
    var groups = tpl.__dcGroups || [];
    if (groups.length !== list.length) {
      groups.forEach(function (g) { g.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); });
      groups = [];
      for (var i = 0; i < list.length; i++) {
        var frag = tpl.content.cloneNode(true);
        var nodes = Array.prototype.slice.call(frag.childNodes);
        nodes.forEach(function (n) { n.__dcItem = true; });
        tpl.parentNode.insertBefore(frag, tpl);
        groups.push(nodes);
      }
      tpl.__dcGroups = groups;
    }
    for (var j = 0; j < list.length; j++) {
      var s = Object.create(scope);
      s[as] = list[j];
      s.$index = j;
      groups[j].forEach(function (n) { if (n.nodeType === 1) processEl(n, s); });
    }
  }

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (update, cb) {
    var patch = typeof update === 'function' ? update(this.state, this.props) : update;
    this.state = Object.assign({}, this.state, patch);
    if (this.__render) this.__render();
    if (typeof cb === 'function') cb();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__render) this.__render(); };

  function mount(Comp, props, rootId) {
    var root = document.getElementById(rootId || 'dc-root');
    var c = new Comp(props || {});
    c.props = props || {};
    if (!c.state) c.state = {};
    c.__render = function () { processChildren(root, c.renderVals()); };
    c.__render();
    if (c.componentDidMount) c.componentDidMount();
    window.addEventListener('pagehide', function () { if (c.componentWillUnmount) c.componentWillUnmount(); });
    return c;
  }

  window.DCLogic = DCLogic;
  window.DCLite = { mount: mount };
})();
