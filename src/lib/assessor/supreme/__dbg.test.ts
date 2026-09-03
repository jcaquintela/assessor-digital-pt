import { it } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { generateSupremeNudges } from "@/lib/assessor/supreme/briefing.server";
const USER="22222222-2222-4222-8222-222222222222";
it("dbg", async () => {
  const sb:any = makeFakeSupabase({
    consultant_preferences:[{user_id:USER,morning_briefing_enabled:false,evening_wrap_enabled:false,quiet_hours_start:"23:59",quiet_hours_end:"23:58",max_daily_nudges:6}],
    assessor_nudges:[],
    follow_ups:[{id:"ev1",user_id:USER,title:"Reunião de equipa",type:"reuniao",status:"Pendente",outcome:null,archived_at:null,person_id:null,event_class:"interno",due_date:"2026-09-03T00:00:00Z",due_time:"14:00"}],
    people:[],
  });
  console.log(await generateSupremeNudges(sb, USER, new Date("2026-09-03T12:00:00.000Z")));
});
