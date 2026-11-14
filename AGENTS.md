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
- Shared WhatsApp+Telegram conversation (flag `assessor.cross_channel.v1`, per-account via `feature_flag_users`): pending/state/history scope is resolved only through `src/lib/assessor/cross-channel/scope.server.ts` (`scopeChannels`, `stateKey`, `applyChannelScope`); new code touching `pending_actions`/`conversation_states` by channel must use these helpers, rows keep their origin `channel`, and the dashboard never joins the shared scope. Why: one switch turns sharing on/off with no data migration, and flag-off queries stay byte-identical to the per-channel behaviour.
- In shared mode a blind answer ("sim"/"não") may only resolve pendings presented in the answering channel (`presented_channels`), and confirmation is fenced by `claim_pending_confirmation`/`release_pending_confirmation` inside an account-wide turn lock (`lockChannel = "account"`). Why: a confirmation in the other channel executes at most once and never lands on a question the consultant isn't seeing.
