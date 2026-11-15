-- S4-04 · índices, chaves estrangeiras e gatilhos
-- AFONSO V2 · pacote de instalação v1.0.2 · destino ÚNICO: AFONSO Staging.
-- Gerado por scripts/staging/build-staging-package-v102.ts a partir do estado final do esquema
-- (staging-install/rehearsal/results/schema_public.sql, sha256 e047c2e1fe0effb5…).
-- Só DDL aditivo: sem INSERT/UPDATE/DELETE, sem DROP, sem RENAME, sem DROP NOT NULL, sem instruções SET de sessão.
-- NÃO EXECUTAR na V1 (produção). Aplicar só com autorização, por ordem, um ficheiro por migração.
-- Sem chaves para auth.users fora de profiles.

CREATE INDEX access_invite_attempts_user_idx ON public.access_invite_attempts USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX access_invites_idem_uidx ON public.access_invites USING btree (issuer_user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE INDEX access_invites_issuer_idx ON public.access_invites USING btree (issuer_user_id, status);

CREATE INDEX access_invites_pilot_idx ON public.access_invites USING btree (pilot_key, status) WHERE (pilot_key IS NOT NULL);

CREATE INDEX admin_audit_logs_action_created_idx ON public.admin_audit_logs USING btree (action, created_at DESC);

CREATE INDEX admin_audit_logs_resource_type_idx ON public.admin_audit_logs USING btree (resource_type, created_at DESC);

CREATE INDEX admin_messages_consultor_estado_idx ON public.admin_messages USING btree (consultor_id, estado, janela_expira_em DESC);

CREATE INDEX announcement_dismissals_user_idx ON public.announcement_dismissals USING btree (user_id);

CREATE INDEX assessor_ai_logs_created_at_idx ON public.assessor_ai_logs USING btree (created_at DESC);

CREATE INDEX assessor_ai_logs_user_created_idx ON public.assessor_ai_logs USING btree (user_id, created_at DESC);

CREATE INDEX assessor_ai_logs_user_id_idx ON public.assessor_ai_logs USING btree (user_id);

CREATE INDEX assessor_messages_channel_created_idx ON public.assessor_messages USING btree (channel, created_at DESC);

CREATE INDEX assessor_messages_conversation_idx ON public.assessor_messages USING btree (user_id, channel, conversation_id, created_at DESC);

CREATE INDEX assessor_messages_deferred_lock_idx ON public.assessor_messages USING btree (created_at) WHERE (status = 'deferred_lock'::text);

CREATE INDEX assessor_messages_pending_action_idx ON public.assessor_messages USING btree (related_pending_action_id);

CREATE INDEX assessor_messages_retention_idx ON public.assessor_messages USING btree (channel, archived_at, created_at);

CREATE UNIQUE INDEX assessor_messages_wa_msg_id_uniq ON public.assessor_messages USING btree (whatsapp_message_id) WHERE (whatsapp_message_id IS NOT NULL);

CREATE UNIQUE INDEX assessor_nudges_dedupe_uidx ON public.assessor_nudges USING btree (user_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);

CREATE INDEX assessor_nudges_user_status_idx ON public.assessor_nudges USING btree (user_id, status, scheduled_for);

CREATE INDEX assessor_quality_scores_created_idx ON public.assessor_quality_scores USING btree (created_at DESC);

CREATE INDEX assessor_quality_scores_user_created_idx ON public.assessor_quality_scores USING btree (user_id, created_at DESC);

CREATE INDEX assessor_reasoning_traces_user_created_idx ON public.assessor_reasoning_traces USING btree (user_id, created_at DESC);

CREATE INDEX assessor_tool_calls_user_created_idx ON public.assessor_tool_calls USING btree (user_id, created_at DESC);

CREATE INDEX calendar_event_links_series_idx ON public.calendar_event_links USING btree (user_id, provider, series_master_id);

CREATE INDEX channel_links_user_channel_idx ON public.channel_links USING btree (user_id, channel);

CREATE INDEX conversation_states_user_channel_idx ON public.conversation_states USING btree (user_id, channel);

CREATE INDEX daily_digests_date_idx ON public.daily_digests USING btree (digest_date DESC);

CREATE INDEX daily_priorities_user_score_idx ON public.daily_priorities USING btree (user_id, priority_score DESC) WHERE ((dismissed_at IS NULL) AND (completed_at IS NULL));

CREATE UNIQUE INDEX daily_priorities_user_subject_uidx ON public.daily_priorities USING btree (user_id, subject_type, subject_id) WHERE ((subject_id IS NOT NULL) AND (dismissed_at IS NULL) AND (completed_at IS NULL));

CREATE INDEX deal_deadlines_opportunity_idx ON public.deal_deadlines USING btree (opportunity_id);

CREATE INDEX deal_deadlines_user_due_idx ON public.deal_deadlines USING btree (user_id, due_date);

CREATE INDEX email_drafts_person_idx ON public.email_drafts USING btree (user_id, person_id);

CREATE INDEX email_drafts_user_provider_idx ON public.email_drafts USING btree (user_id, provider);

CREATE INDEX email_drafts_user_recent_idx ON public.email_drafts USING btree (user_id, created_at DESC);

CREATE INDEX email_drafts_user_status_idx ON public.email_drafts USING btree (user_id, status);

CREATE INDEX email_messages_from_idx ON public.email_messages USING btree (user_id, from_email);

CREATE INDEX email_messages_thread_idx ON public.email_messages USING btree (thread_id, sent_at DESC);

CREATE UNIQUE INDEX email_messages_user_provider_msg_key ON public.email_messages USING btree (user_id, provider, provider_message_id);

CREATE INDEX email_threads_person_idx ON public.email_threads USING btree (person_id);

CREATE INDEX email_threads_user_last_msg_idx ON public.email_threads USING btree (user_id, last_message_at DESC);

CREATE INDEX entity_tags_lookup ON public.entity_tags USING btree (user_id, entity_type, entity_id);

CREATE INDEX entity_tags_user_id_idx ON public.entity_tags USING btree (user_id);

CREATE INDEX file_links_user_entity_idx ON public.file_links USING btree (user_id, entity_type, entity_id);

CREATE INDEX file_links_user_file_idx ON public.file_links USING btree (user_id, file_id);

CREATE INDEX file_links_user_id_idx ON public.file_links USING btree (user_id);

CREATE INDEX financial_movements_user_active_idx ON public.financial_movements USING btree (user_id) WHERE (archived_at IS NULL);

CREATE INDEX folder_items_lookup ON public.folder_items USING btree (user_id, entity_type, entity_id);

CREATE INDEX folder_items_user_id_idx ON public.folder_items USING btree (user_id);

CREATE UNIQUE INDEX folders_user_name_uniq ON public.folders USING btree (user_id, lower(name));

CREATE INDEX follow_ups_briefing_pending_idx ON public.follow_ups USING btree (due_date) WHERE ((briefing_sent_at IS NULL) AND (person_id IS NOT NULL));

CREATE INDEX follow_ups_due_idx ON public.follow_ups USING btree (user_id, due_date);

CREATE INDEX follow_ups_prospecting_idx ON public.follow_ups USING btree (related_prospecting_lead_id) WHERE (related_prospecting_lead_id IS NOT NULL);

CREATE INDEX follow_ups_related_property_id_idx ON public.follow_ups USING btree (related_property_id);

CREATE INDEX follow_ups_source_channel_idx ON public.follow_ups USING btree (source_channel) WHERE (source_channel IS NOT NULL);

CREATE INDEX follow_ups_source_message_id_idx ON public.follow_ups USING btree (source_message_id) WHERE (source_message_id IS NOT NULL);

CREATE UNIQUE INDEX follow_ups_source_pending_action_id_uidx ON public.follow_ups USING btree (source_pending_action_id) WHERE (source_pending_action_id IS NOT NULL);

CREATE INDEX follow_ups_user_active_idx ON public.follow_ups USING btree (user_id) WHERE (archived_at IS NULL);

CREATE INDEX follow_ups_user_idx ON public.follow_ups USING btree (user_id);

CREATE INDEX idx_abr_broadcast ON public.admin_broadcast_recipients USING btree (broadcast_id);

CREATE INDEX idx_cac_user_status ON public.content_access_consents USING btree (user_id, status);

CREATE INDEX idx_cal_links_user_provider ON public.calendar_event_links USING btree (user_id, provider);

CREATE INDEX idx_cal_log_user_created ON public.calendar_sync_log USING btree (user_id, created_at DESC);

CREATE INDEX idx_corrections_category ON public.assistant_user_corrections USING btree (category);

CREATE INDEX idx_corrections_user_created ON public.assistant_user_corrections USING btree (user_id, created_at DESC);

CREATE INDEX idx_dashboard_login_tokens_user ON public.dashboard_login_tokens USING btree (user_id);

CREATE INDEX idx_follow_ups_event_category ON public.follow_ups USING btree (user_id, event_category);

CREATE INDEX idx_follow_ups_event_category_id ON public.follow_ups USING btree (event_category_id);

CREATE INDEX idx_follow_ups_related_file_id ON public.follow_ups USING btree (related_file_id);

CREATE INDEX idx_golden_runs_golden ON public.assistant_golden_runs USING btree (golden_id, created_at DESC);

CREATE INDEX idx_golden_runs_release ON public.assistant_golden_runs USING btree (release_ref);

CREATE INDEX idx_opportunities_source_lead_id ON public.opportunities USING btree (source_lead_id) WHERE (source_lead_id IS NOT NULL);

CREATE INDEX idx_profiles_stripe_customer ON public.profiles USING btree (stripe_customer_id);

CREATE INDEX idx_profiles_stripe_subscription ON public.profiles USING btree (stripe_subscription_id);

CREATE INDEX idx_reflections_created ON public.assistant_reflections USING btree (created_at DESC);

CREATE INDEX idx_shadow_created ON public.assistant_shadow_runs USING btree (created_at DESC);

CREATE INDEX idx_shadow_strategy ON public.assistant_shadow_runs USING btree (strategy);

CREATE INDEX idx_similar_listing_cache ON public.similar_listing_searches USING btree (user_id, cache_key, created_at DESC);

CREATE INDEX idx_similar_listing_daily ON public.similar_listing_searches USING btree (user_id, created_at DESC);

CREATE INDEX idx_stripe_events_profile ON public.stripe_webhook_events USING btree (profile_id, processed_at DESC);

CREATE INDEX idx_telegram_link_tokens_user ON public.telegram_link_tokens USING btree (user_id);

CREATE INDEX idx_trust_created ON public.assistant_trust_scores USING btree (created_at DESC);

CREATE INDEX idx_trust_user ON public.assistant_trust_scores USING btree (user_id, created_at DESC);

CREATE INDEX inbound_message_claims_claimed_at_idx ON public.inbound_message_claims USING btree (claimed_at);

CREATE INDEX interactions_property_idx ON public.interactions USING btree (property_id);

CREATE INDEX interactions_user_active_idx ON public.interactions USING btree (user_id) WHERE (archived_at IS NULL);

CREATE INDEX interactions_user_confidential_idx ON public.interactions USING btree (user_id, is_confidential);

CREATE INDEX interactions_user_idx ON public.interactions USING btree (user_id);

CREATE UNIQUE INDEX invite_send_attempts_open_uniq ON public.invite_send_attempts USING btree (user_id, canal) WHERE (status = 'pendente'::text);

CREATE INDEX invite_send_attempts_status_idx ON public.invite_send_attempts USING btree (status, last_attempt_at DESC);

CREATE INDEX landing_page_visits_date_idx ON public.landing_page_visits USING btree (visit_date);

CREATE INDEX mentor_decisions_user_key_idx ON public.mentor_decisions USING btree (user_id, tip_key, created_at DESC);

CREATE INDEX messages_user_idx ON public.assessor_messages USING btree (user_id, created_at);

CREATE INDEX miscellaneous_items_item_class_idx ON public.miscellaneous_items USING btree (user_id, item_class, created_at DESC);

CREATE INDEX miscellaneous_items_team_suggestion_idx ON public.miscellaneous_items USING btree (created_at DESC) WHERE ((category ~~* 'sugest%'::text) OR (title ~~* 'sugest%'::text));

CREATE INDEX miscellaneous_items_user_active_idx ON public.miscellaneous_items USING btree (user_id) WHERE (archived_at IS NULL);

CREATE INDEX miscellaneous_items_user_created_idx ON public.miscellaneous_items USING btree (user_id, created_at DESC);

CREATE INDEX movements_user_idx ON public.financial_movements USING btree (user_id);

CREATE INDEX opportunities_user_archived_idx ON public.opportunities USING btree (user_id, archived_at);

CREATE INDEX opportunities_user_idx ON public.opportunities USING btree (user_id);

CREATE INDEX opportunities_user_stage_idx ON public.opportunities USING btree (user_id, stage);

CREATE INDEX opportunity_events_opp_idx ON public.opportunity_events USING btree (opportunity_id, occurred_at DESC);

CREATE INDEX opportunity_properties_opp_idx ON public.opportunity_properties USING btree (opportunity_id);

CREATE INDEX opportunity_properties_prop_idx ON public.opportunity_properties USING btree (user_id, property_id);

CREATE INDEX pending_actions_expires_at_idx ON public.pending_actions USING btree (expires_at);

CREATE INDEX pending_actions_user_channel_status_idx ON public.pending_actions USING btree (user_id, channel, status, created_at DESC);

CREATE INDEX pending_actions_user_status_created_idx ON public.pending_actions USING btree (user_id, status, created_at DESC);

CREATE INDEX people_name_norm_idx ON public.people USING btree (name_norm text_pattern_ops);

CREATE INDEX people_user_active_idx ON public.people USING btree (user_id) WHERE (archived_at IS NULL);

CREATE INDEX people_user_email_norm_idx ON public.people USING btree (user_id, email_normalized);

CREATE INDEX people_user_idx ON public.people USING btree (user_id);

CREATE INDEX people_user_name_idx ON public.people USING btree (user_id, lower(name));

CREATE INDEX person_phones_person_idx ON public.person_phones USING btree (person_id);

CREATE UNIQUE INDEX person_phones_user_e164_idx ON public.person_phones USING btree (user_id, e164) WHERE (e164 IS NOT NULL);

CREATE INDEX person_phones_user_id_idx ON public.person_phones USING btree (user_id);

CREATE INDEX pilot_invite_deliveries_provider_msg_idx ON public.pilot_invite_deliveries USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);

