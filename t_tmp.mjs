import { createClient } from '@supabase/supabase-js'
import { buildContentAccessResolver, auditConsentDecision, auditContentAccess } from './src/lib/admin/consent.server.ts'
const URL=process.env.SUPABASE_URL, SR=process.env.SUPABASE_SERVICE_ROLE_KEY
const admin=createClient(URL,SR,{auth:{persistSession:false}})
const IOL='7a517907-2473-47ec-97b7-d4289fbe1b7b', ADM='08d24695-a12c-4954-887a-81a71215a87e'
const TRACE='4e5ba2ed-a9de-44cd-b47e-77b50df9d0a6'
const show=async(label)=>{const r=await buildContentAccessResolver(admin,{userIds:[IOL],adminId:ADM});const d=r(IOL,TRACE);console.log(label,'=>',d.allowed?'VISÍVEL':'OCULTO',d.basis,d.expiresAt)}
await show('A) sem pedido        ')
// pedido (mesma escrita da server fn requestContentAccess)
const {data:c}=await admin.from('content_access_consents').insert({user_id:IOL,requested_by:ADM,scope:'conversation',resource_id:TRACE,reason:'Teste de fim-a-fim da privacidade de conteúdo.',status:'pending'}).select('id').single()
await admin.from('admin_audit_logs').insert({admin_user_id:ADM,action:'content.access_requested',target_user_id:IOL,resource_type:'assessor_reasoning_traces',resource_id:TRACE,reason:'Teste de fim-a-fim da privacidade de conteúdo.'})
await show('B) pedido pendente   ')
// consultor autoriza
await admin.from('content_access_consents').update({status:'approved',decided_at:new Date().toISOString()}).eq('id',c.id)
await auditConsentDecision(admin,{consentId:c.id,targetUserId:IOL,decision:'approved'})
const {data:af}=await admin.from('content_access_consents').select('expires_at').eq('id',c.id).single()
console.log('   expira em:',af.expires_at)
await show('C) autorizado        ')
await auditContentAccess(admin,{adminId:ADM,targetUserId:IOL,resourceId:TRACE,basis:'consent',consentId:c.id,reason:'Teste: abertura de conteúdo'})
// 2h+1min depois
await admin.from('content_access_consents').update({expires_at:new Date(Date.now()-60000).toISOString()}).eq('id',c.id)
await show('D) 2h+1min depois    ')
console.log('   estado após expirar:',(await admin.from('content_access_consents').select('status').eq('id',c.id).single()).data.status)
// nova autorização + revogação imediata
const {data:c2}=await admin.from('content_access_consents').insert({user_id:IOL,requested_by:ADM,scope:'conversation',resource_id:TRACE,reason:'Teste de revogação antes do fim das 2 horas.',status:'approved'}).select('id,expires_at').single()
await show('E) reautorizado      ')
await admin.from('content_access_consents').update({status:'revoked',decided_at:new Date().toISOString()}).eq('id',c2.id)
await auditConsentDecision(admin,{consentId:c2.id,targetUserId:IOL,decision:'revoked'})
await show('F) após revogar      ')
const {data:logs}=await admin.from('admin_audit_logs').select('created_at,action,resource_id').like('action','content%').order('created_at',{ascending:false}).limit(8)
console.log('\nAUDITORIA:'); for(const l of logs) console.log(' ',l.created_at,l.action)
await admin.from('content_access_consents').delete().in('id',[c.id,c2.id])
