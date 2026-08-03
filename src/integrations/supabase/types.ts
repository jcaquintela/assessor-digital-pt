export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          resource_id: string | null
          resource_type: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          resource_id?: string | null
          resource_type?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          resource_id?: string | null
          resource_type?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_broadcast_recipients: {
        Row: {
          attempted_at: string
          broadcast_id: string
          created_at: string
          email: string | null
          error: string | null
          id: string
          status: string
          user_id: string | null
        }
        Insert: {
          attempted_at?: string
          broadcast_id: string
          created_at?: string
          email?: string | null
          error?: string | null
          id?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          attempted_at?: string
          broadcast_id?: string
          created_at?: string
          email?: string | null
          error?: string | null
          id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "admin_broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_broadcasts: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          recipients_count: number
          segment: string
          status: string
          subject: string | null
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          recipients_count?: number
          segment?: string
          status?: string
          subject?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          recipients_count?: number
          segment?: string
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      admin_mfa_required: {
        Row: {
          required_at: string
          required_by: string | null
          user_id: string
        }
        Insert: {
          required_at?: string
          required_by?: string | null
          user_id: string
        }
        Update: {
          required_at?: string
          required_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      app_user_connection_aliases: {
        Row: {
          app_user_id: string
          connector_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          app_user_id: string
          connector_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          app_user_id?: string
          connector_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assessor_ai_logs: {
        Row: {
          channel: string
          confidence: number | null
          created_at: string
          domain: string | null
          error: string | null
          estimated_cost_usd: number | null
          fallback_used: boolean | null
          id: string
          input_tokens: number | null
          intent: string | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          route: string | null
          success: boolean
          tool_name: string | null
          tool_success: boolean | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          channel: string
          confidence?: number | null
          created_at?: string
          domain?: string | null
          error?: string | null
          estimated_cost_usd?: number | null
          fallback_used?: boolean | null
          id?: string
          input_tokens?: number | null
          intent?: string | null
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          route?: string | null
          success?: boolean
          tool_name?: string | null
          tool_success?: boolean | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          confidence?: number | null
          created_at?: string
          domain?: string | null
          error?: string | null
          estimated_cost_usd?: number | null
          fallback_used?: boolean | null
          id?: string
          input_tokens?: number | null
          intent?: string | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          route?: string | null
          success?: boolean
          tool_name?: string | null
          tool_success?: boolean | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      assessor_messages: {
        Row: {
          archived_at: string | null
          channel: string
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          message_type: string | null
          related_pending_action_id: string | null
          related_resource_id: string | null
          related_resource_type: string | null
          role: string
          sender_phone: string | null
          status: string | null
          structured_payload: Json | null
          user_id: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          archived_at?: string | null
          channel?: string
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_type?: string | null
          related_pending_action_id?: string | null
          related_resource_id?: string | null
          related_resource_type?: string | null
          role: string
          sender_phone?: string | null
          status?: string | null
          structured_payload?: Json | null
          user_id?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          archived_at?: string | null
          channel?: string
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_type?: string | null
          related_pending_action_id?: string | null
          related_resource_id?: string | null
          related_resource_type?: string | null
          role?: string
          sender_phone?: string | null
          status?: string | null
          structured_payload?: Json | null
          user_id?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessor_messages_related_pending_action_id_fkey"
            columns: ["related_pending_action_id"]
            isOneToOne: false
            referencedRelation: "pending_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessor_nudges: {
        Row: {
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          outcome: string | null
          outcome_at: string | null
          reason: string
          scheduled_for: string
          sent_at: string | null
          status: string
          subject_id: string | null
          subject_type: string | null
          suggested_reply: string
          updated_at: string
          urgency: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          outcome?: string | null
          outcome_at?: string | null
          reason: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          suggested_reply: string
          updated_at?: string
          urgency?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          outcome?: string | null
          outcome_at?: string | null
          reason?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          suggested_reply?: string
          updated_at?: string
          urgency?: string
          user_id?: string
        }
        Relationships: []
      }
      assessor_quality_scores: {
        Row: {
          channel: string
          created_at: string
          executed_successfully: boolean | null
          human_tone: boolean | null
          id: string
          notes: string | null
          reformulated: boolean | null
          score: number | null
          trace_id: string | null
          understood_first_try: boolean | null
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          executed_successfully?: boolean | null
          human_tone?: boolean | null
          id?: string
          notes?: string | null
          reformulated?: boolean | null
          score?: number | null
          trace_id?: string | null
          understood_first_try?: boolean | null
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          executed_successfully?: boolean | null
          human_tone?: boolean | null
          id?: string
          notes?: string | null
          reformulated?: boolean | null
          score?: number | null
          trace_id?: string | null
          understood_first_try?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessor_quality_scores_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "assessor_reasoning_traces"
            referencedColumns: ["id"]
          },
        ]
      }
      assessor_reasoning_traces: {
        Row: {
          channel: string
          created_at: string
          decide_latency_ms: number | null
          decision: Json
          error: string | null
          hypotheses: Json
          id: string
          input_content: string
          input_tokens: number | null
          memory_writes: Json
          observations: Json
          output_tokens: number | null
          reply: string | null
          searches: Json
          source_message_id: string | null
          success: boolean
          think_latency_ms: number | null
          tool_calls: Json
          total_latency_ms: number | null
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          decide_latency_ms?: number | null
          decision?: Json
          error?: string | null
          hypotheses?: Json
          id?: string
          input_content: string
          input_tokens?: number | null
          memory_writes?: Json
          observations?: Json
          output_tokens?: number | null
          reply?: string | null
          searches?: Json
          source_message_id?: string | null
          success?: boolean
          think_latency_ms?: number | null
          tool_calls?: Json
          total_latency_ms?: number | null
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          decide_latency_ms?: number | null
          decision?: Json
          error?: string | null
          hypotheses?: Json
          id?: string
          input_content?: string
          input_tokens?: number | null
          memory_writes?: Json
          observations?: Json
          output_tokens?: number | null
          reply?: string | null
          searches?: Json
          source_message_id?: string | null
          success?: boolean
          think_latency_ms?: number | null
          tool_calls?: Json
          total_latency_ms?: number | null
          user_id?: string
        }
        Relationships: []
      }
      assessor_tool_calls: {
        Row: {
          arguments: Json
          channel: string
          created_at: string
          error: string | null
          id: string
          latency_ms: number | null
          result: Json | null
          success: boolean
          tool_name: string
          turn_id: string | null
          user_id: string | null
        }
        Insert: {
          arguments?: Json
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          result?: Json | null
          success: boolean
          tool_name: string
          turn_id?: string | null
          user_id?: string | null
        }
        Update: {
          arguments?: Json
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          result?: Json | null
          success?: boolean
          tool_name?: string
          turn_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      assistant_golden_conversations: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          slug: string
          tags: string[]
          title: string
          turns: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          slug: string
          tags?: string[]
          title: string
          turns?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          slug?: string
          tags?: string[]
          title?: string
          turns?: Json
          updated_at?: string
        }
        Relationships: []
      }
      assistant_golden_runs: {
        Row: {
          aqs: number | null
          ats: number | null
          created_at: string
          diffs: Json
          golden_id: string
          id: string
          passed: boolean
          release_ref: string
          task_success: number | null
        }
        Insert: {
          aqs?: number | null
          ats?: number | null
          created_at?: string
          diffs?: Json
          golden_id: string
          id?: string
          passed: boolean
          release_ref: string
          task_success?: number | null
        }
        Update: {
          aqs?: number | null
          ats?: number | null
          created_at?: string
          diffs?: Json
          golden_id?: string
          id?: string
          passed?: boolean
          release_ref?: string
          task_success?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_golden_runs_golden_id_fkey"
            columns: ["golden_id"]
            isOneToOne: false
            referencedRelation: "assistant_golden_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_reflections: {
        Row: {
          analysis: Json
          correction_id: string | null
          created_at: string
          id: string
          model: string | null
          trace_id: string | null
          trigger: Database["public"]["Enums"]["assistant_reflection_trigger"]
          user_id: string | null
        }
        Insert: {
          analysis?: Json
          correction_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          trace_id?: string | null
          trigger: Database["public"]["Enums"]["assistant_reflection_trigger"]
          user_id?: string | null
        }
        Update: {
          analysis?: Json
          correction_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          trace_id?: string | null
          trigger?: Database["public"]["Enums"]["assistant_reflection_trigger"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_reflections_correction_id_fkey"
            columns: ["correction_id"]
            isOneToOne: false
            referencedRelation: "assistant_user_corrections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_reflections_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "assessor_reasoning_traces"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_shadow_runs: {
        Row: {
          aqs: number | null
          ats: number | null
          channel: string
          created_at: string
          diff: Json
          id: string
          latency_ms: number | null
          reply: string | null
          strategy: string
          task_success: number | null
          trace_id: string | null
          user_id: string | null
        }
        Insert: {
          aqs?: number | null
          ats?: number | null
          channel: string
          created_at?: string
          diff?: Json
          id?: string
          latency_ms?: number | null
          reply?: string | null
          strategy: string
          task_success?: number | null
          trace_id?: string | null
          user_id?: string | null
        }
        Update: {
          aqs?: number | null
          ats?: number | null
          channel?: string
          created_at?: string
          diff?: Json
          id?: string
          latency_ms?: number | null
          reply?: string | null
          strategy?: string
          task_success?: number | null
          trace_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_shadow_runs_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "assessor_reasoning_traces"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_trust_scores: {
        Row: {
          aqs_score: number | null
          ats: number | null
          channel: string
          context_preservation: number | null
          corrections_count: number
          created_at: string
          id: string
          notes: string | null
          safe_decisions: number | null
          task_success: number | null
          trace_id: string | null
          user_id: string
        }
        Insert: {
          aqs_score?: number | null
          ats?: number | null
          channel: string
          context_preservation?: number | null
          corrections_count?: number
          created_at?: string
          id?: string
          notes?: string | null
          safe_decisions?: number | null
          task_success?: number | null
          trace_id?: string | null
          user_id: string
        }
        Update: {
          aqs_score?: number | null
          ats?: number | null
          channel?: string
          context_preservation?: number | null
          corrections_count?: number
          created_at?: string
          id?: string
          notes?: string | null
          safe_decisions?: number | null
          task_success?: number | null
          trace_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_trust_scores_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "assessor_reasoning_traces"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_user_corrections: {
        Row: {
          category: Database["public"]["Enums"]["assistant_correction_category"]
          channel: string
          conversation_id: string | null
          correction_message: string
          created_at: string
          final_result: string | null
          id: string
          original_message: string | null
          resolved: boolean
          turn_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["assistant_correction_category"]
          channel: string
          conversation_id?: string | null
          correction_message: string
          created_at?: string
          final_result?: string | null
          id?: string
          original_message?: string | null
          resolved?: boolean
          turn_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["assistant_correction_category"]
          channel?: string
          conversation_id?: string | null
          correction_message?: string
          created_at?: string
          final_result?: string | null
          id?: string
          original_message?: string | null
          resolved?: boolean
          turn_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_user_corrections_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "assessor_reasoning_traces"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomy_rules: {
        Row: {
          action_type: string
          created_at: string
          requires_confirmation: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          requires_confirmation?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          requires_confirmation?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_connections: {
        Row: {
          connected_at: string
          created_at: string
          display_name: string | null
          external_account_id: string | null
          id: string
          is_primary: boolean
          last_sync_at: string | null
          provider: string
          refresh_token_encrypted: string | null
          scopes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          created_at?: string
          display_name?: string | null
          external_account_id?: string | null
          id?: string
          is_primary?: boolean
          last_sync_at?: string | null
          provider: string
          refresh_token_encrypted?: string | null
          scopes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          created_at?: string
          display_name?: string | null
          external_account_id?: string | null
          id?: string
          is_primary?: boolean
          last_sync_at?: string | null
          provider?: string
          refresh_token_encrypted?: string | null
          scopes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_event_links: {
        Row: {
          created_at: string
          deleted: boolean
          external_calendar_id: string | null
          external_event_id: string
          external_updated_at: string | null
          follow_up_id: string
          id: string
          last_origin: string | null
          last_synced_at: string
          local_updated_at: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted?: boolean
          external_calendar_id?: string | null
          external_event_id: string
          external_updated_at?: string | null
          follow_up_id: string
          id?: string
          last_origin?: string | null
          last_synced_at?: string
          local_updated_at?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted?: boolean
          external_calendar_id?: string | null
          external_event_id?: string
          external_updated_at?: string | null
          follow_up_id?: string
          id?: string
          last_origin?: string | null
          last_synced_at?: string
          local_updated_at?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_links_follow_up_id_fkey"
            columns: ["follow_up_id"]
            isOneToOne: false
            referencedRelation: "follow_ups"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_log: {
        Row: {
          action: string
          created_at: string
          detail: string | null
          direction: string
          external_event_id: string | null
          follow_up_id: string | null
          id: string
          origin: string
          provider: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: string | null
          direction: string
          external_event_id?: string | null
          follow_up_id?: string | null
          id?: string
          origin: string
          provider: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: string | null
          direction?: string
          external_event_id?: string | null
          follow_up_id?: string | null
          id?: string
          origin?: string
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_sync_state: {
        Row: {
          calendar_id: string | null
          created_at: string
          delta_link: string | null
          enabled: boolean
          id: string
          last_error: string | null
          last_polled_at: string | null
          provider: string
          sync_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_id?: string | null
          created_at?: string
          delta_link?: string | null
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_polled_at?: string | null
          provider: string
          sync_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_id?: string | null
          created_at?: string
          delta_link?: string | null
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_polled_at?: string | null
          provider?: string
          sync_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      channel_links: {
        Row: {
          channel: string
          created_at: string
          display_name: string | null
          external_id: string
          id: string
          linked_at: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          display_name?: string | null
          external_id: string
          id?: string
          linked_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          display_name?: string | null
          external_id?: string
          id?: string
          linked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      consultant_preferences: {
        Row: {
          autonomy_level: string
          created_at: string
          evening_checkin_enabled: boolean
          evening_checkin_time: string
          evening_time: string
          evening_wrap_enabled: boolean
          max_daily_nudges: number
          morning_briefing_enabled: boolean
          morning_days: number[]
          morning_time: string
          primary_channel: string
          proactive_push_enabled: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          autonomy_level?: string
          created_at?: string
          evening_checkin_enabled?: boolean
          evening_checkin_time?: string
          evening_time?: string
          evening_wrap_enabled?: boolean
          max_daily_nudges?: number
          morning_briefing_enabled?: boolean
          morning_days?: number[]
          morning_time?: string
          primary_channel?: string
          proactive_push_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          autonomy_level?: string
          created_at?: string
          evening_checkin_enabled?: boolean
          evening_checkin_time?: string
          evening_time?: string
          evening_wrap_enabled?: boolean
          max_daily_nudges?: number
          morning_briefing_enabled?: boolean
          morning_days?: number[]
          morning_time?: string
          primary_channel?: string
          proactive_push_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_access_consents: {
        Row: {
          created_at: string
          decided_at: string | null
          expires_at: string | null
          id: string
          reason: string
          requested_by: string
          resource_id: string | null
          scope: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          expires_at?: string | null
          id?: string
          reason: string
          requested_by: string
          resource_id?: string | null
          scope?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          expires_at?: string | null
          id?: string
          reason?: string
          requested_by?: string
          resource_id?: string | null
          scope?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_locks: {
        Row: {
          channel: string
          created_at: string
          holder: string | null
          locked_until: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          holder?: string | null
          locked_until: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          holder?: string | null
          locked_until?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_states: {
        Row: {
          active_person_id: string | null
          active_topic: string | null
          channel: string
          created_at: string
          expires_at: string | null
          external_conversation_id: string
          factual_summary: string | null
          goal: string | null
          id: string
          last_created_resource_id: string | null
          last_created_resource_type: string | null
          last_entity_id: string | null
          last_entity_type: string | null
          last_intent: string | null
          last_property_id: string | null
          pending_action_id: string | null
          sparring_turns: number
          state_summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_person_id?: string | null
          active_topic?: string | null
          channel: string
          created_at?: string
          expires_at?: string | null
          external_conversation_id?: string
          factual_summary?: string | null
          goal?: string | null
          id?: string
          last_created_resource_id?: string | null
          last_created_resource_type?: string | null
          last_entity_id?: string | null
          last_entity_type?: string | null
          last_intent?: string | null
          last_property_id?: string | null
          pending_action_id?: string | null
          sparring_turns?: number
          state_summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_person_id?: string | null
          active_topic?: string | null
          channel?: string
          created_at?: string
          expires_at?: string | null
          external_conversation_id?: string
          factual_summary?: string | null
          goal?: string | null
          id?: string
          last_created_resource_id?: string | null
          last_created_resource_type?: string | null
          last_entity_id?: string | null
          last_entity_type?: string | null
          last_intent?: string | null
          last_property_id?: string | null
          pending_action_id?: string | null
          sparring_turns?: number
          state_summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_states_active_person_id_fkey"
            columns: ["active_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_states_last_property_id_fkey"
            columns: ["last_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_states_pending_action_id_fkey"
            columns: ["pending_action_id"]
            isOneToOne: false
            referencedRelation: "pending_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_priorities: {
        Row: {
          action: string
          calculated_at: string
          completed_at: string | null
          created_at: string
          dismissed_at: string | null
          due_at: string | null
          id: string
          priority_score: number
          reasons: string[]
          subject_id: string | null
          subject_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          calculated_at?: string
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          due_at?: string | null
          id?: string
          priority_score?: number
          reasons?: string[]
          subject_id?: string | null
          subject_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          calculated_at?: string
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          due_at?: string | null
          id?: string
          priority_score?: number
          reasons?: string[]
          subject_id?: string | null
          subject_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dashboard_announcements: {
        Row: {
          active: boolean
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          segment: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          segment?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          segment?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      dashboard_login_tokens: {
        Row: {
          channel: string
          created_at: string
          expires_at: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          expires_at: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          expires_at?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      entity_tags: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag_users: {
        Row: {
          flag_key: string
          user_id: string
        }
        Insert: {
          flag_key: string
          user_id: string
        }
        Update: {
          flag_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_users_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled_globally: boolean
          enabled_plans: string[]
          key: string
          rollout_percentage: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled_globally?: boolean
          enabled_plans?: string[]
          key: string
          rollout_percentage?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled_globally?: boolean
          enabled_plans?: string[]
          key?: string
          rollout_percentage?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      file_categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      file_links: {
        Row: {
          confidence: number | null
          confirmed_at: string | null
          created_at: string
          entity_id: string
          entity_type: string
          file_id: string
          id: string
          relation_type: string
          source: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          confirmed_at?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          file_id: string
          id?: string
          relation_type?: string
          source?: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          confirmed_at?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_id?: string
          id?: string
          relation_type?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_links_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_movements: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string
          expected_payment_date: string | null
          id: string
          movement_date: string
          opportunity_id: string | null
          property_id: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
          vat_amount: number | null
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          description: string
          expected_payment_date?: string | null
          id?: string
          movement_date?: string
          opportunity_id?: string | null
          property_id?: string | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
          vat_amount?: number | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string
          expected_payment_date?: string | null
          id?: string
          movement_date?: string
          opportunity_id?: string | null
          property_id?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_movements_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_movements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_items: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          folder_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          folder_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          folder_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          created_at: string
          created_by_assessor: boolean
          due_date: string
          due_time: string | null
          external_reference: string | null
          id: string
          next_action_created_id: string | null
          notes: string | null
          opportunity_id: string | null
          outcome: string | null
          outcome_notes: string | null
          outcome_recorded_at: string | null
          person_id: string | null
          priority: string
          related_file_id: string | null
          related_property_id: string | null
          related_prospecting_lead_id: string | null
          source_channel: string | null
          source_message_id: string | null
          source_pending_action_id: string | null
          status: string
          timezone: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by_assessor?: boolean
          due_date?: string
          due_time?: string | null
          external_reference?: string | null
          id?: string
          next_action_created_id?: string | null
          notes?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          outcome_notes?: string | null
          outcome_recorded_at?: string | null
          person_id?: string | null
          priority?: string
          related_file_id?: string | null
          related_property_id?: string | null
          related_prospecting_lead_id?: string | null
          source_channel?: string | null
          source_message_id?: string | null
          source_pending_action_id?: string | null
          status?: string
          timezone?: string | null
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by_assessor?: boolean
          due_date?: string
          due_time?: string | null
          external_reference?: string | null
          id?: string
          next_action_created_id?: string | null
          notes?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          outcome_notes?: string | null
          outcome_recorded_at?: string | null
          person_id?: string | null
          priority?: string
          related_file_id?: string | null
          related_property_id?: string | null
          related_prospecting_lead_id?: string | null
          source_channel?: string | null
          source_message_id?: string | null
          source_pending_action_id?: string | null
          status?: string
          timezone?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_related_file_id_fkey"
            columns: ["related_file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_related_property_id_fkey"
            columns: ["related_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_related_prospecting_lead_id_fkey"
            columns: ["related_prospecting_lead_id"]
            isOneToOne: false
            referencedRelation: "prospecting_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          created_at: string
          id: string
          interaction_type: string | null
          occurred_at: string
          opportunity_id: string | null
          original_content: string | null
          person_id: string | null
          property_id: string | null
          source_channel: string
          summary: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          interaction_type?: string | null
          occurred_at?: string
          opportunity_id?: string | null
          original_content?: string | null
          person_id?: string | null
          property_id?: string | null
          source_channel?: string
          summary?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interaction_type?: string | null
          occurred_at?: string
          opportunity_id?: string | null
          original_content?: string | null
          person_id?: string | null
          property_id?: string | null
          source_channel?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_page_visits: {
        Row: {
          created_at: string
          id: string
          path: string | null
          referrer_host: string | null
          visit_date: string
          visit_hour: number
        }
        Insert: {
          created_at?: string
          id?: string
          path?: string | null
          referrer_host?: string | null
          visit_date?: string
          visit_hour?: number
        }
        Update: {
          created_at?: string
          id?: string
          path?: string | null
          referrer_host?: string | null
          visit_date?: string
          visit_hour?: number
        }
        Relationships: []
      }
      miscellaneous_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          occurred_at: string
          original_content: string | null
          related_opportunity_id: string | null
          related_person_id: string | null
          related_property_id: string | null
          source_channel: string
          source_message_id: string | null
          status: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          occurred_at?: string
          original_content?: string | null
          related_opportunity_id?: string | null
          related_person_id?: string | null
          related_property_id?: string | null
          source_channel?: string
          source_message_id?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          occurred_at?: string
          original_content?: string | null
          related_opportunity_id?: string | null
          related_person_id?: string | null
          related_property_id?: string | null
          source_channel?: string
          source_message_id?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "miscellaneous_items_related_opportunity_id_fkey"
            columns: ["related_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miscellaneous_items_related_person_id_fkey"
            columns: ["related_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miscellaneous_items_related_property_id_fkey"
            columns: ["related_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          archived_at: string | null
          created_at: string
          deadline: string | null
          deal_kind: string
          id: string
          next_action: string | null
          next_action_date: string | null
          notes: string | null
          person_id: string | null
          probability: string
          property_id: string | null
          stage: Database["public"]["Enums"]["deal_stage"]
          stage_changed_at: string
          status: string
          title: string | null
          type: string
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          deadline?: string | null
          deal_kind?: string
          id?: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          person_id?: string | null
          probability?: string
          property_id?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          stage_changed_at?: string
          status?: string
          title?: string | null
          type?: string
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          deadline?: string | null
          deal_kind?: string
          id?: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          person_id?: string | null
          probability?: string
          property_id?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          stage_changed_at?: string
          status?: string
          title?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          occurred_at: string
          opportunity_id: string
          payload: Json
          source: string
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          occurred_at?: string
          opportunity_id: string
          payload?: Json
          source?: string
          summary: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          occurred_at?: string
          opportunity_id?: string
          payload?: Json
          source?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_properties: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          opportunity_id: string
          property_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          opportunity_id: string
          property_id: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          opportunity_id?: string
          property_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_properties_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_actions: {
        Row: {
          channel: string
          confidence: number | null
          confirmed_fields: Json
          created_at: string
          created_resource_id: string | null
          created_resource_type: string | null
          current_question: string | null
          error_message: string | null
          expires_at: string
          goal: string | null
          id: string
          intent: string
          missing_fields: string[]
          original_content: string
          pending_question: string | null
          source_message_id: string | null
          status: string
          structured_payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          confidence?: number | null
          confirmed_fields?: Json
          created_at?: string
          created_resource_id?: string | null
          created_resource_type?: string | null
          current_question?: string | null
          error_message?: string | null
          expires_at?: string
          goal?: string | null
          id?: string
          intent: string
          missing_fields?: string[]
          original_content: string
          pending_question?: string | null
          source_message_id?: string | null
          status?: string
          structured_payload?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          confidence?: number | null
          confirmed_fields?: Json
          created_at?: string
          created_resource_id?: string | null
          created_resource_type?: string | null
          current_question?: string | null
          error_message?: string | null
          expires_at?: string
          goal?: string | null
          id?: string
          intent?: string
          missing_fields?: string[]
          original_content?: string
          pending_question?: string | null
          source_message_id?: string | null
          status?: string
          structured_payload?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          company: string | null
          created_at: string
          email: string | null
          email_normalized: string | null
          id: string
          job_title: string | null
          name: string
          next_action: string | null
          next_action_date: string | null
          phone: string | null
          preferences: Json
          referred_by_person_id: string | null
          relationship_type: string
          roles: Database["public"]["Enums"]["person_role"][]
          search_location: string | null
          search_property_type: string | null
          source_channel: string | null
          source_file_id: string | null
          source_message_id: string | null
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          company?: string | null
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          id?: string
          job_title?: string | null
          name: string
          next_action?: string | null
          next_action_date?: string | null
          phone?: string | null
          preferences?: Json
          referred_by_person_id?: string | null
          relationship_type?: string
          roles?: Database["public"]["Enums"]["person_role"][]
          search_location?: string | null
          search_property_type?: string | null
          source_channel?: string | null
          source_file_id?: string | null
          source_message_id?: string | null
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          company?: string | null
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          id?: string
          job_title?: string | null
          name?: string
          next_action?: string | null
          next_action_date?: string | null
          phone?: string | null
          preferences?: Json
          referred_by_person_id?: string | null
          relationship_type?: string
          roles?: Database["public"]["Enums"]["person_role"][]
          search_location?: string | null
          search_property_type?: string | null
          source_channel?: string | null
          source_file_id?: string | null
          source_message_id?: string | null
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_referred_by_person_id_fkey"
            columns: ["referred_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_phones: {
        Row: {
          country_code: string | null
          created_at: string
          e164: string | null
          id: string
          is_primary: boolean
          kind: string
          person_id: string
          raw: string
          user_id: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          e164?: string | null
          id?: string
          is_primary?: boolean
          kind?: string
          person_id: string
          raw: string
          user_id: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          e164?: string | null
          id?: string
          is_primary?: boolean
          kind?: string
          person_id?: string
          raw?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_phones_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_configs: {
        Row: {
          notes: string | null
          price_month: number | null
          pricing_mode: string
          status: string
          tier: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          notes?: string | null
          price_month?: number | null
          pricing_mode?: string
          status?: string
          tier: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          notes?: string | null
          price_month?: number | null
          pricing_mode?: string
          status?: string
          tier?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      product_feedback: {
        Row: {
          body: string
          channel: string
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          internal_note: string | null
          kind: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          internal_note?: string | null
          kind?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          internal_note?: string | null
          kind?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_updates: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          is_published: boolean
          released_on: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          id?: string
          is_published?: boolean
          released_on?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          is_published?: boolean
          released_on?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_kind: string
          assessor_name: string
          beta_expires_at: string | null
          created_at: string
          docs_retention_warned_at: string | null
          email: string | null
          id: string
          is_beta_tester: boolean
          name: string | null
          onboarding_goals: string | null
          onboarding_last_offer_at: string | null
          onboarding_offers: number
          onboarding_stage: string
          phone: string | null
          phone_verified_at: string | null
          primary_channel: string
          readonly_until: string | null
          subscription_tier: string
          telegram_retention_warned_at: string | null
          trial_choice: string | null
          trial_choice_asked_at: string | null
          trial_expires_at: string | null
          trial_started_at: string | null
          trial_status: string | null
          trial_tier: string | null
          trial_value_summary_at: string | null
          trial_warned_at: string | null
          updated_at: string
          whatsapp_link_status: string
          whatsapp_linked_at: string | null
        }
        Insert: {
          account_kind?: string
          assessor_name?: string
          beta_expires_at?: string | null
          created_at?: string
          docs_retention_warned_at?: string | null
          email?: string | null
          id: string
          is_beta_tester?: boolean
          name?: string | null
          onboarding_goals?: string | null
          onboarding_last_offer_at?: string | null
          onboarding_offers?: number
          onboarding_stage?: string
          phone?: string | null
          phone_verified_at?: string | null
          primary_channel?: string
          readonly_until?: string | null
          subscription_tier?: string
          telegram_retention_warned_at?: string | null
          trial_choice?: string | null
          trial_choice_asked_at?: string | null
          trial_expires_at?: string | null
          trial_started_at?: string | null
          trial_status?: string | null
          trial_tier?: string | null
          trial_value_summary_at?: string | null
          trial_warned_at?: string | null
          updated_at?: string
          whatsapp_link_status?: string
          whatsapp_linked_at?: string | null
        }
        Update: {
          account_kind?: string
          assessor_name?: string
          beta_expires_at?: string | null
          created_at?: string
          docs_retention_warned_at?: string | null
          email?: string | null
          id?: string
          is_beta_tester?: boolean
          name?: string | null
          onboarding_goals?: string | null
          onboarding_last_offer_at?: string | null
          onboarding_offers?: number
          onboarding_stage?: string
          phone?: string | null
          phone_verified_at?: string | null
          primary_channel?: string
          readonly_until?: string | null
          subscription_tier?: string
          telegram_retention_warned_at?: string | null
          trial_choice?: string | null
          trial_choice_asked_at?: string | null
          trial_expires_at?: string | null
          trial_started_at?: string | null
          trial_status?: string | null
          trial_tier?: string | null
          trial_value_summary_at?: string | null
          trial_warned_at?: string | null
          updated_at?: string
          whatsapp_link_status?: string
          whatsapp_linked_at?: string | null
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean
          beta_days: number | null
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          grants_tier: string
          id: string
          invitee_email: string | null
          invitee_name: string | null
          invitee_whatsapp: string | null
          is_beta: boolean
          max_uses: number
          note: string | null
          updated_at: string
          used_count: number
        }
        Insert: {
          active?: boolean
          beta_days?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          grants_tier?: string
          id?: string
          invitee_email?: string | null
          invitee_name?: string | null
          invitee_whatsapp?: string | null
          is_beta?: boolean
          max_uses?: number
          note?: string | null
          updated_at?: string
          used_count?: number
        }
        Update: {
          active?: boolean
          beta_days?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          grants_tier?: string
          id?: string
          invitee_email?: string | null
          invitee_name?: string | null
          invitee_whatsapp?: string | null
          is_beta?: boolean
          max_uses?: number
          note?: string | null
          updated_at?: string
          used_count?: number
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          channel: string
          code: string
          code_id: string
          confirmed_at: string | null
          created_at: string
          expires_at: string | null
          granted_tier: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          code: string
          code_id: string
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string | null
          granted_tier: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          code?: string
          code_id?: string
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string | null
          granted_tier?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          area_gross: number | null
          area_useful: number | null
          asking_price: number | null
          bathrooms: number | null
          bedrooms: number | null
          category: string | null
          category_id: string | null
          city: string | null
          commission_amount: number | null
          commission_pct: number | null
          created_at: string
          energy_rating: string | null
          estimated_value: number | null
          id: string
          location: string | null
          notes: string | null
          owner_person_id: string | null
          parish: string | null
          parking: number | null
          postal_code: string | null
          property_type: string | null
          reserved_at: string | null
          sale_price: number | null
          sold_at: string | null
          source_channel: string | null
          source_message_id: string | null
          status: string
          title: string
          typology: string | null
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          address?: string | null
          area_gross?: number | null
          area_useful?: number | null
          asking_price?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          category?: string | null
          category_id?: string | null
          city?: string | null
          commission_amount?: number | null
          commission_pct?: number | null
          created_at?: string
          energy_rating?: string | null
          estimated_value?: number | null
          id?: string
          location?: string | null
          notes?: string | null
          owner_person_id?: string | null
          parish?: string | null
          parking?: number | null
          postal_code?: string | null
          property_type?: string | null
          reserved_at?: string | null
          sale_price?: number | null
          sold_at?: string | null
          source_channel?: string | null
          source_message_id?: string | null
          status?: string
          title: string
          typology?: string | null
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          address?: string | null
          area_gross?: number | null
          area_useful?: number | null
          asking_price?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          category?: string | null
          category_id?: string | null
          city?: string | null
          commission_amount?: number | null
          commission_pct?: number | null
          created_at?: string
          energy_rating?: string | null
          estimated_value?: number | null
          id?: string
          location?: string | null
          notes?: string | null
          owner_person_id?: string | null
          parish?: string | null
          parking?: number | null
          postal_code?: string | null
          property_type?: string | null
          reserved_at?: string | null
          sale_price?: number | null
          sold_at?: string | null
          source_channel?: string | null
          source_message_id?: string | null
          status?: string
          title?: string
          typology?: string | null
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "property_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_owner_person_fk"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      property_categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      property_interests: {
        Row: {
          contact: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          opportunity_id: string | null
          person_id: string | null
          property_id: string
          source: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          opportunity_id?: string | null
          person_id?: string | null
          property_id: string
          source?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          opportunity_id?: string | null
          person_id?: string | null
          property_id?: string
          source?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_interests_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_interests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_interests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_marketing_activities: {
        Row: {
          created_at: string
          done_at: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          property_id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          property_id: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          done_at?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          property_id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_marketing_activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_marketing_activities_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_offers: {
        Row: {
          amount: number
          created_at: string
          from_name: string | null
          id: string
          notes: string | null
          offer_date: string
          opportunity_id: string | null
          person_id: string | null
          property_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          from_name?: string | null
          id?: string
          notes?: string | null
          offer_date?: string
          opportunity_id?: string | null
          person_id?: string | null
          property_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_name?: string | null
          id?: string
          notes?: string | null
          offer_date?: string
          opportunity_id?: string | null
          person_id?: string | null
          property_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_offers_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_offers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_offers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_leads: {
        Row: {
          address: string | null
          agency_name: string | null
          asking_price: number | null
          contact_attempts: number
          contact_name: string | null
          created_at: string
          extraction_confidence: number | null
          extraction_raw: Json
          id: string
          image_file_id: string | null
          last_contact_attempt_at: string | null
          listing_type: Database["public"]["Enums"]["prospecting_listing_type"]
          location: string | null
          next_follow_up_at: string | null
          notes: string | null
          phone: string | null
          property_type: string | null
          related_person_id: string | null
          related_property_id: string | null
          source_channel: string
          source_message_id: string | null
          source_type: Database["public"]["Enums"]["prospecting_source_type"]
          status: Database["public"]["Enums"]["prospecting_status"]
          title: string
          typology: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          agency_name?: string | null
          asking_price?: number | null
          contact_attempts?: number
          contact_name?: string | null
          created_at?: string
          extraction_confidence?: number | null
          extraction_raw?: Json
          id?: string
          image_file_id?: string | null
          last_contact_attempt_at?: string | null
          listing_type?: Database["public"]["Enums"]["prospecting_listing_type"]
          location?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          phone?: string | null
          property_type?: string | null
          related_person_id?: string | null
          related_property_id?: string | null
          source_channel?: string
          source_message_id?: string | null
          source_type?: Database["public"]["Enums"]["prospecting_source_type"]
          status?: Database["public"]["Enums"]["prospecting_status"]
          title: string
          typology?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          agency_name?: string | null
          asking_price?: number | null
          contact_attempts?: number
          contact_name?: string | null
          created_at?: string
          extraction_confidence?: number | null
          extraction_raw?: Json
          id?: string
          image_file_id?: string | null
          last_contact_attempt_at?: string | null
          listing_type?: Database["public"]["Enums"]["prospecting_listing_type"]
          location?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          phone?: string | null
          property_type?: string | null
          related_person_id?: string | null
          related_property_id?: string | null
          source_channel?: string
          source_message_id?: string | null
          source_type?: Database["public"]["Enums"]["prospecting_source_type"]
          status?: Database["public"]["Enums"]["prospecting_status"]
          title?: string
          typology?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_leads_image_file_id_fkey"
            columns: ["image_file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_leads_related_person_id_fkey"
            columns: ["related_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_leads_related_property_id_fkey"
            columns: ["related_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          channel: string
          created_at: string
          external_message_id: string | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          message_preview: string | null
          related_resource_id: string | null
          related_resource_type: string
          retry_count: number
          scheduled_for: string
          sent_at: string | null
          status: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          external_message_id?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          message_preview?: string | null
          related_resource_id?: string | null
          related_resource_type: string
          retry_count?: number
          scheduled_for: string
          sent_at?: string | null
          status?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          external_message_id?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          message_preview?: string | null
          related_resource_id?: string | null
          related_resource_type?: string
          retry_count?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      routines: {
        Row: {
          active: boolean
          created_at: string
          day_of_month: number | null
          frequency: string
          id: string
          interval_n: number
          last_run_at: string | null
          next_run_at: string
          notes: string | null
          opportunity_id: string | null
          person_id: string | null
          priority: string
          time_of_day: string | null
          title: string
          updated_at: string
          user_id: string
          weekday: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          day_of_month?: number | null
          frequency?: string
          id?: string
          interval_n?: number
          last_run_at?: string | null
          next_run_at?: string
          notes?: string | null
          opportunity_id?: string | null
          person_id?: string | null
          priority?: string
          time_of_day?: string | null
          title: string
          updated_at?: string
          user_id: string
          weekday?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          day_of_month?: number | null
          frequency?: string
          id?: string
          interval_n?: number
          last_run_at?: string | null
          next_run_at?: string
          notes?: string | null
          opportunity_id?: string | null
          person_id?: string | null
          priority?: string
          time_of_day?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          weekday?: number | null
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          created_at: string
          event: string
          from_tier: string | null
          id: string
          metadata: Json
          source: string | null
          to_tier: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event: string
          from_tier?: string | null
          id?: string
          metadata?: Json
          source?: string | null
          to_tier?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event?: string
          from_tier?: string | null
          id?: string
          metadata?: Json
          source?: string | null
          to_tier?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          note: string | null
          subscription_tier: string
          used_at: string | null
          used_by: string | null
          used_chat_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          note?: string | null
          subscription_tier?: string
          used_at?: string | null
          used_by?: string | null
          used_chat_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          note?: string | null
          subscription_tier?: string
          used_at?: string | null
          used_by?: string | null
          used_chat_id?: string | null
        }
        Relationships: []
      }
      telegram_link_tokens: {
        Row: {
          created_at: string
          expires_at: string
          token: string
          used_at: string | null
          used_chat_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          token: string
          used_at?: string | null
          used_chat_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          token?: string
          used_at?: string | null
          used_chat_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_pairings: {
        Row: {
          attempts: number
          chat_id: string
          code_hash: string | null
          created_at: string
          expires_at: string
          phone: string | null
          step: string
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          chat_id: string
          code_hash?: string | null
          created_at?: string
          expires_at?: string
          phone?: string | null
          step?: string
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          chat_id?: string
          code_hash?: string | null
          created_at?: string
          expires_at?: string
          phone?: string | null
          step?: string
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      uploaded_files: {
        Row: {
          ai_summary: string | null
          archived_at: string | null
          channel: string
          checksum: string | null
          classification: string | null
          classification_confidence: number | null
          created_at: string
          custom_category: string | null
          custom_category_id: string | null
          deleted_at: string | null
          document_type: string | null
          error_code: string | null
          error_message: string | null
          external_file_id: string | null
          extracted_metadata: Json
          extracted_text: string | null
          id: string
          internal_file_name: string
          mime_type: string
          opportunity_id: string | null
          original_file_name: string | null
          processing_status: string
          related_pending_action_id: string | null
          related_resource_id: string | null
          related_resource_type: string | null
          requires_review: boolean
          retention_archived_at: string | null
          retention_warned_at: string | null
          size_bytes: number
          source_external_file_id: string | null
          source_message_id: string | null
          storage_path: string
          updated_at: string
          user_description: string | null
          user_id: string | null
        }
        Insert: {
          ai_summary?: string | null
          archived_at?: string | null
          channel?: string
          checksum?: string | null
          classification?: string | null
          classification_confidence?: number | null
          created_at?: string
          custom_category?: string | null
          custom_category_id?: string | null
          deleted_at?: string | null
          document_type?: string | null
          error_code?: string | null
          error_message?: string | null
          external_file_id?: string | null
          extracted_metadata?: Json
          extracted_text?: string | null
          id?: string
          internal_file_name: string
          mime_type: string
          opportunity_id?: string | null
          original_file_name?: string | null
          processing_status?: string
          related_pending_action_id?: string | null
          related_resource_id?: string | null
          related_resource_type?: string | null
          requires_review?: boolean
          retention_archived_at?: string | null
          retention_warned_at?: string | null
          size_bytes?: number
          source_external_file_id?: string | null
          source_message_id?: string | null
          storage_path: string
          updated_at?: string
          user_description?: string | null
          user_id?: string | null
        }
        Update: {
          ai_summary?: string | null
          archived_at?: string | null
          channel?: string
          checksum?: string | null
          classification?: string | null
          classification_confidence?: number | null
          created_at?: string
          custom_category?: string | null
          custom_category_id?: string | null
          deleted_at?: string | null
          document_type?: string | null
          error_code?: string | null
          error_message?: string | null
          external_file_id?: string | null
          extracted_metadata?: Json
          extracted_text?: string | null
          id?: string
          internal_file_name?: string
          mime_type?: string
          opportunity_id?: string | null
          original_file_name?: string | null
          processing_status?: string
          related_pending_action_id?: string | null
          related_resource_id?: string | null
          related_resource_type?: string | null
          requires_review?: boolean
          retention_archived_at?: string | null
          retention_warned_at?: string | null
          size_bytes?: number
          source_external_file_id?: string | null
          source_message_id?: string | null
          storage_path?: string
          updated_at?: string
          user_description?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_files_custom_category_id_fkey"
            columns: ["custom_category_id"]
            isOneToOne: false
            referencedRelation: "file_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploaded_files_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploaded_files_related_pending_action_id_fkey"
            columns: ["related_pending_action_id"]
            isOneToOne: false
            referencedRelation: "pending_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploaded_files_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "assessor_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_link_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          phone: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_send_logs: {
        Row: {
          created_at: string
          error_code: number | null
          error_message: string | null
          error_subcode: number | null
          error_type: string | null
          fbtrace_id: string | null
          http_status: number | null
          id: string
          kind: string
          message_id: string | null
          ok: boolean
          phone_number_id: string | null
          to_phone: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          error_code?: number | null
          error_message?: string | null
          error_subcode?: number | null
          error_type?: string | null
          fbtrace_id?: string | null
          http_status?: number | null
          id?: string
          kind?: string
          message_id?: string | null
          ok?: boolean
          phone_number_id?: string | null
          to_phone: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          error_code?: number | null
          error_message?: string | null
          error_subcode?: number | null
          error_type?: string | null
          fbtrace_id?: string | null
          http_status?: number | null
          id?: string
          kind?: string
          message_id?: string | null
          ok?: boolean
          phone_number_id?: string | null
          to_phone?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      effective_tier: { Args: { _user_id: string }; Returns: string }
      expire_beta_testers: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      release_conversation_lock: {
        Args: { _channel: string; _holder?: string; _user_id: string }
        Returns: undefined
      }
      tier_at_least: {
        Args: { _min: string; _user_id: string }
        Returns: boolean
      }
      try_acquire_conversation_lock: {
        Args: {
          _channel: string
          _holder?: string
          _ttl_seconds?: number
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "consultant" | "support_admin" | "super_admin"
      assistant_correction_category:
        | "wrong_person"
        | "wrong_property"
        | "wrong_date"
        | "wrong_document"
        | "lost_context"
        | "unnatural_reply"
        | "unnecessary_question"
        | "wrong_execution"
        | "other"
      assistant_reflection_trigger: "low_aqs" | "low_ats" | "user_correction"
      deal_stage:
        | "preparacao"
        | "angariacao"
        | "promocao"
        | "visitas"
        | "proposta"
        | "cpcv"
        | "escritura"
        | "concluido"
      person_role:
        | "owner"
        | "potential_owner"
        | "buyer"
        | "potential_buyer"
        | "client"
        | "reference"
        | "partner"
        | "supplier"
        | "colleague"
        | "other"
      prospecting_listing_type:
        | "owner_sale"
        | "other_agency"
        | "own_agency"
        | "unknown"
      prospecting_source_type:
        | "street_sign"
        | "referral"
        | "online_listing"
        | "direct_observation"
        | "other"
      prospecting_status:
        | "to_contact"
        | "contact_attempted"
        | "contacted"
        | "no_interest"
        | "opportunity"
        | "converted"
        | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["consultant", "support_admin", "super_admin"],
      assistant_correction_category: [
        "wrong_person",
        "wrong_property",
        "wrong_date",
        "wrong_document",
        "lost_context",
        "unnatural_reply",
        "unnecessary_question",
        "wrong_execution",
        "other",
      ],
      assistant_reflection_trigger: ["low_aqs", "low_ats", "user_correction"],
      deal_stage: [
        "preparacao",
        "angariacao",
        "promocao",
        "visitas",
        "proposta",
        "cpcv",
        "escritura",
        "concluido",
      ],
      person_role: [
        "owner",
        "potential_owner",
        "buyer",
        "potential_buyer",
        "client",
        "reference",
        "partner",
        "supplier",
        "colleague",
        "other",
      ],
      prospecting_listing_type: [
        "owner_sale",
        "other_agency",
        "own_agency",
        "unknown",
      ],
      prospecting_source_type: [
        "street_sign",
        "referral",
        "online_listing",
        "direct_observation",
        "other",
      ],
      prospecting_status: [
        "to_contact",
        "contact_attempted",
        "contacted",
        "no_interest",
        "opportunity",
        "converted",
        "archived",
      ],
    },
  },
} as const
