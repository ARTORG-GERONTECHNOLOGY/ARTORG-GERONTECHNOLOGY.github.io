'use strict';
const assert = require('node:assert/strict');
const rules = require('../../js/catalogue-filters.js');
const projects = [
  {id:'available-bme', status:'available', categories:['gait-analysis'], year:'2026', eligibility:'bme_only'},
  {id:'available-both', status:'available', categories:['biomarkers','gait-analysis'], year:'2025', eligibility:'bme_and_aim'},
  {id:'taken', status:'taken', categories:['biomarkers'], year:'2026', eligibility:'bme_and_aim'},
  {id:'archived', status:'archived', categories:['gait-analysis'], year:'2025', eligibility:'bme_only'}
];
const options = {status:['all','available','taken','archived','unavailable'],category:['','gait-analysis','biomarkers'],year:['','2025','2026'],eligibility:['','bme','aim']};
const eligibility = {bme:['bme_only','bme_and_aim'],aim:['bme_and_aim']};
const defaults = {status:'available'};
function results(query) { const state=rules.read(query,defaults,options); return projects.filter(project=>rules.matches(project,state,eligibility)).map(project=>project.id); }
assert.deepEqual(results(''), ['available-bme','available-both']);
assert.deepEqual(results('?status=taken'), ['taken']);
assert.deepEqual(results('?status=archived'), ['archived']);
assert.deepEqual(results('?status=unavailable'), ['taken','archived']);
assert.deepEqual(results('?status=all'), projects.map(project=>project.id));
assert.deepEqual(results('?status=all&eligibility=aim'), ['available-both','taken']);
assert.deepEqual(results('?category=gait-analysis'), ['available-bme','available-both']);
assert.deepEqual(results('?category=biomarkers'), ['available-both']);
assert.deepEqual(results('?year=2025'), ['available-both']);
assert.deepEqual(results('?year=2026&category=biomarkers'), []);
assert.deepEqual(results('?eligibility=bme'), ['available-bme','available-both']);
assert.deepEqual(results('?eligibility=aim'), ['available-both']);
assert.deepEqual(results('?status=unavailable&eligibility=aim'), ['taken']);
for (const field of rules.fields) assert.deepEqual(results('?'+field+'=unknown'), []);
const state=rules.read('?status=taken&category=biomarkers&year=2026&eligibility=aim',defaults,options);
const shared=rules.url('https://example.org/preview/posts/?source=shared#all-proposals',state,defaults);
assert.equal(shared.pathname,'/preview/posts/');
assert.equal(shared.hash,'#all-proposals');
assert.equal(shared.searchParams.get('source'),'shared');
assert.deepEqual(rules.read(shared.search,defaults,options),state);
const clear=rules.url(shared.href,{status:'available',category:'',year:'',eligibility:''},defaults);
assert.equal(clear.search,'?source=shared');
assert.deepEqual(rules.read(clear.search,defaults,options),rules.read('',defaults,options));
assert.deepEqual(rules.read('',{status:'archived'},options).status,'archived');
const sets = {
 status: {all:projects.map(p=>p.id),available:['available-bme','available-both'],taken:['taken'],archived:['archived'],unavailable:['taken','archived']},
 category: {'gait-analysis':['available-bme','available-both','archived'],biomarkers:['available-both','taken']},
 year: {'2025':['available-both','archived'],'2026':['available-bme','taken']},
 eligibility: {bme:projects.map(p=>p.id),aim:['available-both','taken']}
};
let combinations=0;
for (const status of options.status) for (const category of options.category) for (const year of options.year) for (const program of options.eligibility) {
 const query = new URLSearchParams({status,category,year,eligibility:program}).toString();
 const expected = projects.map(p=>p.id).filter(id=>sets.status[status].includes(id) && (!category || sets.category[category].includes(id)) && (!year || sets.year[year].includes(id)) && (!program || sets.eligibility[program].includes(id)));
 assert.deepEqual(results(query), expected, query);
 combinations++;
}
console.log(combinations+' filter combinations passed.');
console.log('PASS catalogue status/category/year/eligibility intersections, empty/invalid results, shared URLs, default restoration and query/fragment preservation.');