CREATE INDEX product_feedback_attachment_idx ON public.product_feedback USING btree (attachment_file_id) WHERE (attachment_file_id IS NOT NULL);

CREATE INDEX product_feedback_status_idx ON public.product_feedback USING btree (status, created_at DESC);

CREATE INDEX product_feedback_user_idx ON public.product_feedback USING btree (user_id, created_at DESC);

CREATE INDEX product_telemetry_events_lead_idx ON public.product_telemetry_events USING btree (lead_id);

CREATE INDEX product_telemetry_events_user_event_idx ON public.product_telemetry_events USING btree (user_id, event, occurred_at DESC);

CREATE INDEX product_updates_released_idx ON public.product_updates USING btree (released_on DESC);

CREATE UNIQUE INDEX profiles_phone_linked_unique ON public.profiles USING btree (phone) WHERE (whatsapp_link_status = 'linked'::text);

CREATE INDEX promo_redemptions_user_status_idx ON public.promo_redemptions USING btree (user_id, status, created_at DESC);

CREATE INDEX properties_category_id_idx ON public.properties USING btree (category_id);

CREATE INDEX properties_search_norm_idx ON public.properties USING btree (search_norm text_pattern_ops);

CREATE INDEX properties_user_active_idx ON public.properties USING btree (user_id) WHERE (archived_at IS NULL);

