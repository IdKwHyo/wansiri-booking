import {z} from 'zod';
import {filterSchema,assistantPrompt,llmSchema,clinicDate,addDays,type Filters} from './contracts';
export const interpretation=z.object({clarification:z.string().max(500),filters:filterSchema}).strict();
export type Interpretation={clarification:string;filters:Filters;engine:string};
export function parseSearch(query:string,today=clinicDate()):Interpretation{
 const original=query.toLowerCase().trim().replace(/[’‘]/g,"'");let rest=original;const f:Record<string,unknown>={dateFrom:today,dateTo:today};let recognized=false;
 const result=(clarification='')=>({clarification,filters:filterSchema.parse(f),engine:'Quick search'});
 const take=(pattern:RegExp)=>{const match=rest.match(pattern);if(match){rest=rest.replace(match[0],' ');recognized=true}return match};
 if(/\b(delete|cancel|move|reschedule|create|update|edit)\b|ยกเลิก|เลื่อนนัด|จองนัด/.test(original))return result('Use New booking or the patient’s actions menu to change a booking. This assistant searches records.');
 if(/(?:before|after|ก่อน|หลัง)\s*\d{4}-\d{2}-\d{2}/.test(original))return result('Please use a date range, for example “from 2026-09-01 to 2026-09-30”.');
 if(take(/\ball (?:dates|time|history)\b|previous visits|history|ทุกวัน|ประวัติ/)){delete f.dateFrom;delete f.dateTo}
 if(take(/tomorrow|พรุ่งนี้/))f.dateFrom=f.dateTo=addDays(today,1);else if(take(/yesterday|เมื่อวาน/))f.dateFrom=f.dateTo=addDays(today,-1);else take(/today(?:'s)?|วันนี้/);
 if(take(/this week|สัปดาห์นี้/)){const day=new Date(today+'T12:00:00Z').getUTCDay();f.dateFrom=addDays(today,-((day+6)%7));f.dateTo=addDays(f.dateFrom as string,6)}
 const dates=rest.match(/\d{4}-\d{2}-\d{2}/g);if(dates){if(dates.length>2)return result('Please give one date or a start and end date.');f.dateFrom=dates[0];f.dateTo=dates[1]||dates[0];rest=rest.replace(/\d{4}-\d{2}-\d{2}/g,' ');recognized=true}
 if(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|last week)\b/.test(rest))return result('Please give exact dates, for example 2026-10-01.');
 const hn=take(/\bhn\s*[:#]?\s*([a-z0-9][a-z0-9-]*)/i);if(hn)f.hn=hn[1];
 const caseList=take(/\b(?:cases?|tags?|services?)\s*[:=]\s*([a-z0-9 -]+?(?:\s+(?:or|and)\s+[a-z0-9 -]+?)*)(?=\s+(?:today|tomorrow|between|before|after|on|arrived|booked|with)\b|$)/)||take(/\b([a-z][a-z -]*?)\s+cases\s+(?:and|or)\s+([a-z][a-z -]*?)\s+cases\b/)||take(/\b([a-z][a-z -]*?)\s+cases\b/);
 if(caseList){const raw=caseList[2]?[caseList[1],caseList[2]]:caseList[1].split(/\s+(?:or|and)\s+|,/);f.casesAny=raw.map(s=>s.replace(/^(?:show|find|pull up|all)\s+/g,'').replace(/^all\s+/,'').trim()).filter(Boolean)}
 const notes=take(/\b(?:remarks?|notes?)\s+(?:mention(?:ing)?|contain(?:ing)?|with)\s+["“]([^"”]+)["”]/)||take(/\b(?:remarks?|notes?)\s+(?:mention(?:ing)?|contain(?:ing)?|with)\s+([a-z0-9-]+)\b/);if(notes)f.remarks=notes[1];
 if(take(/follow[ -]?ups?|ติดตาม|นัดติดตาม/))f.followup=true;
 if(take(/not (?:yet )?seen(?: by (?:the )?doctor)?|haven't (?:been )?seen(?: (?:the )?doctor)?|ยังไม่(?:ได้)?พบ(?:แพทย์)?/))f.seen=false;else if(take(/seen by (?:the )?doctor|พบแพทย์แล้ว/))f.seen=true;
 const statuses:string[]=[];if(take(/\bwaiting\b|รอตรวจ|รอพบ(?:แพทย์)?/))statuses.push('waiting');if(take(/ready to go home|ready for home|กลับบ้านได้/))statuses.push('home');if(take(/\bdiagnosed\b|ตรวจแล้ว/))statuses.push('diagnosed');if(take(/\bbooked\b/))statuses.push('booked');if(take(/\b(?:cancelled|canceled)\b/)){statuses.push('cancelled');f.includeCancelled=true}if(take(/\bno[ -]?shows?\b/))statuses.push('no_show');if(statuses.length)f.statuses=statuses;
 if(take(/not arrived|haven't arrived|ยังไม่มา/))f.arrived=false;else if(take(/\barrived\b|มาถึง/))f.arrived=true;
 const wait=take(/(?:over|more than|longer than)\s*(\d+)\s*(?:minutes?|min)\b/);if(wait)f.waitingMinutes=Number(wait[1]);
 function time(s:string,offset=0){const m=s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);if(!m)throw Error('Use a valid time');let h=Number(m[1]),min=Number(m[2]||0);if(m[3]){if(h<1||h>12)throw Error('Use a valid time');h=h%12+(m[3]==='pm'?12:0)}if(h>23||min>59)throw Error('Use a valid time');const total=h*60+min+offset;if(total<0||total>1439)throw Error('Time range falls outside this day');return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`}
 const t='(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)(?![\\d-])';const between=take(new RegExp('(?:between|from)\\s*'+t+'\\s*(?:and|to|–|-)\\s*'+t));const before=take(new RegExp('(?:before|ก่อน)\\s*'+t));const after=take(new RegExp('(?:after|หลัง)\\s*'+t));
 if(before||after||between){if(!/arriv|appointment|book|slot|มาถึง|นัด/.test(original))return result('Do you mean booking time or arrival time? Include “booking time” or “arrived” in your request.');f.timeField=/arriv|มาถึง/.test(original)?'arrival':'booking';if(before)f.timeTo=time(before[1],-1);if(after)f.timeFrom=time(after[1],1);if(between){f.timeFrom=time(between[1]);f.timeTo=time(between[2])}}
 if(/\bor\b/.test(rest))return result('Please split that OR request, or use case tags separated by “or”. Other filters combine with AND.');
 rest=rest.replace(/\b(?:show|find|pull up|all|patients?|appointments?|visits?|who|the|and|with|whose|have|has|is|are|still|their|me|please|on|from|to|between|booking|slot|time|arrival|for|at)\b/g,'').replace(/ผู้ป่วย|คนไข้|แสดง|ทั้งหมด|และ/g,'').replace(/[.,?!\s]/g,'');
 if(rest)return result('I couldn’t interpret every condition. Use the filters or try more specific wording. Try “today’s follow-ups not seen by doctor”.');
 if(!recognized&&!/^(all|show all|show patients|patients|appointments)$/.test(original))return result('Try “today’s follow-ups not seen by doctor”, “arrived before 10 and still waiting”, or “remarks mention wheelchair”.');
 return result();
}
export function modelConfig(env:Record<string,string|undefined>){
 if(env.LLM_BASE_URL&&env.LLM_MODEL)return {base:env.LLM_BASE_URL,model:env.LLM_MODEL,key:env.LLM_API_KEY,protocol:env.LLM_PROTOCOL||'openai'};
 if(env.GROQ_API_KEY)return {base:'https://api.groq.com/openai/v1',model:env.GROQ_MODEL||'openai/gpt-oss-20b',key:env.GROQ_API_KEY,protocol:'openai'};
 return null;
}
export async function serverInterpret(query:string,config:Record<string,string|undefined>):Promise<Interpretation>{
 const model=modelConfig(config);if(!model)return parseSearch(query);
 const base=new URL(model.base);if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1','host.docker.internal'].includes(base.hostname)))throw Error('Configured model endpoint must use HTTPS');
 const native=model.protocol==='ollama',groq=base.hostname==='api.groq.com'&&model.model.startsWith('openai/gpt-oss-');
 const url=model.base.replace(/\/$/,'')+(native?'/api/chat':'/chat/completions');
 // Strict schemas require every key. Null represents an unused filter on the wire.
 const strictSchema={...llmSchema,properties:{...llmSchema.properties,filters:{...llmSchema.properties.filters,required:Object.keys(llmSchema.properties.filters.properties),properties:Object.fromEntries(Object.entries(llmSchema.properties.filters.properties).map(([key,value])=>[key,{anyOf:[value,{type:'null'}]}]))}}};
 const messages=[{role:'system',content:assistantPrompt(clinicDate())+(groq?' For the strict response schema include every filter key; use null when a filter does not apply.':'')},{role:'user',content:query}];
 const payload=native?{model:model.model,messages,stream:false,format:llmSchema,options:{temperature:0},think:false}:{model:model.model,messages,stream:false,temperature:0,...(groq?{reasoning_effort:'low',max_completion_tokens:2048}:{max_tokens:900}),response_format:{type:'json_schema',json_schema:{name:'appointment_search',strict:groq,schema:groq?strictSchema:llmSchema}}};
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(model.key?{Authorization:`Bearer ${model.key}`}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(r.status===429)throw Error('The cloud assistant has reached its usage limit. Use Quick search or filters, or try again shortly.');
 if(!r.ok)throw Error('The cloud assistant is unavailable. Use Quick search or manual filters.');
 const response:any=await r.json(),choice=response.choices?.[0];if(!native&&choice?.finish_reason!=='stop')throw Error('The model did not finish its interpretation. Please narrow the request.');
 const raw=JSON.parse(native?response.message?.content:choice?.message?.content);
 if(groq&&raw?.filters&&typeof raw.filters==='object'&&!Array.isArray(raw.filters))raw.filters=Object.fromEntries(Object.entries(raw.filters).filter(([k,v])=>v!==null||!Object.hasOwn(llmSchema.properties.filters.properties,k)));
 const parsed=interpretation.parse(raw);return {...parsed,engine:groq?'Cloud assistant':model.model};
}
