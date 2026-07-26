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
          admin_user_id: string
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
          admin_user_id: string
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
          admin_user_id?: string
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
      assessor_ai_logs: {
        Row: {
          channel: string
          confidence: number | null
          created_at: string
          error: string | null
          estimated_cost_usd: number | null
          id: string
          input_tokens: number | null
          intent: string | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          success: boolean
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          channel: string
          confidence?: number | null
          created_at?: string
          error?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          intent?: string | null
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          success?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          confidence?: number | null
          created_at?: string
          error?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          intent?: string | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          success?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      assessor_messages: {
        Row: {
          channel: string
          content: string
          created_at: string
          id: string
          message_type: string | null
          role: string
          sender_phone: string | null
          status: string | null
          structured_payload: Json | null
          user_id: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          channel?: string
          content: string
          created_at?: string
          id?: string
          message_type?: string | null
          role: string
          sender_phone?: string | null
          status?: string | null
          structured_payload?: Json | null
          user_id?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          id?: string
          message_type?: string | null
          role?: string
          sender_phone?: string | null
          status?: string | null
          structured_payload?: Json | null
          user_id?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: []
      }
      conversation_states: {
        Row: {
          active_topic: string | null
          channel: string
          created_at: string
          expires_at: string | null
          external_conversation_id: string
          id: string
          last_created_resource_id: string | null
          last_created_resource_type: string | null
          last_entity_id: string | null
          last_entity_type: string | null
          last_intent: string | null
          pending_action_id: string | null
          state_summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_topic?: string | null
          channel: string
          created_at?: string
          expires_at?: string | null
          external_conversation_id?: string
          id?: string
          last_created_resource_id?: string | null
          last_created_resource_type?: string | null
          last_entity_id?: string | null
          last_entity_type?: string | null
          last_intent?: string | null
          pending_action_id?: string | null
          state_summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_topic?: string | null
          channel?: string
          created_at?: string
          expires_at?: string | null
          external_conversation_id?: string
          id?: string
          last_created_resource_id?: string | null
          last_created_resource_type?: string | null
          last_entity_id?: string | null
          last_entity_type?: string | null
          last_intent?: string | null
          pending_action_id?: string | null
          state_summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_states_pending_action_id_fkey"
            columns: ["pending_action_id"]
            isOneToOne: false
            referencedRelation: "pending_actions"
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
      follow_ups: {
        Row: {
          created_at: string
          due_date: string
          due_time: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          person_id: string | null
          priority: string
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_date?: string
          due_time?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          person_id?: string | null
          priority?: string
          status?: string
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_date?: string
          due_time?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          person_id?: string | null
          priority?: string
          status?: string
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
        ]
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
          created_at: string
          id: string
          next_action: string | null
          next_action_date: string | null
          notes: string | null
          person_id: string | null
          probability: string
          property_id: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          person_id?: string | null
          probability?: string
          property_id?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          person_id?: string | null
          probability?: string
          property_id?: string | null
          status?: string
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
      pending_actions: {
        Row: {
          channel: string
          confidence: number | null
          created_at: string
          created_resource_id: string | null
          created_resource_type: string | null
          error_message: string | null
          expires_at: string
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
          created_at?: string
          created_resource_id?: string | null
          created_resource_type?: string | null
          error_message?: string | null
          expires_at?: string
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
          created_at?: string
          created_resource_id?: string | null
          created_resource_type?: string | null
          error_message?: string | null
          expires_at?: string
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
          created_at: string
          email: string | null
          id: string
          name: string
          next_action: string | null
          next_action_date: string | null
          phone: string | null
          relationship_type: string
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          next_action?: string | null
          next_action_date?: string | null
          phone?: string | null
          relationship_type?: string
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          next_action?: string | null
          next_action_date?: string | null
          phone?: string | null
          relationship_type?: string
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_kind: string
          assessor_name: string
          created_at: string
          email: string | null
          id: string
          name: string | null
          phone: string | null
          phone_verified_at: string | null
          updated_at: string
          whatsapp_link_status: string
          whatsapp_linked_at: string | null
        }
        Insert: {
          account_kind?: string
          assessor_name?: string
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          updated_at?: string
          whatsapp_link_status?: string
          whatsapp_linked_at?: string | null
        }
        Update: {
          account_kind?: string
          assessor_name?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          updated_at?: string
          whatsapp_link_status?: string
          whatsapp_linked_at?: string | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          created_at: string
          id: string
          location: string | null
          notes: string | null
          owner_person_id: string | null
          property_type: string
          status: string
          title: string
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          owner_person_id?: string | null
          property_type?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          owner_person_id?: string | null
          property_type?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_owner_person_fk"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "consultant" | "support_admin" | "super_admin"
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
    },
  },
} as const
