/* Pure filtering rules: also exercised by the Node regression checks. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProposalCatalogueFilters = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var fields = ['status', 'category', 'year', 'eligibility'];
  function read(search, defaults, options) {
    var params = new URLSearchParams(search);
    var state = {invalid: false};
    fields.forEach(function (field) {
      var value = params.has(field) ? params.get(field) : (defaults[field] || '');
      state[field] = value;
      if (options[field].indexOf(value) === -1) state.invalid = true;
    });
    return state;
  }
  function matches(project, state, eligibilityValues) {
    if (state.invalid) return false;
    var statusMatch = state.status === 'all' || (state.status === 'unavailable' ? project.status === 'taken' || project.status === 'archived' : project.status === state.status);
    return statusMatch && (!state.category || project.categories.indexOf(state.category) !== -1) &&
      (!state.year || project.year === state.year) &&
      (!state.eligibility || eligibilityValues[state.eligibility].indexOf(project.eligibility) !== -1);
  }
  function url(href, state, defaults) {
    var result = new URL(href);
    fields.forEach(function (field) {
      if (state[field] === (defaults[field] || '')) result.searchParams.delete(field);
      else result.searchParams.set(field, state[field]);
    });
    return result;
  }
  return {fields: fields, read: read, matches: matches, url: url};
}));