CREATE INDEX properties_user_city_idx ON public.properties USING btree (user_id, city);

CREATE INDEX properties_user_idx ON public.properties USING btree (user_id);

CREATE INDEX properties_user_typology_idx ON public.properties USING btree (user_id, typology);

CREATE INDEX property_interests_prop_idx ON public.property_interests USING btree (property_id);

CREATE INDEX property_marketing_prop_idx ON public.property_marketing_activities USING btree (property_id);

CREATE INDEX property_offers_prop_idx ON public.property_offers USING btree (property_id);

CREATE INDEX prospecting_leads_user_phone_idx ON public.prospecting_leads USING btree (user_id, phone);

CREATE INDEX prospecting_leads_user_status_idx ON public.prospecting_leads USING btree (user_id, status, created_at DESC);

CREATE UNIQUE INDEX reminders_active_unique ON public.reminders USING btree (user_id, related_resource_type, related_resource_id) WHERE ((status = ANY (ARRAY['scheduled'::text, 'processing'::text])) AND (related_resource_id IS NOT NULL));

CREATE INDEX reminders_due_idx ON public.reminders USING btree (status, scheduled_for) WHERE (status = ANY (ARRAY['scheduled'::text, 'processing'::text]));

CREATE INDEX reminders_follow_up_id_idx ON public.reminders USING btree (follow_up_id);

