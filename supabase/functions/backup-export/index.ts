import { createClient } from 'npm:@supabase/supabase-js@2.110.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.25.76';
import { EXCLUDED_TABLES, GLOBAL_TABLES, STORAGE_BUCKETS, assertKnownTable, normalizeLimit } from './scope-map.ts';

const Body=z.object({action:z.enum(['init','companies','page','accounts','storage','storage-url','finish','history']),scope:z.enum(['company','all']).optional(),company_id:z.string().uuid().nullable().optional(),table:z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),cursor:z.object({created_at:z.string().nullable(),key:z.string()}).nullable().optional(),limit:z.number().optional(),page:z.number().int().positive().optional(),bucket:z.enum(STORAGE_BUCKETS).optional(),path:z.string().max(1024).optional(),audit_id:z.string().uuid().optional(),counts:z.record(z.number()).optional(),verification:z.record(z.unknown()).optional(),warnings:z.array(z.string()).optional(),status:z.enum(['completed','failed']).optional(),duration_ms:z.number().int().nonnegative().optional(),error_message:z.string().max(500).optional()});
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
function safeUser(u:any){return {id:u.id,email:u.email??null,phone:u.phone??null,created_at:u.created_at??null,last_sign_in_at:u.last_sign_in_at??null,email_confirmed_at:u.email_confirmed_at??null,banned_until:u.banned_until??null,user_metadata:u.user_metadata??{},app_metadata:u.app_metadata??{}}}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST') return json({error:'Método não permitido'},405);
 const auth=req.headers.get('Authorization'); if(!auth?.startsWith('Bearer ')) return json({error:'Não autenticado'},401);
 const url=Deno.env.get('SUPABASE_URL'); const anon=Deno.env.get('SUPABASE_ANON_KEY'); const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service) return json({error:'Serviço indisponível'},503);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const {data:ud,error:ue}=await userClient.auth.getUser(); if(ue||!ud.user) return json({error:'Sessão inválida'},401);
 const [{data:isAdmin},{data:isGestor},{data:isApproved},{data:ownCompany}]=await Promise.all([userClient.rpc('is_admin'),userClient.rpc('is_gestor'),userClient.rpc('is_approved'),userClient.rpc('current_user_company_id')]);
 if(!isApproved||(!isAdmin&&!isGestor)) return json({error:'Acesso negado'},403);
 let raw:unknown; try{raw=await req.json()}catch{return json({error:'JSON inválido'},400)}
 const parsed=Body.safeParse(raw); if(!parsed.success) return json({error:'Parâmetros inválidos'},400);
 const b=parsed.data; const requestedAll=b.scope==='all'; const scopeType=isAdmin&&requestedAll?'all':'company'; const companyId=scopeType==='all'?null:(isGestor?ownCompany:(b.company_id??ownCompany));
 if(scopeType==='company'&&!companyId) return json({error:'Empresa não identificada'},400);
 const svc=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:tableMeta,error:te}=await svc.rpc('backup_list_public_tables'); if(te) throw te;
  const tables=(tableMeta??[]).map((x:any)=>String(x.table_name));
  if(b.action==='companies'){
   if(!isAdmin)return json({rows:[]});const {data,error}=await svc.from('profiles').select('company_id').not('company_id','is',null);if(error)throw error;const ids=[...new Set((data??[]).map((p:any)=>String(p.company_id)))];return json({rows:ids.map(id=>({id,name:id}))});
  }
  if(b.action==='init'){
   const role=isAdmin?'admin':'gestor'; const {data:audit,error:ae}=await svc.from('backup_audit_log').insert({requested_by:ud.user.id,requester_email:ud.user.email??null,requester_role:role,scope_type:scopeType,company_id:companyId,status:'running'}).select('id').single(); if(ae) throw ae;
   const eligible=tables.filter((t:string)=>!EXCLUDED_TABLES.has(t)&&!(scopeType==='company'&&GLOBAL_TABLES.has(t)));
   let companies:{id:string;name:string}[]=[];
   if(isAdmin){const {data:ps}=await svc.from('profiles').select('company_id').not('company_id','is',null);const ids=[...new Set((ps??[]).map((p:any)=>String(p.company_id)))];companies=ids.map(id=>({id,name:id}));}
   return json({audit_id:audit.id,exported_by:{id:ud.user.id,email:ud.user.email??null,role},scope:{type:scopeType,company_id:companyId},tables:eligible,global_tables_skipped:scopeType==='company'?[...GLOBAL_TABLES].filter(t=>tables.includes(t)):[],companies,integration_note:'Credenciais permanecem cifradas e dependem da chave de cifra do servidor.'});
  }
  if(b.action==='page'){
   const table=b.table??''; assertKnownTable(table,tables); if(scopeType==='company'&&GLOBAL_TABLES.has(table)) return json({rows:[],next_cursor:null,count:0,global_skipped:true});
   const args={p_table:table,p_company_id:companyId,p_cursor_created:b.cursor?.created_at??null,p_cursor_key:b.cursor?.key??null,p_limit:normalizeLimit(b.limit)};
   const {data,error}=await svc.rpc('backup_export_page',args);if(error)throw error;
   let count:number|null=null;if(!b.cursor){const {data:exact,error:ce}=await svc.rpc('backup_export_count',{p_table:table,p_company_id:companyId});if(ce)throw ce;count=Number(exact??0)}
   return json({...data,count});
  }
  if(b.action==='accounts'){
   const perPage=normalizeLimit(b.limit); const pg=b.page??1; const {data,error}=await svc.auth.admin.listUsers({page:pg,perPage}); if(error)throw error;
   let users=data.users; if(companyId){const {data:profiles,error:pe}=await svc.from('profiles').select('user_id').eq('company_id',companyId);if(pe)throw pe;const ids=new Set((profiles??[]).map((p:any)=>p.user_id));users=users.filter(u=>ids.has(u.id));}
   return json({rows:users.map(safeUser),has_more:data.users.length===perPage});
  }
  if(b.action==='storage'){
   if(!b.bucket) return json({buckets:STORAGE_BUCKETS}); const path=b.path??''; const {data,error}=await svc.storage.from(b.bucket).list(path,{limit:normalizeLimit(b.limit),offset:((b.page??1)-1)*normalizeLimit(b.limit),sortBy:{column:'name',order:'asc'}});if(error)throw error;
   const objects=(data??[]).map((o:any)=>({bucket:b.bucket,path:path?`${path}/${o.name}`:o.name,size:Number(o.metadata?.size??0),content_type:o.metadata?.mimetype??null,updated_at:o.updated_at??null,is_folder:!o.metadata})); return json({rows:objects,has_more:objects.length===normalizeLimit(b.limit)});
  }
  if(b.action==='storage-url'){
   if(!b.bucket||!b.path||b.path.includes('..'))return json({error:'Arquivo inválido'},400);const {data,error}=await svc.storage.from(b.bucket).createSignedUrl(b.path,120);if(error)throw error;return json({signed_url:data.signedUrl});
  }
  if(b.action==='finish'){
   if(!b.audit_id)return json({error:'Auditoria ausente'},400); const patch={status:b.status??'completed',counts:b.counts??{},verification:b.verification??{},warnings:b.warnings??[],duration_ms:b.duration_ms??null,error_message:b.error_message??null,completed_at:new Date().toISOString()};const {error}=await svc.from('backup_audit_log').update(patch).eq('id',b.audit_id).eq('requested_by',ud.user.id);if(error)throw error;return json({ok:true});
  }
  if(b.action==='history'){
   if(!isAdmin)return json({rows:[]});const {data,error}=await svc.from('backup_audit_log').select('*').order('created_at',{ascending:false}).limit(10);if(error)throw error;return json({rows:data??[]});
  }
  return json({error:'Ação inválida'},400);
 }catch(e){console.error('[backup-export]',e instanceof Error?e.message:'erro');return json({error:e instanceof Error?e.message:'Falha na exportação'},500)}
});
