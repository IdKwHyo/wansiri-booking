import {createRequire} from 'node:module';import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);const wranglerRequire=createRequire(require.resolve('wrangler/package.json'));const {Miniflare}=await import(wranglerRequire.resolve('miniflare'));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:{DB:'clinic-test'},cf:false});
try{fs.mkdirSync('.test-runtime',{recursive:true});const database=await mf.getD1Database('DB');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){for(const sql of fs.readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint'))if(sql.trim())await database.prepare(sql).run()}
for(const name of ['contracts','assistant','guards','service'])fs.writeFileSync('.test-runtime/'+name+'.mjs',ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll("'./contracts'","'./contracts.mjs'").replaceAll("'./guards'","'./guards.mjs'"));
fs.writeFileSync('.test-runtime/db.mjs','let database; export function configure(d){database=d} export function db(){return database} export function runtime(){return {}}');
fs.writeFileSync('.test-runtime/route.mjs',ts.transpileModule(fs.readFileSync('app/api/v1/[...path]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll("'@/lib/","'./").replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'"));
const {configure}=await import('../.test-runtime/db.mjs');let roundTrips=0;const underlying=new WeakMap();function tracked(stmt){const view={bind:(...args)=>tracked(stmt.bind(...args)),first:(...args)=>{roundTrips++;return stmt.first(...args)},all:(...args)=>{roundTrips++;return stmt.all(...args)},run:(...args)=>{roundTrips++;return stmt.run(...args)}};underlying.set(view,stmt);return view}configure({prepare:(sql)=>tracked(database.prepare(sql)),batch:(statements)=>{roundTrips++;return database.batch(statements.map(s=>underlying.get(s)))}});const {POST,GET,PATCH}=await import('../.test-runtime/route.mjs');const {clinicDate}=await import('../.test-runtime/contracts.mjs');const today=clinicDate();
async function call(path,method='GET',body,headers={}){const req=new Request('https://clinic.test/api/v1/'+path,{method,headers:{'oai-authenticated-user-id':'test-user','oai-authenticated-user-email':'staff@example.test',...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});const response=await ({GET,POST,PATCH}[method])(req);return {status:response.status,data:await response.json()}}
const noauth=await GET(new Request('https://clinic.test/api/v1/meta'));assert.equal(noauth.status,401);
assert.equal((await call('appointments','POST',{}, {origin:'https://evil.test'})).status,403);
assert.equal((await call('meta')).status,200);
const draft=(hn,time)=>({patient:{hn,name:'Test '+hn,dob:'2000-01-01',sex:'Not specified'},date:today,time,requestId:crypto.randomUUID()});
const original=draft('00001','11:00');roundTrips=0;const first=await call('appointments','POST',original);assert.equal(roundTrips,2,'new-patient save uses two database round trips');assert.equal(first.status,201,JSON.stringify(first));assert.equal(first.data.hn,'00001');const id=first.data.id;
assert.equal((await call('appointments','POST',original)).data.id,id,'Idempotent retry');
assert.equal((await call('appointments','POST',draft('00002','11:00'))).status,409,'full slot');
assert.equal((await call('appointments','POST',draft('00001','11:30'))).status,409,'duplicate HN');
const base={patientId:first.data.patientId,date:today,time:'11:00',arrival:null,service:'General',followup:false,tags:['General'],status:'booked',seen:false,remarks:'Wheelchair assistance',version:1,requestId:crypto.randomUUID()};
roundTrips=0;const edit=await call('appointments/'+id,'PATCH',{...base,arrival:'10:50',status:'waiting'});assert.equal(edit.status,200,JSON.stringify(edit));assert.equal(roundTrips,2,'visit update uses two database round trips');
assert.equal((await call('appointments/'+id,'PATCH',{...base,remarks:'stale'})).status,409,'stale update');
const ev=(await call('events?entityId='+id)).data.events;assert.equal(ev.length,2,'stale update cannot log success');
const found=await call('appointments/search','POST',{filters:{dateFrom:today,dateTo:today,timeField:'arrival',timeTo:'10:59',seen:false,remarks:'Wheelchair'}});assert.equal(found.data.total,1,JSON.stringify(found));
assert.equal((await call('appointments/search','POST',{filters:{sql:'DROP TABLE patients'}})).status,400);
assert.equal((await call('appointments/'+id,'PATCH',{...base,version:2,status:'home',arrival:'10:50'})).status,400,'home requires doctor seen');
const cancel=await call('appointments/'+id,'PATCH',{...base,version:2,status:'cancelled',arrival:'10:50'});assert.equal(cancel.status,200);
const second=await call('appointments','POST',draft('00002','11:00'));assert.equal(second.status,201);
assert.equal((await call('appointments/'+id,'PATCH',{...base,version:3})).status,409,'restore occupied slot');
const contenders=await Promise.all([call('appointments','POST',draft('00003','12:00')),call('appointments','POST',draft('00004','12:00'))]);assert.deepEqual(contenders.map(r=>r.status).sort(),[201,409]);
const failedHN=contenders[0].status===409?'00003':'00004';assert.equal((await call('patients?q='+failedHN)).data.patients.length,0,'patient insert rolled back with conflicting visit');
const settings=(await call('meta')).data.settings;assert.equal((await call('settings','PATCH',{...settings,capacity:2})).status,200);assert.equal((await call('appointments','POST',draft('00005','11:00'))).status,201);
const s2=(await call('meta')).data.settings;assert.equal((await call('settings','PATCH',{...s2,capacity:1})).status,409);
const searchQuery=await call('assistant','POST',{query:'Arrived before 11 and still waiting'});assert.equal(searchQuery.status,200);assert.equal(searchQuery.data.filters.timeTo,'10:59');
const patient=(await call('patients/'+first.data.patientId)).data;assert.equal(patient.history.length,1);assert.equal(patient.patient.hn,'00001');
roundTrips=0;const followup=await call('appointments','POST',{patientId:first.data.patientId,date:today,time:'13:30',followup:true,requestId:crypto.randomUUID()});assert.equal(followup.status,201);assert.equal(roundTrips,2,'existing-patient save uses two database round trips');
assert.equal((await call('assistant','POST',{query:'today',interpretation:{filters:{},clarification:''}})).status,400,'browser model output is no longer accepted');
assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM mutation_guards').first()).n,0,'transaction guards leave no records');
console.log('Backend integration passed (two database round trips per successful booking/edit): authentication, origin checks, durable read-back, HN identity, concurrent capacity, atomic rollback, idempotency, cancellation/restore, optimistic concurrency, event history, search filters and assistant.');
}finally{await mf.dispose()}
