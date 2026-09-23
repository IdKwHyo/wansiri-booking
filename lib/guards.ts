import type {Database,Statement} from './database';
// These checks run inside the same Postgres transaction as the write.
// Named CHECK constraints abort the whole batch, including patient/audit inserts.
export function appointmentGuard(db:Database,eventId:string,a:{date:string;time:string;status:string;version?:number},id=''){
 const unchanged=`EXISTS(SELECT 1 FROM appointments old WHERE old.id=p.id AND old.date=p.date AND old.time=p.time AND old.status NOT IN ('cancelled','no_show'))`;
 const skip=`p.status IN ('cancelled','no_show') OR ${unchanged}`;
 return db.prepare(`WITH proposed(date,time,status,id,version) AS (VALUES(?,?,?,?,?::integer))
 INSERT INTO mutation_guards(id,slot_ok,hours_ok)
 SELECT ?,CASE WHEN ${skip} THEN true ELSE
 (SELECT COUNT(*) FROM appointments a WHERE a.date=p.date AND a.time=p.time AND a.id!=p.id AND a.status NOT IN ('cancelled','no_show')) < COALESCE((SELECT capacity FROM clinic_settings WHERE id=1),1) END,
 CASE WHEN ${skip} THEN true ELSE p.time>=COALESCE((SELECT open FROM clinic_settings WHERE id=1),'10:00') AND p.time<COALESCE((SELECT close FROM clinic_settings WHERE id=1),'16:00') AND substr(p.time,4,2) IN ('00','30') END
 FROM proposed p WHERE p.id='' OR EXISTS(SELECT 1 FROM appointments a WHERE a.id=p.id AND a.version=p.version)`)
 .bind(a.date,a.time,a.status,id,a.version||0,eventId);
}

export function settingsGuard(db:Database,eventId:string,s:{open:string;close:string;capacity:number;version:number},today:string){
 return db.prepare(`INSERT INTO mutation_guards(id,settings_ok)
 SELECT ?,NOT EXISTS(SELECT COUNT(*) FROM appointments WHERE status NOT IN ('cancelled','no_show') GROUP BY date,time HAVING COUNT(*)>?)
 AND NOT EXISTS(SELECT 1 FROM appointments WHERE status NOT IN ('cancelled','no_show') AND date>=? AND (time<? OR time>=?))
 WHERE EXISTS(SELECT 1 FROM clinic_settings WHERE id=1 AND version=?)`)
 .bind(eventId,s.capacity,today,s.open,s.close,s.version);
}

export function clearGuard(db:Database,eventId:string){return db.prepare('DELETE FROM mutation_guards WHERE id=?').bind(eventId)}
