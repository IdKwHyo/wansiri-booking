import assert from 'node:assert/strict';
import {parseSearch,serverInterpret,modelConfig} from '../.test-runtime/assistant.mjs';
import {filterSchema} from '../.test-runtime/contracts.mjs';
const today='2026-09-23';
for(const [q,expected] of [["Today’s follow-ups not seen by doctor",{followup:true,seen:false}],["Arrived before 10 and still waiting",{timeField:'arrival',timeTo:'09:59',arrived:true,statuses:['waiting']}],["Remarks mention wheelchair",{remarks:'wheelchair'}],["HN DEMO-001 all dates",{hn:'demo-001'}],["show X cases and Y cases today",{casesAny:['x','y']}]]){const result=parseSearch(q,today);assert.equal(result.clarification,'',q);for(const [key,value] of Object.entries(expected))assert.deepEqual(result.filters[key],value,q)}
for(const q of ['appointments before 2026-10-01','HN DEMO-001 male patients','cases: General today arrived after 10 with diabetes','วันนี้ผู้ป่วยหญิงอายุเกิน60','show age over 60 today','waiting or not seen today','delete all patients'])assert.ok(parseSearch(q,today).clarification,q);
assert.throws(()=>filterSchema.parse({sql:'DROP TABLE patients'}));
assert.throws(()=>filterSchema.parse({dateFrom:'2026-02-30'}));
assert.throws(()=>filterSchema.parse({dateFrom:'2026-10-01',dateTo:'2026-09-01'}));
console.log('Assistant tests passed: filters, negation, ambiguity, ignored conditions and invalid schema.');

assert.equal(modelConfig({}),null);
assert.equal(modelConfig({GROQ_API_KEY:'test-key'}).model,'openai/gpt-oss-20b');
const originalFetch=globalThis.fetch;let responseBody={choices:[{finish_reason:'stop',message:{content:JSON.stringify({clarification:'',filters:{seen:false,followup:true,dateFrom:null}})}}]};let responseStatus=200;
globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');const body=JSON.parse(options.body);assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.reasoning_effort,'low');assert.equal(body.messages.length,2);assert.equal(options.headers.Authorization,'Bearer test-key');return Response.json(responseBody,{status:responseStatus})};
try{const result=await serverInterpret('Follow-ups not seen',{GROQ_API_KEY:'test-key'});assert.equal(result.filters.seen,false);assert.equal(result.filters.followup,true);assert.equal(result.filters.dateFrom,undefined);assert.equal(result.engine,'Cloud assistant');
 responseBody.choices[0].message.content=JSON.stringify({clarification:'',filters:{sql:null}});await assert.rejects(()=>serverInterpret('anything',{GROQ_API_KEY:'test-key'}));
 responseStatus=429;await assert.rejects(()=>serverInterpret('today',{GROQ_API_KEY:'test-key'}),/usage limit/);
}finally{globalThis.fetch=originalFetch}
console.log('Hosted assistant contract passed: Groq request, strict schema, null handling, forbidden keys and quota errors. No live provider request made.');
