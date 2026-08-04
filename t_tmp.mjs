import { createClient } from '@supabase/supabase-js'
const URL=process.env.SUPABASE_URL, SR=process.env.SUPABASE_SERVICE_ROLE_KEY, PK=process.env.SUPABASE_PUBLISHABLE_KEY, TOK=process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN
const admin=createClient(URL,SR,{auth:{persistSession:false}})
const IOL='7a517907-2473-47ec-97b7-d4289fbe1b7b'
const {data:tr}=await admin.from('assessor_reasoning_traces').select('id,input_content,created_at').eq('user_id',IOL).order('created_at',{ascending:false}).limit(1)
const trace=tr?.[0]; console.log('TRACE', trace?.id, JSON.stringify(String(trace?.input_content).slice(0,60)))

// PONTO 1: chamada direta à API como admin autenticado (sem passar pela página)
const r=await fetch(`${URL}/rest/v1/assessor_reasoning_traces?select=id,input_content&user_id=eq.${IOL}&limit=3`,{headers:{apikey:PK,Authorization:`Bearer ${TOK}`}})
console.log('PONTO1 direct API status',r.status,'body',(await r.text()).slice(0,200))

// preparar: quem sou eu (admin)
const {data:me}=await admin.from('user_roles').select('user_id,role').in('role',['super_admin'])
console.log('admins',me)
console.log('TRACE_ID='+trace?.id)
