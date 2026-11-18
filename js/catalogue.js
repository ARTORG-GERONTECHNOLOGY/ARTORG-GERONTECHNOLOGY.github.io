(function () {
  'use strict';
  var root = document.querySelector('.proposal-catalogue');
  var rules = window.ProposalCatalogueFilters;
  if (!root || !rules || !window.URLSearchParams) return;
  var form = root.querySelector('.catalogue-filters');
  // Retain static links if a control or required enhancement is unavailable.
  if (!form || !rules.fields.every(function (field) { return form.elements[field] && form.elements[field].options; })) return;
  var defaults = {status: root.dataset.defaultStatus};
  var options = {};
  rules.fields.forEach(function (field) {
    options[field] = Array.from(form.elements[field].options).map(function (option) { return option.value; });
  });
  var cards = Array.from(root.querySelectorAll('.catalogue-card')).map(function (node) {
    return {node: node, id: node.dataset.proposalId, status: node.dataset.status,
      categories: JSON.parse(node.dataset.categories), year: node.dataset.year};
  });
  var count = root.querySelector('.catalogue-count');
  var empty = root.querySelector('.catalogue-empty');
  function render(state) {
    var visible = new Set();
    cards.forEach(function (card) {
      card.node.hidden = !rules.matches(card, state);
      if (!card.node.hidden) visible.add(card.id);
    });
    Array.from(root.querySelectorAll('.catalogue-group')).forEach(function (group) {
      group.hidden = !Array.from(group.querySelectorAll('.catalogue-card')).some(function (card) { return !card.hidden; });
      var jump = root.querySelector('[data-group-link="' + group.id + '"]');
      if (jump) jump.hidden = group.hidden;
    });
    count.textContent = state.invalid ? 'Some filters are not recognised. Clear filters to start again.' : visible.size + (visible.size === 1 ? ' proposal' : ' proposals');
    empty.hidden = visible.size > 0 || state.invalid;
    rules.fields.forEach(function (field) { form.elements[field].value = state[field]; });
    Array.from(root.querySelectorAll('.catalogue-view-links a')).forEach(function (link) {
      link.href = rules.url(link.href, state, defaults).href;
    });
    Array.from(root.querySelectorAll('.catalogue-status-links a')).forEach(function (link) {
      var targetState = Object.assign({}, state, {status: link.dataset.status});
      link.href = rules.url(link.href, targetState, {status: link.dataset.status}).href;
      if (link.dataset.status === state.status) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
  form.hidden = false;
  render(rules.read(window.location.search, defaults, options));
  form.addEventListener('submit', function (event) { event.preventDefault(); });
  form.addEventListener('change', function () {
    var state = {};
    rules.fields.forEach(function (field) { state[field] = form.elements[field].value; });
    var url = rules.url(window.location.href, state, defaults);
    window.history.pushState(null, '', url);
    render(rules.read(url.search, defaults, options));
  });
  form.querySelector('.catalogue-clear').addEventListener('click', function () {
    var state = {status: defaults.status, category: '', year: ''};
    window.history.pushState(null, '', rules.url(window.location.href, state, defaults));
    render(state);
  });
  window.addEventListener('popstate', function () { render(rules.read(window.location.search, defaults, options)); });
}());
