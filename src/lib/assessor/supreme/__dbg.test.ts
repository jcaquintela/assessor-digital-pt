import { it } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { isFollowUpOpen, isFollowUpEvent } from "@/lib/follow-ups/state";
import { belongsInDailyAgenda } from "@/lib/assessor/agenda-leisure";
import { isPreEventDue } from "@/lib/assessor/supreme/pre-event";
const USER="u";
const ev:any={id:"ev1",user_id:USER,title:"Reunião de equipa",type:"reuniao",status:"Pendente",outcome:null,archived_at:null,person_id:null,event_class:"interno",due_date:"2026-09-03T00:00:00Z",due_time:"14:00"};
it("dbg", async () => {
  const sb:any = makeFakeSupabase({ follow_ups:[ev] });
  const now=new Date("2026-09-03T12:00:00.000Z");
  const r = await sb.from("follow_ups").select("*").eq("user_id",USER)
    .gte("due_date", new Date(now.getTime()-26*3600_000).toISOString())
    .lte("due_date", new Date(now.getTime()+26*3600_000).toISOString()).limit(100);
  console.log("rows", r.data?.length, isFollowUpEvent(ev), isFollowUpOpen(ev), belongsInDailyAgenda(ev), isPreEventDue(ev, now.getTime()));
});
