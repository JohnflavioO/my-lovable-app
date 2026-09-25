import { supabase } from '@/integrations/supabase/client';
export type BackupCursor={created_at:string|null;key:string}|null;
export type BackupInit={audit_id:string;exported_by:{id:string;email:string|null;role:string};scope:{type:'company'|'all';company_id:string|null};tables:string[];global_tables_skipped:string[];integration_note:string};
export async function functionErrorMessage(error:unknown){
 const fallback=error instanceof Error?error.message:'Falha ao acessar o serviço de backup';
 if(typeof error!=='object'||!error||!('context' in error))return fallback;
 const context=(error as {context?:unknown}).context;
 if(!context||typeof context!=='object')return fallback;
 try{
  if('json' in context&&typeof context.json==='function'){
   const value=await context.json();
   if(value&&typeof value==='object'&&'error' in value&&typeof value.error==='string')return value.error;
  }
  if('text' in context&&typeof context.text==='function'){
   const text=await context.text();
   if(!text)return fallback;
   try{const value=JSON.parse(text);return typeof value?.error==='string'?value.error:text}catch{return text}
  }
 }catch{return fallback}
 return fallback;
}
export async function backupCall<T>(body:Record<string,unknown>):Promise<T>{const functionName=body.action==='restore'?'backup-restore':'backup-export';const {data,error}=await supabase.functions.invoke(functionName,{body});if(error)throw new Error(await functionErrorMessage(error));if(data?.error)throw new Error(data.error);return data as T}
export async function fetchTable(table:string,scope:'company'|'all',companyId:string|null,onCount?:(n:number)=>void){const rows:Record<string,unknown>[]=[];let cursor:BackupCursor=null;let expected=-1;do{const page=await backupCall<{rows:Record<string,unknown>[];next_cursor:BackupCursor;count:number|null}>({action:'page',scope,company_id:companyId,table,cursor,limit:500});if(typeof page.count==='number')expected=page.count;rows.push(...page.rows);cursor=page.next_cursor;onCount?.(rows.length);if(page.rows.length<500)cursor=null}while(cursor);if(rows.length!==expected)throw new Error(`${table}: exportado ${rows.length}, esperado ${expected}`);return rows}
export async function sha256(content:string|ArrayBuffer){const bytes=typeof content==='string'?new TextEncoder().encode(content):content;const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function safeEmail(email:string|null,id:string){return (email||id).replace(/[^a-zA-Z0-9@._-]/g,'_')}
