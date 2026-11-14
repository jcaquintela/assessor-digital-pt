<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Proactive delivery: the unsolicited-per-day cap and priority ranking live only in `src/lib/assessor/proactive/daily-cap.ts` and are applied inside `dispatchPendingNudges`; generators may over-produce candidates. Why: one place decides what reaches the consultant, so limits can't drift between generators.
- Commercial opportunities reach the channel through `generateOpportunityDrafts` (flag `assessor.opportunity_nudges.v1`, off = legacy aggregated digest) and store `priority` + `evidence` on `assessor_nudges`. Why: auditable evidence and a one-row kill switch.
