(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.SiteSearch=factory();}(typeof window!=='undefined'?window:this,function(){
'use strict';
function normalize(text){return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function near(a,b){if(a.length<4||Math.abs(a.length-b.length)>1)return false;var i=0,j=0,errors=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;}else{if(++errors>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}}return errors+(a.length-i)+(b.length-j)<=1;}
function search(items,query,options){options=options||{};var q=normalize(query),tokens=q.split(/\s+/);if(!q)return [];
return items.filter(function(item){return (!options.type||options.type==='all'||item.type===options.type)&&(item.type!=='proposal'||item.status==='available'||options.includeUnavailable);}).map(function(item){
 var title=normalize(item.title),meta=normalize([item.summary,(item.categories||[]).join(' '),(item.tags||[]).join(' '),(item.people||[]).join(' '),item.eligibility].join(' ')),body=normalize(item.text),words=(title+' '+meta+' '+body).split(' '),score=title.includes(q)?100:0;
 var match=tokens.every(function(token){var value=title.includes(token)?20:meta.includes(token)?10:body.includes(token)?2:words.some(function(word){return near(token,word);})?1:0;score+=value;return value>0;});
 return {item:item,score:match?score:0};}).filter(function(hit){return hit.score>0;}).sort(function(a,b){return b.score-a.score||(a.item.url<b.item.url?-1:a.item.url>b.item.url?1:0);}).map(function(hit){return hit.item;});}
function snippet(item,query){var text=item.text||item.summary||'',tokens=normalize(query).split(' '),position=normalize(text).indexOf(tokens[0]),start=Math.max(0,position-50);return (start?'…':'')+text.slice(start,start+200)+(text.length>start+200?'…':'');}
return {search:search,snippet:snippet,normalize:normalize};
}));
