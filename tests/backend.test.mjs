import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import postgres from 'postgres';
// Only a disposable local database is allowed. This test creates its own database.
const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl || !['localhost','127.0.0.1'].includes(new URL(testUrl).hostname)) throw new Error('Set TEST_DATABASE_URL to a disposable local Postgres instance (see docs/DEPLOYMENT.md).');
const admin=postgres(testUrl,{prepare:false,max:1,onnotice:()=>{}});
const testName='clinic_test_'+crypto.randomUUID().replaceAll('-','');
await admin.unsafe('CREATE DATABASE '+testName);
const url=new URL(testUrl);url.pathname='/'+testName;
const setup=postgres(url.toString(),{prepare:false,max:1,onnotice:()=>{}});
let connection;
try {
// Minimal Supabase auth schema. The hosted Auth service itself is not simulated here.
await setup.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY)');
for(const role of ['anon','authenticated']) if(!(await setup`SELECT 1 FROM pg_roles WHERE rolname=${role}`).length) await setup.unsafe('CREATE ROLE '+role);
await setup.unsafe(fs.readFileSync('supabase/migrations/001_clinic.sql','utf8'));
fs.mkdirSync('.test-runtime',{recursive:true});
for(const name of ['contracts','assistant','guards','service','postgres','authorization']) {
 const source=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");
 fs.writeFileSync('.test-runtime/'+name+'.mjs',source);
}
fs.writeFileSync('.test-runtime/db.mjs','let database; export function configure(d){database=d} export function db(){return database} export function runtime(){return {}}');
// Test identity injection lives only in this temporary compiled test module.
fs.writeFileSync('.test-runtime/auth.mjs',"let staff=null; export function setStaff(s){staff=s} export async function getStaff(){return staff}");
fs.writeFileSync('.test-runtime/route.mjs',ts.transpileModule(fs.readFileSync('app/api/v1/[...path]/route.ts','utf8').replace("e?.name||'Error'","e?.message||'Error'"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll("'@/lib/","'./").replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'"));
const {createDatabase}=await import('../.test-runtime/postgres.mjs');connection=createDatabase(url.toString());const database=connection.database;
const {configure}=await import('../.test-runtime/db.mjs');let batches=0;
configure({prepare:sql=>database.prepare(sql),batch:statements=>{batches++;return database.batch(statements)}});
const {POST,GET,PATCH}=await import('../.test-runtime/route.mjs');
const {clinicDate}=await import('../.test-runtime/contracts.mjs');const today=clinicDate();
const {setStaff}=await import('../.test-runtime/auth.mjs');
const {authorizedStaff}=await import('../.test-runtime/authorization.mjs');
const user={id:crypto.randomUUID(),email:'staff@example.test'};
assert.equal(await authorizedStaff(database,null),null);
assert.equal(await authorizedStaff(database,user),null,'unlisted auth users are denied');
await setup`INSERT INTO auth.users(id) VALUES(${user.id})`;
await database.prepare("INSERT INTO staff(user_id,role) VALUES(?,'admin')").bind(user.id).run();
const staff=await authorizedStaff(database,user);assert.equal(staff.role,'admin');
await database.prepare('UPDATE staff SET active=false WHERE user_id=?').bind(user.id).run();
assert.equal(await authorizedStaff(database,user),null,'staff access can be revoked');
await database.prepare('UPDATE staff SET active=true WHERE user_id=?').bind(user.id).run();
async function call(path,method='GET',body,headers={}) {
 const req=new Request('https://clinic.test/api/v1/'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
 const response=await ({GET,POST,PATCH}[method])(req);return {status:response.status,data:await response.json()};
}
assert.equal((await call('meta')).status,401);
assert.equal((await call('meta','GET',undefined,{'oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email})).status,401,'old identity headers cannot authenticate');
setStaff({...staff,role:'staff'});
assert.equal((await call('settings','PATCH',{})).status,403);
assert.equal((await call('examples','POST',{})).status,403);
setStaff(staff);
assert.equal((await call('appointments','POST',{}, {origin:'https://evil.test'})).status,403);
assert.equal((await call('meta')).status,200);
const draft=(hn,time)=>({patient:{hn,name:'Test '+hn,dob:'2000-01-01',sex:'Not specified'},date:today,time,requestId:crypto.randomUUID()});
const original=draft('00001','11:00');batches=0;const first=await call('appointments','POST',original);assert.equal(batches,2,'new-patient save uses two service batches');assert.equal(first.status,201,JSON.stringify(first));assert.equal(first.data.hn,'00001');const id=first.data.id;
assert.equal((await call('appointments','POST',original)).data.id,id,'Idempotent retry');
assert.equal((await call('appointments','POST',draft('00002','11:00'))).status,409,'full slot');
assert.equal((await call('appointments','POST',draft('00001','11:30'))).status,409,'duplicate HN');
const base={patientId:first.data.patientId,date:today,time:'11:00',arrival:null,service:'General',followup:false,tags:['General'],status:'booked',seen:false,remarks:'Wheelchair assistance',version:1,requestId:crypto.randomUUID()};
batches=0;const edit=await call('appointments/'+id,'PATCH',{...base,arrival:'10:50',status:'waiting'});assert.equal(edit.status,200,JSON.stringify(edit));assert.equal(batches,2,'visit update uses two service batches');
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
batches=0;const followup=await call('appointments','POST',{patientId:first.data.patientId,date:today,time:'13:30',followup:true,requestId:crypto.randomUUID()});assert.equal(followup.status,201);assert.equal(batches,2,'existing-patient save uses two service batches');
assert.equal((await call('assistant','POST',{query:'today',interpretation:{filters:{},clarification:''}})).status,400,'browser model output is no longer accepted');
assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM mutation_guards').first()).n,0,'transaction guards leave no records');

// JSON tags, case-insensitive matching and wildcard escaping survive the migration.
assert.equal((await call('appointments/search','POST',{filters:{casesAny:['general'],includeCancelled:true}})).data.total,1);
assert.equal((await call('patients?q=%25')).data.patients.length,0,'percent is a literal search character');
assert.equal((await call('appointments/search','POST',{filters:{text:"' OR 1=1 --",includeCancelled:true}})).data.total,0);
// Concurrent edits must produce one success and one conflict, with one audit event.
const beforePatient=(await call('patients/'+first.data.patientId)).data.patient;
const patientPatch={patient:{hn:beforePatient.hn,name:'Updated name',dob:beforePatient.dob,sex:beforePatient.sex},version:beforePatient.version};
const edits=await Promise.all([call('patients/'+beforePatient.id,'PATCH',patientPatch),call('patients/'+beforePatient.id,'PATCH',patientPatch)]);
assert.deepEqual(edits.map(x=>x.status).sort(),[200,409]);
assert.equal((await call('events?entityId='+beforePatient.id)).data.events.length,1);
// Same request ID submitted at once must resolve to one visit with no orphan patient.
const retryDraft=draft('RETRY','14:00');
const retries=await Promise.all([call('appointments','POST',retryDraft),call('appointments','POST',retryDraft)]);
assert(retries.every(x=>x.status===201),JSON.stringify(retries));assert.equal(retries[0].data.id,retries[1].data.id);
assert.equal((await call('events?entityId='+retries[0].data.id)).data.events.length,1);
// Separate connections emulate independent Vercel instances.
const secondConnection=createDatabase(url.toString());
try {
 const service=await import('../.test-runtime/service.mjs');
 const config=await service.settings(database);
 await service.saveSettings(database,{...config,capacity:1},user.id).catch(()=>{});
 // Current capacity is 2 because an existing slot is full. Three contenders -> two saves.
 const attempts=await Promise.allSettled([service.saveAppointment(database,draft('RACE1','15:00'),user.id),service.saveAppointment(secondConnection.database,draft('RACE2','15:00'),user.id),service.saveAppointment(database,draft('RACE3','15:00'),user.id)]);
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,2);
} finally {await secondConnection.close()}
// Browser roles cannot read the private schema, even with a valid Supabase token.
for(const role of ['anon','authenticated']) {
 await assert.rejects(setup.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE '+role);await tx.unsafe('SELECT * FROM clinic.patients')}),/permission denied/);
}
// Reopening the adapter still sees committed records.
const reopened=createDatabase(url.toString());
try {assert(await reopened.database.prepare('SELECT id FROM appointments WHERE id=?').bind(id).first())} finally {await reopened.close()}
console.log('Postgres integration passed: staff permissions, forged-header rejection, slot races across connections, rollback, retry safety, stale edits, history, filters, private-schema access and persistent read-back.');
} finally {
 if(connection)await connection.close();await setup.end();
 await admin.unsafe('DROP DATABASE '+testName+' WITH (FORCE)');await admin.end();
}