CREATE UNIQUE INDEX reminders_idempotency ON public.reminders USING btree (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE INDEX routines_user_next_idx ON public.routines USING btree (user_id, active, next_run_at);

CREATE UNIQUE INDEX short_links_user_target_idx ON public.short_links USING btree (user_id, target_path);

CREATE INDEX subscription_events_created_idx ON public.subscription_events USING btree (created_at DESC);

CREATE INDEX subscription_events_user_idx ON public.subscription_events USING btree (user_id, created_at DESC);

CREATE INDEX support_sessions_admin_idx ON public.support_sessions USING btree (admin_user_id, started_at DESC);

CREATE INDEX support_sessions_open_idx ON public.support_sessions USING btree (target_user_id) WHERE (ended_at IS NULL);

CREATE UNIQUE INDEX tags_user_name_uniq ON public.tags USING btree (user_id, lower(name));

CREATE INDEX uploaded_files_custom_category_id_idx ON public.uploaded_files USING btree (custom_category_id);

CREATE INDEX uploaded_files_doc_group_idx ON public.uploaded_files USING btree (user_id, doc_group_id) WHERE (doc_group_id IS NOT NULL);

CREATE INDEX uploaded_files_duplicate_of_idx ON public.uploaded_files USING btree (duplicate_of) WHERE (duplicate_of IS NOT NULL);

CREATE INDEX uploaded_files_expiry_idx ON public.uploaded_files USING btree (user_id, doc_expires_on) WHERE ((doc_expires_on IS NOT NULL) AND (deleted_at IS NULL));

CREATE INDEX uploaded_files_opportunity_idx ON public.uploaded_files USING btree (user_id, opportunity_id);

CREATE INDEX uploaded_files_related_idx ON public.uploaded_files USING btree (related_resource_type, related_resource_id);

CREATE INDEX uploaded_files_status_idx ON public.uploaded_files USING btree (processing_status);

CREATE INDEX uploaded_files_user_checksum_idx ON public.uploaded_files USING btree (user_id, checksum) WHERE (checksum IS NOT NULL);

CREATE INDEX uploaded_files_user_created_idx ON public.uploaded_files USING btree (user_id, created_at DESC);

CREATE INDEX uploaded_files_user_status_idx ON public.uploaded_files USING btree (user_id, processing_status) WHERE (deleted_at IS NULL);

CREATE INDEX uploaded_files_user_system_category_idx ON public.uploaded_files USING btree (user_id, system_category) WHERE (system_category IS NOT NULL);

CREATE INDEX whatsapp_link_codes_hash_idx ON public.whatsapp_link_codes USING btree (code_hash) WHERE (used_at IS NULL);

CREATE INDEX whatsapp_link_codes_phone_active_idx ON public.whatsapp_link_codes USING btree (phone) WHERE (used_at IS NULL);

CREATE INDEX whatsapp_link_codes_user_active_idx ON public.whatsapp_link_codes USING btree (user_id, created_at DESC);

CREATE INDEX whatsapp_send_logs_created_idx ON public.whatsapp_send_logs USING btree (created_at DESC);

CREATE INDEX whatsapp_send_logs_message_id_idx ON public.whatsapp_send_logs USING btree (message_id) WHERE (message_id IS NOT NULL);

CREATE INDEX whatsapp_send_logs_template_idx ON public.whatsapp_send_logs USING btree (created_at DESC) WHERE (template_name IS NOT NULL);

CREATE UNIQUE INDEX whatsapp_template_rates_unique_idx ON public.whatsapp_template_rates USING btree (category, country_code, effective_from);

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_pilot_key_fkey FOREIGN KEY (pilot_key) REFERENCES public.pilots(key);

ALTER TABLE ONLY public.admin_broadcast_recipients
    ADD CONSTRAINT admin_broadcast_recipients_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.admin_broadcasts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.admin_messages
    ADD CONSTRAINT admin_messages_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.admin_messages
    ADD CONSTRAINT admin_messages_consultor_id_fkey FOREIGN KEY (consultor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.dashboard_announcements(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.assessor_messages
    ADD CONSTRAINT assessor_messages_related_pending_action_id_fkey FOREIGN KEY (related_pending_action_id) REFERENCES public.pending_actions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.assessor_quality_scores
    ADD CONSTRAINT assessor_quality_scores_trace_id_fkey FOREIGN KEY (trace_id) REFERENCES public.assessor_reasoning_traces(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.assistant_golden_runs
    ADD CONSTRAINT assistant_golden_runs_golden_id_fkey FOREIGN KEY (golden_id) REFERENCES public.assistant_golden_conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.assistant_reflections
    ADD CONSTRAINT assistant_reflections_correction_id_fkey FOREIGN KEY (correction_id) REFERENCES public.assistant_user_corrections(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.assistant_reflections
    ADD CONSTRAINT assistant_reflections_trace_id_fkey FOREIGN KEY (trace_id) REFERENCES public.assessor_reasoning_traces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.assistant_shadow_runs
    ADD CONSTRAINT assistant_shadow_runs_trace_id_fkey FOREIGN KEY (trace_id) REFERENCES public.assessor_reasoning_traces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.assistant_trust_scores
    ADD CONSTRAINT assistant_trust_scores_trace_id_fkey FOREIGN KEY (trace_id) REFERENCES public.assessor_reasoning_traces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.assistant_user_corrections
    ADD CONSTRAINT assistant_user_corrections_turn_id_fkey FOREIGN KEY (turn_id) REFERENCES public.assessor_reasoning_traces(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.calendar_event_links
    ADD CONSTRAINT calendar_event_links_follow_up_id_fkey FOREIGN KEY (follow_up_id) REFERENCES public.follow_ups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_active_person_id_fkey FOREIGN KEY (active_person_id) REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_last_property_id_fkey FOREIGN KEY (last_property_id) REFERENCES public.properties(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_pending_action_id_fkey FOREIGN KEY (pending_action_id) REFERENCES public.pending_actions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.daily_digests
    ADD CONSTRAINT daily_digests_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.admin_broadcasts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.deal_deadlines
    ADD CONSTRAINT deal_deadlines_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feature_flag_users
    ADD CONSTRAINT feature_flag_users_flag_key_fkey FOREIGN KEY (flag_key) REFERENCES public.feature_flags(key) ON DELETE CASCADE;

ALTER TABLE ONLY public.file_links
    ADD CONSTRAINT file_links_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.uploaded_files(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.financial_movements
    ADD CONSTRAINT financial_movements_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.financial_movements
    ADD CONSTRAINT financial_movements_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.folder_items
    ADD CONSTRAINT folder_items_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_event_category_id_fkey FOREIGN KEY (event_category_id) REFERENCES public.event_categories(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_related_file_id_fkey FOREIGN KEY (related_file_id) REFERENCES public.uploaded_files(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_related_property_id_fkey FOREIGN KEY (related_property_id) REFERENCES public.properties(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_related_prospecting_lead_id_fkey FOREIGN KEY (related_prospecting_lead_id) REFERENCES public.prospecting_leads(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.invite_send_attempts
    ADD CONSTRAINT invite_send_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.miscellaneous_items
    ADD CONSTRAINT miscellaneous_items_related_opportunity_id_fkey FOREIGN KEY (related_opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.miscellaneous_items
    ADD CONSTRAINT miscellaneous_items_related_person_id_fkey FOREIGN KEY (related_person_id) REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.miscellaneous_items
    ADD CONSTRAINT miscellaneous_items_related_property_id_fkey FOREIGN KEY (related_property_id) REFERENCES public.properties(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_source_lead_id_fkey FOREIGN KEY (source_lead_id) REFERENCES public.prospecting_leads(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.opportunity_events
    ADD CONSTRAINT opportunity_events_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.opportunity_properties
    ADD CONSTRAINT opportunity_properties_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.opportunity_properties
    ADD CONSTRAINT opportunity_properties_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_referred_by_person_id_fkey FOREIGN KEY (referred_by_person_id) REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.person_phones
    ADD CONSTRAINT person_phones_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.pilot_invite_deliveries
    ADD CONSTRAINT pilot_invite_deliveries_pilot_key_fkey FOREIGN KEY (pilot_key) REFERENCES public.pilots(key);

ALTER TABLE ONLY public.pilot_participants
    ADD CONSTRAINT pilot_participants_pilot_key_fkey FOREIGN KEY (pilot_key) REFERENCES public.pilots(key);

ALTER TABLE ONLY public.product_feedback
    ADD CONSTRAINT product_feedback_attachment_file_id_fkey FOREIGN KEY (attachment_file_id) REFERENCES public.uploaded_files(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_code_id_fkey FOREIGN KEY (code_id) REFERENCES public.promo_codes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.property_categories(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_owner_person_fk FOREIGN KEY (owner_person_id) REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.property_interests
    ADD CONSTRAINT property_interests_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.property_interests
    ADD CONSTRAINT property_interests_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.property_interests
    ADD CONSTRAINT property_interests_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.property_marketing_activities
    ADD CONSTRAINT property_marketing_activities_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.property_marketing_activities
    ADD CONSTRAINT property_marketing_activities_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.property_offers
    ADD CONSTRAINT property_offers_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.property_offers
    ADD CONSTRAINT property_offers_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.property_offers
    ADD CONSTRAINT property_offers_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.prospecting_leads
    ADD CONSTRAINT prospecting_leads_image_file_id_fkey FOREIGN KEY (image_file_id) REFERENCES public.uploaded_files(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.prospecting_leads
    ADD CONSTRAINT prospecting_leads_related_person_id_fkey FOREIGN KEY (related_person_id) REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.prospecting_leads
    ADD CONSTRAINT prospecting_leads_related_property_id_fkey FOREIGN KEY (related_property_id) REFERENCES public.properties(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_follow_up_id_fkey FOREIGN KEY (follow_up_id) REFERENCES public.follow_ups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_custom_category_id_fkey FOREIGN KEY (custom_category_id) REFERENCES public.file_categories(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_duplicate_of_fkey FOREIGN KEY (duplicate_of) REFERENCES public.uploaded_files(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_related_pending_action_id_fkey FOREIGN KEY (related_pending_action_id) REFERENCES public.pending_actions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.assessor_messages(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.whatsapp_proactive_tests
    ADD CONSTRAINT whatsapp_proactive_tests_send_log_id_fkey FOREIGN KEY (send_log_id) REFERENCES public.whatsapp_send_logs(id) ON DELETE SET NULL;

CREATE TRIGGER access_invites_pilot_guard BEFORE INSERT OR UPDATE ON public.access_invites FOR EACH ROW EXECUTE FUNCTION public.access_invites_pilot_guard();

CREATE TRIGGER access_invites_pilot_participant AFTER UPDATE OF status ON public.access_invites FOR EACH ROW EXECUTE FUNCTION public.pilot_participant_on_invite_used();

CREATE TRIGGER alert_mutes_set_updated_at BEFORE UPDATE ON public.alert_mutes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER app_user_connections_set_updated_at BEFORE UPDATE ON public.app_user_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER assessor_nudges_set_updated_at BEFORE UPDATE ON public.assessor_nudges FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.admin_cost_settings FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.ai_model_rates FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.app_user_connection_aliases FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.app_user_connections FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.calendar_connections FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.dashboard_login_tokens FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.support_sessions FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.telegram_link_tokens FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.whatsapp_link_codes FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.whatsapp_template_rates FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();

CREATE TRIGGER autonomy_rules_set_updated_at BEFORE UPDATE ON public.autonomy_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER cal_links_set_updated_at BEFORE UPDATE ON public.calendar_event_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER cal_sync_state_set_updated_at BEFORE UPDATE ON public.calendar_sync_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER calendar_connections_touch BEFORE UPDATE ON public.calendar_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER consultant_preferences_set_updated_at BEFORE UPDATE ON public.consultant_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER consultant_preferences_track_opt_ins BEFORE INSERT OR UPDATE ON public.consultant_preferences FOR EACH ROW EXECUTE FUNCTION public.consultant_preferences_track_opt_ins();

CREATE TRIGGER conversation_states_biu BEFORE INSERT OR UPDATE ON public.conversation_states FOR EACH ROW EXECUTE FUNCTION public.conversation_states_touch();

CREATE TRIGGER daily_digests_biu BEFORE INSERT OR UPDATE ON public.daily_digests FOR EACH ROW EXECUTE FUNCTION public.daily_digests_validate();

CREATE TRIGGER daily_priorities_set_updated_at BEFORE UPDATE ON public.daily_priorities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER dashboard_announcements_touch BEFORE UPDATE ON public.dashboard_announcements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER deal_deadlines_set_updated_at BEFORE UPDATE ON public.deal_deadlines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER email_connections_touch BEFORE UPDATE ON public.email_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER email_drafts_touch BEFORE UPDATE ON public.email_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER email_drafts_validate_trg BEFORE INSERT OR UPDATE ON public.email_drafts FOR EACH ROW EXECUTE FUNCTION public.email_drafts_validate();

CREATE TRIGGER email_messages_touch BEFORE UPDATE ON public.email_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER email_threads_touch BEFORE UPDATE ON public.email_threads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER event_categories_touch BEFORE UPDATE ON public.event_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER file_categories_touch BEFORE UPDATE ON public.file_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER folders_touch BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER follow_ups_set_updated_at BEFORE UPDATE ON public.follow_ups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER invite_send_attempts_touch BEFORE UPDATE ON public.invite_send_attempts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER miscellaneous_items_set_updated_at BEFORE UPDATE ON public.miscellaneous_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER movements_set_updated_at BEFORE UPDATE ON public.financial_movements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER opportunities_set_updated_at BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER pending_actions_biu BEFORE INSERT OR UPDATE ON public.pending_actions FOR EACH ROW EXECUTE FUNCTION public.pending_actions_validate();

CREATE TRIGGER people_email_norm_trg BEFORE INSERT OR UPDATE OF email ON public.people FOR EACH ROW EXECUTE FUNCTION public.people_touch_email_norm();

CREATE TRIGGER people_set_updated_at BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER pilot_invite_deliveries_set_updated_at BEFORE UPDATE ON public.pilot_invite_deliveries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER pilot_participants_guard BEFORE INSERT OR UPDATE ON public.pilot_participants FOR EACH ROW EXECUTE FUNCTION public.pilot_participants_guard();

CREATE TRIGGER product_feedback_biu BEFORE INSERT OR UPDATE ON public.product_feedback FOR EACH ROW EXECUTE FUNCTION public.product_feedback_validate();

CREATE TRIGGER product_updates_touch BEFORE UPDATE ON public.product_updates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER product_updates_validate_trg BEFORE INSERT OR UPDATE ON public.product_updates FOR EACH ROW EXECUTE FUNCTION public.product_updates_validate();

CREATE TRIGGER profiles_account_access_new AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.account_access_on_new_profile();

CREATE TRIGGER profiles_restrict_self_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_restrict_self_update();

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER profiles_validate_billing BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_validate_billing();

CREATE TRIGGER promo_codes_touch BEFORE UPDATE ON public.promo_codes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER promo_redemptions_touch BEFORE UPDATE ON public.promo_redemptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER properties_set_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER property_categories_touch BEFORE UPDATE ON public.property_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER property_interests_touch BEFORE UPDATE ON public.property_interests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER property_marketing_touch BEFORE UPDATE ON public.property_marketing_activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER property_offers_touch BEFORE UPDATE ON public.property_offers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER prospecting_leads_set_updated_at BEFORE UPDATE ON public.prospecting_leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER reminders_sync_follow_up_id_trg BEFORE INSERT OR UPDATE OF related_resource_type, related_resource_id ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.reminders_sync_follow_up_id();

CREATE TRIGGER reminders_touch_updated_at BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER routines_set_updated_at BEFORE UPDATE ON public.routines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER subscription_events_validate_trg BEFORE INSERT OR UPDATE ON public.subscription_events FOR EACH ROW EXECUTE FUNCTION public.subscription_events_validate();

CREATE TRIGGER tags_touch BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_cac_validate BEFORE INSERT OR UPDATE ON public.content_access_consents FOR EACH ROW EXECUTE FUNCTION public.content_access_consents_validate();

CREATE TRIGGER trg_corrections_updated BEFORE UPDATE ON public.assistant_user_corrections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_golden_updated BEFORE UPDATE ON public.assistant_golden_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_plan_configs_validate BEFORE INSERT OR UPDATE ON public.plan_configs FOR EACH ROW EXECUTE FUNCTION public.plan_configs_validate();

CREATE TRIGGER uploaded_files_set_updated_at BEFORE UPDATE ON public.uploaded_files FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER whatsapp_proactive_tests_touch BEFORE UPDATE ON public.whatsapp_proactive_tests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER whatsapp_template_bindings_touch BEFORE UPDATE ON public.whatsapp_template_bindings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER whatsapp_template_rates_touch BEFORE UPDATE ON public.whatsapp_template_rates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
