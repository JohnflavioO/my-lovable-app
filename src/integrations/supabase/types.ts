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
      app_changelog: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          environment: string
          id: string
          release_date: string
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          environment?: string
          id?: string
          release_date?: string
          title: string
          updated_at?: string
          version: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          environment?: string
          id?: string
          release_date?: string
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      assistant_audit_log: {
        Row: {
          action_type: string
          company_id: string | null
          completion_tokens: number | null
          confirmation_required: boolean
          confirmation_result: string | null
          conversation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          estimated_cost: number | null
          execution_status: string
          execution_time_ms: number | null
          id: string
          ip: string | null
          model: string | null
          module: string | null
          prompt: string | null
          prompt_tokens: number | null
          provider: string | null
          tool_input: Json | null
          tool_name: string
          tool_output: Json | null
          total_tokens: number | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          company_id?: string | null
          completion_tokens?: number | null
          confirmation_required?: boolean
          confirmation_result?: string | null
          conversation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          estimated_cost?: number | null
          execution_status?: string
          execution_time_ms?: number | null
          id?: string
          ip?: string | null
          model?: string | null
          module?: string | null
          prompt?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          tool_input?: Json | null
          tool_name: string
          tool_output?: Json | null
          total_tokens?: number | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          company_id?: string | null
          completion_tokens?: number | null
          confirmation_required?: boolean
          confirmation_result?: string | null
          conversation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          estimated_cost?: number | null
          execution_status?: string
          execution_time_ms?: number | null
          id?: string
          ip?: string | null
          model?: string | null
          module?: string | null
          prompt?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          tool_input?: Json | null
          tool_name?: string
          tool_output?: Json | null
          total_tokens?: number | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      assistant_conversations: {
        Row: {
          answer: string | null
          archived_at: string | null
          company_id: string | null
          created_at: string
          id: string
          is_favorite: boolean
          question: string | null
          result_json: Json | null
          title: string | null
          tool_used: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          archived_at?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_favorite?: boolean
          question?: string | null
          result_json?: Json | null
          title?: string | null
          tool_used?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string | null
          archived_at?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_favorite?: boolean
          question?: string | null
          result_json?: Json | null
          title?: string | null
          tool_used?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assistant_messages: {
        Row: {
          completion_tokens: number | null
          content: string | null
          conversation_id: string
          created_at: string
          error: string | null
          execution_time_ms: number | null
          id: string
          model: string | null
          prompt_tokens: number | null
          role: string
          tool_args: Json | null
          tool_name: string | null
          tool_result: Json | null
          total_tokens: number | null
        }
        Insert: {
          completion_tokens?: number | null
          content?: string | null
          conversation_id: string
          created_at?: string
          error?: string | null
          execution_time_ms?: number | null
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          role: string
          tool_args?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
          total_tokens?: number | null
        }
        Update: {
          completion_tokens?: number | null
          content?: string | null
          conversation_id?: string
          created_at?: string
          error?: string | null
          execution_time_ms?: number | null
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          role?: string
          tool_args?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "assistant_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_audit_log: {
        Row: {
          company_id: string | null
          completed_at: string | null
          counts: Json
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          requested_by: string
          requester_email: string | null
          requester_role: string
          scope_type: string
          status: string
          verification: Json
          warnings: Json
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          counts?: Json
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          requested_by: string
          requester_email?: string | null
          requester_role: string
          scope_type: string
          status?: string
          verification?: Json
          warnings?: Json
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          counts?: Json
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          requested_by?: string
          requester_email?: string | null
          requester_role?: string
          scope_type?: string
          status?: string
          verification?: Json
          warnings?: Json
        }
        Relationships: []
      }
      bank_slip_history: {
        Row: {
          action: string
          bank_slip_id: string | null
          created_at: string | null
          id: string
          new_status: string | null
          notes: string | null
          performed_by: string | null
          prev_status: string | null
        }
        Insert: {
          action: string
          bank_slip_id?: string | null
          created_at?: string | null
          id?: string
          new_status?: string | null
          notes?: string | null
          performed_by?: string | null
          prev_status?: string | null
        }
        Update: {
          action?: string
          bank_slip_id?: string | null
          created_at?: string | null
          id?: string
          new_status?: string | null
          notes?: string | null
          performed_by?: string | null
          prev_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_slip_history_bank_slip_id_fkey"
            columns: ["bank_slip_id"]
            isOneToOne: false
            referencedRelation: "bank_slips"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_slips: {
        Row: {
          classification: string | null
          client_name: string
          company_id: string | null
          created_at: string | null
          created_by: string | null
          dda: string | null
          due_date: string
          fine_amount: number
          id: string
          import_batch_id: string | null
          interest_amount: number
          lembrete: string | null
          nfe_number: string | null
          notes: string | null
          payment_date: string | null
          principal_amount: number
          reference: string | null
          reminder: string | null
          salesperson_name: string | null
          status: string
          updated_amount: number
          updated_at: string | null
        }
        Insert: {
          classification?: string | null
          client_name: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dda?: string | null
          due_date: string
          fine_amount?: number
          id?: string
          import_batch_id?: string | null
          interest_amount?: number
          lembrete?: string | null
          nfe_number?: string | null
          notes?: string | null
          payment_date?: string | null
          principal_amount?: number
          reference?: string | null
          reminder?: string | null
          salesperson_name?: string | null
          status?: string
          updated_amount?: number
          updated_at?: string | null
        }
        Update: {
          classification?: string | null
          client_name?: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dda?: string | null
          due_date?: string
          fine_amount?: number
          id?: string
          import_batch_id?: string | null
          interest_amount?: number
          lembrete?: string | null
          nfe_number?: string | null
          notes?: string | null
          payment_date?: string | null
          principal_amount?: number
          reference?: string | null
          reminder?: string | null
          salesperson_name?: string | null
          status?: string
          updated_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_slips_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "financial_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          address_number: string | null
          assigned_at: string | null
          assigned_user_id: string | null
          cep: string | null
          city: string | null
          client_type: string | null
          company: string | null
          company_id: string | null
          company_name: string | null
          complement: string | null
          contact_name: string | null
          contact_phone: string | null
          contrib_icms: string | null
          cpf_cnpj: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          external_registration_id: string | null
          id: string
          is_new_registration: boolean
          is_revenda: boolean
          is_whatsapp: boolean | null
          last_interaction_at: string | null
          name: string
          neighborhood: string | null
          notes: string | null
          phone: string | null
          pipeline_stage: string
          received_at: string | null
          registration_status: string | null
          salesperson_id: string | null
          source: string | null
          source_label: string | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          cep?: string | null
          city?: string | null
          client_type?: string | null
          company?: string | null
          company_id?: string | null
          company_name?: string | null
          complement?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contrib_icms?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          external_registration_id?: string | null
          id?: string
          is_new_registration?: boolean
          is_revenda?: boolean
          is_whatsapp?: boolean | null
          last_interaction_at?: string | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_stage?: string
          received_at?: string | null
          registration_status?: string | null
          salesperson_id?: string | null
          source?: string | null
          source_label?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          cep?: string | null
          city?: string | null
          client_type?: string | null
          company?: string | null
          company_id?: string | null
          company_name?: string | null
          complement?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contrib_icms?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          external_registration_id?: string | null
          id?: string
          is_new_registration?: boolean
          is_revenda?: boolean
          is_whatsapp?: boolean | null
          last_interaction_at?: string | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_stage?: string
          received_at?: string | null
          registration_status?: string | null
          salesperson_id?: string | null
          source?: string | null
          source_label?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cnpj_lookup_cache: {
        Row: {
          cnpj: string
          fetched_at: string
          payload: Json
        }
        Insert: {
          cnpj: string
          fetched_at?: string
          payload: Json
        }
        Update: {
          cnpj?: string
          fetched_at?: string
          payload?: Json
        }
        Relationships: []
      }
      contract_signature_events: {
        Row: {
          company_id: string | null
          created_at: string
          device_info: string | null
          event_type: Database["public"]["Enums"]["contract_signature_event_type"]
          id: string
          ip_address: string | null
          metadata: Json
          signature_request_id: string
          user_agent: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          device_info?: string | null
          event_type: Database["public"]["Enums"]["contract_signature_event_type"]
          id?: string
          ip_address?: string | null
          metadata?: Json
          signature_request_id: string
          user_agent?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          device_info?: string | null
          event_type?: Database["public"]["Enums"]["contract_signature_event_type"]
          id?: string
          ip_address?: string | null
          metadata?: Json
          signature_request_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signature_events_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "contract_signature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signature_requests: {
        Row: {
          cancelled_at: string | null
          company_id: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          evidence_document_url: string | null
          expires_at: string
          id: string
          identity_confirmed_at: string | null
          last_ip: string | null
          last_user_agent: string | null
          original_document_hash: string | null
          original_document_url: string | null
          otp_attempts: number
          otp_code_hash: string | null
          otp_expires_at: string | null
          provider: string
          provider_request_id: string | null
          public_token_hash: string
          refused_at: string | null
          sent_at: string | null
          signature_image: string | null
          signature_method: string | null
          signed_at: string | null
          signed_document_hash: string | null
          signed_document_url: string | null
          signer_document: string
          signer_email: string
          signer_name: string
          signer_phone: string | null
          status: Database["public"]["Enums"]["contract_signature_status"]
          terms_accepted_at: string | null
          updated_at: string
          validation_code: string | null
          viewed_at: string | null
        }
        Insert: {
          cancelled_at?: string | null
          company_id?: string | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          evidence_document_url?: string | null
          expires_at: string
          id?: string
          identity_confirmed_at?: string | null
          last_ip?: string | null
          last_user_agent?: string | null
          original_document_hash?: string | null
          original_document_url?: string | null
          otp_attempts?: number
          otp_code_hash?: string | null
          otp_expires_at?: string | null
          provider?: string
          provider_request_id?: string | null
          public_token_hash: string
          refused_at?: string | null
          sent_at?: string | null
          signature_image?: string | null
          signature_method?: string | null
          signed_at?: string | null
          signed_document_hash?: string | null
          signed_document_url?: string | null
          signer_document: string
          signer_email: string
          signer_name: string
          signer_phone?: string | null
          status?: Database["public"]["Enums"]["contract_signature_status"]
          terms_accepted_at?: string | null
          updated_at?: string
          validation_code?: string | null
          viewed_at?: string | null
        }
        Update: {
          cancelled_at?: string | null
          company_id?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          evidence_document_url?: string | null
          expires_at?: string
          id?: string
          identity_confirmed_at?: string | null
          last_ip?: string | null
          last_user_agent?: string | null
          original_document_hash?: string | null
          original_document_url?: string | null
          otp_attempts?: number
          otp_code_hash?: string | null
          otp_expires_at?: string | null
          provider?: string
          provider_request_id?: string | null
          public_token_hash?: string
          refused_at?: string | null
          sent_at?: string | null
          signature_image?: string | null
          signature_method?: string | null
          signed_at?: string | null
          signed_document_hash?: string | null
          signed_document_url?: string | null
          signer_document?: string
          signer_email?: string
          signer_name?: string
          signer_phone?: string | null
          status?: Database["public"]["Enums"]["contract_signature_status"]
          terms_accepted_at?: string | null
          updated_at?: string
          validation_code?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signature_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "generated_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          active: boolean | null
          company_id: string | null
          content: string | null
          created_at: string
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          company_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          company_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      equivalence_search_cache: {
        Row: {
          candidates: Json | null
          created_at: string
          expires_at: string
          extracted_specs: Json | null
          id: string
          input_hash: string
          input_type: string
          input_value: string | null
        }
        Insert: {
          candidates?: Json | null
          created_at?: string
          expires_at?: string
          extracted_specs?: Json | null
          id?: string
          input_hash: string
          input_type: string
          input_value?: string | null
        }
        Update: {
          candidates?: Json | null
          created_at?: string
          expires_at?: string
          extracted_specs?: Json | null
          id?: string
          input_hash?: string
          input_type?: string
          input_value?: string | null
        }
        Relationships: []
      }
      equivalence_search_history: {
        Row: {
          chosen_product_id: string | null
          company_id: string | null
          created_at: string
          extracted_specs: Json | null
          id: string
          input_type: string
          input_value: string
          is_favorite: boolean
          response_time_ms: number | null
          user_id: string
        }
        Insert: {
          chosen_product_id?: string | null
          company_id?: string | null
          created_at?: string
          extracted_specs?: Json | null
          id?: string
          input_type: string
          input_value: string
          is_favorite?: boolean
          response_time_ms?: number | null
          user_id: string
        }
        Update: {
          chosen_product_id?: string | null
          company_id?: string | null
          created_at?: string
          extracted_specs?: Json | null
          id?: string
          input_type?: string
          input_value?: string
          is_favorite?: boolean
          response_time_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equivalence_search_history_chosen_product_id_fkey"
            columns: ["chosen_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_action_history: {
        Row: {
          action_type: string
          created_at: string
          financial_record_id: string
          id: string
          new_status: string | null
          notes: string | null
          performed_by: string
          performed_by_name: string | null
          previous_status: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          financial_record_id: string
          id?: string
          new_status?: string | null
          notes?: string | null
          performed_by: string
          performed_by_name?: string | null
          previous_status?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          financial_record_id?: string
          id?: string
          new_status?: string | null
          notes?: string | null
          performed_by?: string
          performed_by_name?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_action_history_financial_record_id_fkey"
            columns: ["financial_record_id"]
            isOneToOne: false
            referencedRelation: "financial_records"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_import_batches: {
        Row: {
          company_id: string
          created_at: string
          filename: string
          id: string
          import_date: string
          imported_by: string
          status: string
          total_records: number
          total_value: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          filename: string
          id?: string
          import_date?: string
          imported_by: string
          status?: string
          total_records?: number
          total_value?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          filename?: string
          id?: string
          import_date?: string
          imported_by?: string
          status?: string
          total_records?: number
          total_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      financial_records: {
        Row: {
          amount_paid: number | null
          baixa_at: string | null
          baixa_by: string | null
          client_id: string | null
          client_name: string
          company_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          external_order_id: string | null
          financial_notes: string | null
          financial_status: string
          id: string
          installment_number: number | null
          installments_total: number | null
          paid_date: string | null
          payment_method: string | null
          quote_id: string | null
          source: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number | null
          baixa_at?: string | null
          baixa_by?: string | null
          client_id?: string | null
          client_name?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          external_order_id?: string | null
          financial_notes?: string | null
          financial_status?: string
          id?: string
          installment_number?: number | null
          installments_total?: number | null
          paid_date?: string | null
          payment_method?: string | null
          quote_id?: string | null
          source?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number | null
          baixa_at?: string | null
          baixa_by?: string | null
          client_id?: string | null
          client_name?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          external_order_id?: string | null
          financial_notes?: string | null
          financial_status?: string
          id?: string
          installment_number?: number | null
          installments_total?: number | null
          paid_date?: string | null
          payment_method?: string | null
          quote_id?: string | null
          source?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_records_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_notification_logs: {
        Row: {
          created_at: string
          id: string
          notification_type: string
          notified_at: string
          quote_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_type: string
          notified_at?: string
          quote_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_type?: string
          notified_at?: string
          quote_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_notification_logs_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_contracts: {
        Row: {
          client_document: string
          client_name: string
          company_id: string | null
          contract_data_json: Json
          created_at: string
          created_by: string | null
          delivery_forecast: string | null
          id: string
          pdf_url: string | null
          responsible_name: string | null
          responsible_phone: string | null
          signature_status: Database["public"]["Enums"]["contract_signature_status"]
          signed_file_name: string | null
          signed_file_url: string | null
          signed_uploaded_at: string | null
          signed_uploaded_by: string | null
          status: string | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          client_document: string
          client_name: string
          company_id?: string | null
          contract_data_json?: Json
          created_at?: string
          created_by?: string | null
          delivery_forecast?: string | null
          id?: string
          pdf_url?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          signature_status?: Database["public"]["Enums"]["contract_signature_status"]
          signed_file_name?: string | null
          signed_file_url?: string | null
          signed_uploaded_at?: string | null
          signed_uploaded_by?: string | null
          status?: string | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          client_document?: string
          client_name?: string
          company_id?: string | null
          contract_data_json?: Json
          created_at?: string
          created_by?: string | null
          delivery_forecast?: string | null
          id?: string
          pdf_url?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          signature_status?: Database["public"]["Enums"]["contract_signature_status"]
          signed_file_name?: string | null
          signed_file_url?: string | null
          signed_uploaded_at?: string | null
          signed_uploaded_by?: string | null
          status?: string | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      help_videos: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          custom_thumbnail_url: string | null
          description: string | null
          id: string
          loom_url: string
          sort_order: number
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_id: string | null
          video_type: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          custom_thumbnail_url?: string | null
          description?: string | null
          id?: string
          loom_url: string
          sort_order?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_id?: string | null
          video_type?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          custom_thumbnail_url?: string | null
          description?: string | null
          id?: string
          loom_url?: string
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_id?: string | null
          video_type?: string | null
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          metadata: Json | null
          records_count: number | null
          source_url: string | null
          status: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          records_count?: number | null
          source_url?: string | null
          status: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          records_count?: number | null
          source_url?: string | null
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          api_key: string | null
          application_key: string | null
          config: Json | null
          created_at: string
          created_by: string
          id: string
          integration_name: string
          last_sync_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          application_key?: string | null
          config?: Json | null
          created_at?: string
          created_by: string
          id?: string
          integration_name: string
          last_sync_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          application_key?: string | null
          config?: Json | null
          created_at?: string
          created_by?: string
          id?: string
          integration_name?: string
          last_sync_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistics_action_history: {
        Row: {
          action_type: string
          created_at: string
          id: string
          logistics_record_id: string
          new_status: string | null
          notes: string | null
          performed_by: string
          performed_by_name: string | null
          previous_status: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          logistics_record_id: string
          new_status?: string | null
          notes?: string | null
          performed_by: string
          performed_by_name?: string | null
          previous_status?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          logistics_record_id?: string
          new_status?: string | null
          notes?: string | null
          performed_by?: string
          performed_by_name?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logistics_action_history_logistics_record_id_fkey"
            columns: ["logistics_record_id"]
            isOneToOne: false
            referencedRelation: "logistics_records"
            referencedColumns: ["id"]
          },
        ]
      }
      logistics_item_status: {
        Row: {
          created_at: string
          id: string
          item_status: string
          logistics_record_id: string
          quote_item_id: string
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_status?: string
          logistics_record_id: string
          quote_item_id: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_status?: string
          logistics_record_id?: string
          quote_item_id?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logistics_item_status_logistics_record_id_fkey"
            columns: ["logistics_record_id"]
            isOneToOne: false
            referencedRelation: "logistics_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logistics_item_status_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
        ]
      }
      logistics_records: {
        Row: {
          codigo_rastreio: string | null
          company_id: string | null
          created_at: string
          data_entrega: string | null
          data_envio: string | null
          entrada_at: string | null
          entrada_by: string | null
          id: string
          is_incompleto: boolean
          logistics_status: string
          nf_chave_acesso: string | null
          nf_data: string | null
          nf_numero: string | null
          nf_pdf_url: string | null
          nf_xml_url: string | null
          observacao_logistica: string | null
          origem_nf: string | null
          public_token: string
          quote_id: string
          tracking_url: string | null
          transportadora: string | null
          ultima_sincronizacao_nf: string | null
          updated_at: string
        }
        Insert: {
          codigo_rastreio?: string | null
          company_id?: string | null
          created_at?: string
          data_entrega?: string | null
          data_envio?: string | null
          entrada_at?: string | null
          entrada_by?: string | null
          id?: string
          is_incompleto?: boolean
          logistics_status?: string
          nf_chave_acesso?: string | null
          nf_data?: string | null
          nf_numero?: string | null
          nf_pdf_url?: string | null
          nf_xml_url?: string | null
          observacao_logistica?: string | null
          origem_nf?: string | null
          public_token?: string
          quote_id: string
          tracking_url?: string | null
          transportadora?: string | null
          ultima_sincronizacao_nf?: string | null
          updated_at?: string
        }
        Update: {
          codigo_rastreio?: string | null
          company_id?: string | null
          created_at?: string
          data_entrega?: string | null
          data_envio?: string | null
          entrada_at?: string | null
          entrada_by?: string | null
          id?: string
          is_incompleto?: boolean
          logistics_status?: string
          nf_chave_acesso?: string | null
          nf_data?: string | null
          nf_numero?: string | null
          nf_pdf_url?: string | null
          nf_xml_url?: string | null
          observacao_logistica?: string | null
          origem_nf?: string | null
          public_token?: string
          quote_id?: string
          tracking_url?: string | null
          transportadora?: string | null
          ultima_sincronizacao_nf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "logistics_records_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: true
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          module: string | null
          priority: string
          read_at: string | null
          related_client_id: string | null
          related_quote_id: string | null
          related_url: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          module?: string | null
          priority?: string
          read_at?: string | null
          related_client_id?: string | null
          related_quote_id?: string | null
          related_url?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          module?: string | null
          priority?: string
          read_at?: string | null
          related_client_id?: string | null
          related_quote_id?: string | null
          related_url?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_client_id_fkey"
            columns: ["related_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_quote_id_fkey"
            columns: ["related_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_log: {
        Row: {
          created_at: string
          id: string
          performed_by: string
          performed_by_name: string | null
          target_user_id: string
          target_user_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          performed_by: string
          performed_by_name?: string | null
          target_user_id: string
          target_user_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          performed_by?: string
          performed_by_name?: string | null
          target_user_id?: string
          target_user_name?: string | null
        }
        Relationships: []
      }
      product_equivalences: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string | null
          confidence: number | null
          created_at: string
          id: string
          marca_externa: string | null
          mci_product_id: string
          modelo_externo: string | null
          notes: string | null
          produto_externo: string | null
          updated_at: string
          url_externa: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          marca_externa?: string | null
          mci_product_id: string
          modelo_externo?: string | null
          notes?: string | null
          produto_externo?: string | null
          updated_at?: string
          url_externa?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          marca_externa?: string | null
          mci_product_id?: string
          modelo_externo?: string | null
          notes?: string | null
          produto_externo?: string | null
          updated_at?: string
          url_externa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_equivalences_mci_product_id_fkey"
            columns: ["mci_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_external_links: {
        Row: {
          candidates: Json | null
          company_id: string | null
          created_at: string
          created_by: string | null
          external_code: string | null
          external_name: string | null
          external_product_id: string
          external_sku: string | null
          id: string
          last_sync_at: string | null
          match_source: string | null
          product_id: string
          provider: string
          sync_status: string
          updated_at: string
        }
        Insert: {
          candidates?: Json | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          external_code?: string | null
          external_name?: string | null
          external_product_id: string
          external_sku?: string | null
          id?: string
          last_sync_at?: string | null
          match_source?: string | null
          product_id: string
          provider: string
          sync_status?: string
          updated_at?: string
        }
        Update: {
          candidates?: Json | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          external_code?: string | null
          external_name?: string | null
          external_product_id?: string
          external_sku?: string | null
          id?: string
          last_sync_at?: string | null
          match_source?: string | null
          product_id?: string
          provider?: string
          sync_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_external_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_relationships: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          observacao: string | null
          product_id: string | null
          related_product_id: string | null
          tipo_relacao: string
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          observacao?: string | null
          product_id?: string | null
          related_product_id?: string | null
          tipo_relacao: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          observacao?: string | null
          product_id?: string | null
          related_product_id?: string | null
          tipo_relacao?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_relationships_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relationships_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          altura_cm: number | null
          bloquear_atualizacao_logistica: boolean
          brand: string | null
          category_principal: string | null
          code: string | null
          company_id: string | null
          compatibility: string | null
          comprimento_cm: number | null
          created_at: string | null
          description: string | null
          embalagem_tipo: string | null
          id: string
          image_url: string | null
          largura_cm: number | null
          level: string | null
          logistica_atualizada_em: string | null
          loja_integrada_id: string | null
          loja_integrada_sync_source: string | null
          name: string
          needs_manual_link: boolean
          origem_cep: string | null
          peso_cubado: number | null
          peso_kg: number | null
          price: number | null
          sku: string | null
          sync_candidates: Json | null
          updated_at: string
          volume_m3: number | null
        }
        Insert: {
          altura_cm?: number | null
          bloquear_atualizacao_logistica?: boolean
          brand?: string | null
          category_principal?: string | null
          code?: string | null
          company_id?: string | null
          compatibility?: string | null
          comprimento_cm?: number | null
          created_at?: string | null
          description?: string | null
          embalagem_tipo?: string | null
          id?: string
          image_url?: string | null
          largura_cm?: number | null
          level?: string | null
          logistica_atualizada_em?: string | null
          loja_integrada_id?: string | null
          loja_integrada_sync_source?: string | null
          name: string
          needs_manual_link?: boolean
          origem_cep?: string | null
          peso_cubado?: number | null
          peso_kg?: number | null
          price?: number | null
          sku?: string | null
          sync_candidates?: Json | null
          updated_at?: string
          volume_m3?: number | null
        }
        Update: {
          altura_cm?: number | null
          bloquear_atualizacao_logistica?: boolean
          brand?: string | null
          category_principal?: string | null
          code?: string | null
          company_id?: string | null
          compatibility?: string | null
          comprimento_cm?: number | null
          created_at?: string | null
          description?: string | null
          embalagem_tipo?: string | null
          id?: string
          image_url?: string | null
          largura_cm?: number | null
          level?: string | null
          logistica_atualizada_em?: string | null
          loja_integrada_id?: string | null
          loja_integrada_sync_source?: string | null
          name?: string
          needs_manual_link?: boolean
          origem_cep?: string | null
          peso_cubado?: number | null
          peso_kg?: number | null
          price?: number | null
          sku?: string | null
          sync_candidates?: Json | null
          updated_at?: string
          volume_m3?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          can_access_support_manager: boolean | null
          commercial_visible: boolean
          company_id: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          force_password_change: boolean
          full_name: string
          id: string
          permissions: Json | null
          phone: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          can_access_support_manager?: boolean | null
          commercial_visible?: boolean
          company_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          force_password_change?: boolean
          full_name?: string
          id?: string
          permissions?: Json | null
          phone?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          can_access_support_manager?: boolean | null
          commercial_visible?: boolean
          company_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          force_password_change?: boolean
          full_name?: string
          id?: string
          permissions?: Json | null
          phone?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quote_freight_quotes: {
        Row: {
          altura_cm: number | null
          api_provider: string | null
          carrier: string | null
          cep_destino: string | null
          cep_origem: string | null
          company_id: string | null
          comprimento_cm: number | null
          created_at: string
          created_by: string | null
          id: string
          is_selected: boolean
          largura_cm: number | null
          modalidade: string | null
          notes: string | null
          payload_request: Json | null
          payload_response: Json | null
          peso_cubado_kg: number | null
          peso_total_kg: number | null
          prazo_dias: number | null
          quote_id: string
          raw_payload: Json | null
          service: string | null
          source: string
          updated_at: string
          valor_frete: number | null
          valor_mercadoria: number | null
          volume_m3: number | null
          volumes_qtd: number | null
        }
        Insert: {
          altura_cm?: number | null
          api_provider?: string | null
          carrier?: string | null
          cep_destino?: string | null
          cep_origem?: string | null
          company_id?: string | null
          comprimento_cm?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_selected?: boolean
          largura_cm?: number | null
          modalidade?: string | null
          notes?: string | null
          payload_request?: Json | null
          payload_response?: Json | null
          peso_cubado_kg?: number | null
          peso_total_kg?: number | null
          prazo_dias?: number | null
          quote_id: string
          raw_payload?: Json | null
          service?: string | null
          source?: string
          updated_at?: string
          valor_frete?: number | null
          valor_mercadoria?: number | null
          volume_m3?: number | null
          volumes_qtd?: number | null
        }
        Update: {
          altura_cm?: number | null
          api_provider?: string | null
          carrier?: string | null
          cep_destino?: string | null
          cep_origem?: string | null
          company_id?: string | null
          comprimento_cm?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_selected?: boolean
          largura_cm?: number | null
          modalidade?: string | null
          notes?: string | null
          payload_request?: Json | null
          payload_response?: Json | null
          peso_cubado_kg?: number | null
          peso_total_kg?: number | null
          prazo_dias?: number | null
          quote_id?: string
          raw_payload?: Json | null
          service?: string | null
          source?: string
          updated_at?: string
          valor_frete?: number | null
          valor_mercadoria?: number | null
          volume_m3?: number | null
          volumes_qtd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_freight_quotes_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          brand: string | null
          category: string | null
          code: string | null
          description: string
          description_layout: string
          discount_percent: number | null
          id: string
          image_url: string | null
          is_gift: boolean
          is_presale: boolean
          item_number: number | null
          line_total: number | null
          model: string | null
          product_code: string | null
          quantity: number | null
          quote_id: string
          specifications: string | null
          total_price: number | null
          transfer_status: string | null
          unit_price: number | null
          unit_total: number | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          code?: string | null
          description?: string
          description_layout?: string
          discount_percent?: number | null
          id?: string
          image_url?: string | null
          is_gift?: boolean
          is_presale?: boolean
          item_number?: number | null
          line_total?: number | null
          model?: string | null
          product_code?: string | null
          quantity?: number | null
          quote_id: string
          specifications?: string | null
          total_price?: number | null
          transfer_status?: string | null
          unit_price?: number | null
          unit_total?: number | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          code?: string | null
          description?: string
          description_layout?: string
          discount_percent?: number | null
          id?: string
          image_url?: string | null
          is_gift?: boolean
          is_presale?: boolean
          item_number?: number | null
          line_total?: number | null
          model?: string | null
          product_code?: string | null
          quantity?: number | null
          quote_id?: string
          specifications?: string | null
          total_price?: number | null
          transfer_status?: string | null
          unit_price?: number | null
          unit_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          quote_id: string
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          quote_id: string
          user_id: string
          user_name?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          quote_id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_messages_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_payment_audit: {
        Row: {
          action: string
          attempted_status: string | null
          created_at: string
          error_code: string | null
          id: string
          missing_fields: string[] | null
          new_value: Json | null
          old_value: Json | null
          quote_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          attempted_status?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          missing_fields?: string[] | null
          new_value?: Json | null
          old_value?: Json | null
          quote_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          attempted_status?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          missing_fields?: string[] | null
          new_value?: Json | null
          old_value?: Json | null
          quote_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      quote_recycle_requests: {
        Row: {
          created_at: string
          id: string
          quote_id: string
          reason: string | null
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_date: string
          target_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          quote_id: string
          reason?: string | null
          requested_by: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_date: string
          target_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          quote_id?: string
          reason?: string | null
          requested_by?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_date?: string
          target_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_recycle_requests_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          approved_at: string | null
          approver_name: string | null
          client_id: string | null
          client_name: string
          company_id: string | null
          created_at: string | null
          created_by: string | null
          demonstration_end_date: string | null
          demonstration_start_date: string | null
          discount: number | null
          external_order_id: string | null
          external_status: string | null
          followup_date: string | null
          id: string
          installments: number | null
          is_demonstration: boolean
          is_reseller: boolean
          is_split_payment: boolean
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          payment_status: string | null
          payment_terms: string | null
          proposal_validity: string | null
          public_token: string | null
          public_token_expires_at: string | null
          quote_date: string | null
          quote_number: string
          rejected_at: string | null
          salesperson: string | null
          salesperson_id: string | null
          shipping_address: string | null
          shipping_address_number: string | null
          shipping_cep: string | null
          shipping_city: string | null
          shipping_complement: string | null
          shipping_cost: number | null
          shipping_deadline: string | null
          shipping_method: string | null
          shipping_neighborhood: string | null
          shipping_notes: string | null
          shipping_phone: string | null
          shipping_recipient: string | null
          shipping_state: string | null
          source: string | null
          split_date_1: string | null
          split_date_2: string | null
          split_installments_1: number | null
          split_installments_2: number | null
          split_method_1: string | null
          split_method_2: string | null
          split_value_1: number | null
          split_value_2: number | null
          status: string | null
          total: number | null
          total_amount: number | null
          updated_at: string | null
          use_alt_shipping_address: boolean
        }
        Insert: {
          approved_at?: string | null
          approver_name?: string | null
          client_id?: string | null
          client_name?: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          demonstration_end_date?: string | null
          demonstration_start_date?: string | null
          discount?: number | null
          external_order_id?: string | null
          external_status?: string | null
          followup_date?: string | null
          id?: string
          installments?: number | null
          is_demonstration?: boolean
          is_reseller?: boolean
          is_split_payment?: boolean
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payment_terms?: string | null
          proposal_validity?: string | null
          public_token?: string | null
          public_token_expires_at?: string | null
          quote_date?: string | null
          quote_number?: string
          rejected_at?: string | null
          salesperson?: string | null
          salesperson_id?: string | null
          shipping_address?: string | null
          shipping_address_number?: string | null
          shipping_cep?: string | null
          shipping_city?: string | null
          shipping_complement?: string | null
          shipping_cost?: number | null
          shipping_deadline?: string | null
          shipping_method?: string | null
          shipping_neighborhood?: string | null
          shipping_notes?: string | null
          shipping_phone?: string | null
          shipping_recipient?: string | null
          shipping_state?: string | null
          source?: string | null
          split_date_1?: string | null
          split_date_2?: string | null
          split_installments_1?: number | null
          split_installments_2?: number | null
          split_method_1?: string | null
          split_method_2?: string | null
          split_value_1?: number | null
          split_value_2?: number | null
          status?: string | null
          total?: number | null
          total_amount?: number | null
          updated_at?: string | null
          use_alt_shipping_address?: boolean
        }
        Update: {
          approved_at?: string | null
          approver_name?: string | null
          client_id?: string | null
          client_name?: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          demonstration_end_date?: string | null
          demonstration_start_date?: string | null
          discount?: number | null
          external_order_id?: string | null
          external_status?: string | null
          followup_date?: string | null
          id?: string
          installments?: number | null
          is_demonstration?: boolean
          is_reseller?: boolean
          is_split_payment?: boolean
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payment_terms?: string | null
          proposal_validity?: string | null
          public_token?: string | null
          public_token_expires_at?: string | null
          quote_date?: string | null
          quote_number?: string
          rejected_at?: string | null
          salesperson?: string | null
          salesperson_id?: string | null
          shipping_address?: string | null
          shipping_address_number?: string | null
          shipping_cep?: string | null
          shipping_city?: string | null
          shipping_complement?: string | null
          shipping_cost?: number | null
          shipping_deadline?: string | null
          shipping_method?: string | null
          shipping_neighborhood?: string | null
          shipping_notes?: string | null
          shipping_phone?: string | null
          shipping_recipient?: string | null
          shipping_state?: string | null
          source?: string | null
          split_date_1?: string | null
          split_date_2?: string | null
          split_installments_1?: number | null
          split_installments_2?: number | null
          split_method_1?: string | null
          split_method_2?: string | null
          split_value_1?: number | null
          split_value_2?: number | null
          status?: string | null
          total?: number | null
          total_amount?: number | null
          updated_at?: string | null
          use_alt_shipping_address?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_consultant_history: {
        Row: {
          action: string
          changed_by: string | null
          consultant_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          previous_data: Json | null
        }
        Insert: {
          action: string
          changed_by?: string | null
          consultant_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          previous_data?: Json | null
        }
        Update: {
          action?: string
          changed_by?: string | null
          consultant_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          previous_data?: Json | null
        }
        Relationships: []
      }
      reseller_consultants: {
        Row: {
          active: boolean
          consultant_code: string
          created_at: string
          crm_user_id: string | null
          display_name: string
          display_order: number
          id: string
          is_default_fallback: boolean
          is_none_option: boolean
          received_count: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          consultant_code: string
          created_at?: string
          crm_user_id?: string | null
          display_name: string
          display_order?: number
          id?: string
          is_default_fallback?: boolean
          is_none_option?: boolean
          received_count?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          consultant_code?: string
          created_at?: string
          crm_user_id?: string | null
          display_name?: string
          display_order?: number
          id?: string
          is_default_fallback?: boolean
          is_none_option?: boolean
          received_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      reseller_rate_limit: {
        Row: {
          hit_at: string
          id: string
          ip_hash: string
        }
        Insert: {
          hit_at?: string
          id?: string
          ip_hash: string
        }
        Update: {
          hit_at?: string
          id?: string
          ip_hash?: string
        }
        Relationships: []
      }
      reseller_registration_history: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          new_assigned_user_id: string | null
          new_status: string | null
          notes: string | null
          performed_by: string | null
          performed_by_name: string | null
          previous_assigned_user_id: string | null
          previous_status: string | null
          registration_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_assigned_user_id?: string | null
          new_status?: string | null
          notes?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          previous_assigned_user_id?: string | null
          previous_status?: string | null
          registration_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_assigned_user_id?: string | null
          new_status?: string | null
          notes?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          previous_assigned_user_id?: string | null
          previous_status?: string | null
          registration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reseller_registration_history_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "reseller_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_registrations: {
        Row: {
          address_number: string | null
          assigned_user_id: string | null
          assignment_reason: string | null
          cep: string | null
          city: string | null
          client_id: string | null
          cnpj: string
          commercial_contact_consent: boolean
          company_name: string
          complement: string | null
          consultant_selected_code: string | null
          consultant_selected_label: string | null
          created_at: string
          duplicate_reason: string | null
          email: string
          external_registration_id: string | null
          form_started_at: string | null
          form_url: string | null
          how_did_you_know: string | null
          id: string
          interests: string[]
          ip_hash: string | null
          is_duplicate: boolean
          message: string | null
          neighborhood: string | null
          origin: string | null
          phone: string
          privacy_consent: boolean
          raw_payload: Json | null
          referrer: string | null
          registration_status: string
          responsible_name: string
          state: string | null
          state_registration: string | null
          street: string | null
          submitted_at: string
          trade_name: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          website: string | null
          years_in_market: string | null
        }
        Insert: {
          address_number?: string | null
          assigned_user_id?: string | null
          assignment_reason?: string | null
          cep?: string | null
          city?: string | null
          client_id?: string | null
          cnpj: string
          commercial_contact_consent?: boolean
          company_name: string
          complement?: string | null
          consultant_selected_code?: string | null
          consultant_selected_label?: string | null
          created_at?: string
          duplicate_reason?: string | null
          email: string
          external_registration_id?: string | null
          form_started_at?: string | null
          form_url?: string | null
          how_did_you_know?: string | null
          id?: string
          interests?: string[]
          ip_hash?: string | null
          is_duplicate?: boolean
          message?: string | null
          neighborhood?: string | null
          origin?: string | null
          phone: string
          privacy_consent?: boolean
          raw_payload?: Json | null
          referrer?: string | null
          registration_status?: string
          responsible_name: string
          state?: string | null
          state_registration?: string | null
          street?: string | null
          submitted_at?: string
          trade_name?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          website?: string | null
          years_in_market?: string | null
        }
        Update: {
          address_number?: string | null
          assigned_user_id?: string | null
          assignment_reason?: string | null
          cep?: string | null
          city?: string | null
          client_id?: string | null
          cnpj?: string
          commercial_contact_consent?: boolean
          company_name?: string
          complement?: string | null
          consultant_selected_code?: string | null
          consultant_selected_label?: string | null
          created_at?: string
          duplicate_reason?: string | null
          email?: string
          external_registration_id?: string | null
          form_started_at?: string | null
          form_url?: string | null
          how_did_you_know?: string | null
          id?: string
          interests?: string[]
          ip_hash?: string | null
          is_duplicate?: boolean
          message?: string | null
          neighborhood?: string | null
          origin?: string | null
          phone?: string
          privacy_consent?: boolean
          raw_payload?: Json | null
          referrer?: string | null
          registration_status?: string
          responsible_name?: string
          state?: string | null
          state_registration?: string | null
          street?: string | null
          submitted_at?: string
          trade_name?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          website?: string | null
          years_in_market?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reseller_registrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      salespeople: {
        Row: {
          active: boolean | null
          code: number | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          active?: boolean | null
          code?: number | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          active?: boolean | null
          code?: number | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      smart_opportunities: {
        Row: {
          cliente_id: string | null
          company_id: string | null
          created_at: string | null
          id: string
          motivo: string | null
          prioridade: string | null
          produto_base: string | null
          produto_sugerido: string | null
          quote_id: string | null
          status: string
          tipo_oportunidade: string
          updated_at: string | null
          vendedor_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          motivo?: string | null
          prioridade?: string | null
          produto_base?: string | null
          produto_sugerido?: string | null
          quote_id?: string | null
          status?: string
          tipo_oportunidade: string
          updated_at?: string | null
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          motivo?: string | null
          prioridade?: string | null
          produto_base?: string | null
          produto_sugerido?: string | null
          quote_id?: string | null
          status?: string
          tipo_oportunidade?: string
          updated_at?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_opportunities_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_opportunities_produto_base_fkey"
            columns: ["produto_base"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_opportunities_produto_sugerido_fkey"
            columns: ["produto_sugerido"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_opportunities_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_opportunities_vendedor_id_fkey_profiles"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      sync_execution_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          duration_ms: number | null
          errors_count: number | null
          id: string
          linked_count: number | null
          needs_validation_count: number | null
          not_found_count: number | null
          provider: string
          summary: Json | null
          targets_count: number | null
          triggered_by: string | null
          triggered_by_name: string | null
          updated_count: number | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          errors_count?: number | null
          id?: string
          linked_count?: number | null
          needs_validation_count?: number | null
          not_found_count?: number | null
          provider: string
          summary?: Json | null
          targets_count?: number | null
          triggered_by?: string | null
          triggered_by_name?: string | null
          updated_count?: number | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          errors_count?: number | null
          id?: string
          linked_count?: number | null
          needs_validation_count?: number | null
          not_found_count?: number | null
          provider?: string
          summary?: Json | null
          targets_count?: number | null
          triggered_by?: string | null
          triggered_by_name?: string | null
          updated_count?: number | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      task_activities: {
        Row: {
          activity_type: string
          created_at: string
          id: string
          new_value: string | null
          old_value: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activities_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_boards: {
        Row: {
          created_at: string
          id: string
          is_default: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_checklists: {
        Row: {
          content: string
          created_at: string
          id: string
          is_completed: boolean | null
          position: number
          task_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_completed?: boolean | null
          position?: number
          task_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_completed?: boolean | null
          position?: number
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklists_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_columns: {
        Row: {
          board_id: string
          color: string | null
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          board_id: string
          color?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          board_id?: string
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          board_id: string | null
          client_id: string | null
          column_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          position: number
          priority: string
          quote_id: string | null
          status: string
          tags: string[] | null
          task_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          board_id?: string | null
          client_id?: string | null
          column_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          priority?: string
          quote_id?: string | null
          status?: string
          tags?: string[] | null
          task_type?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          board_id?: string | null
          client_id?: string | null
          column_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          priority?: string
          quote_id?: string | null
          status?: string
          tags?: string[] | null
          task_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "task_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_brands: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      technical_budget_versions: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          discount_percent: number
          discount_scope: string
          id: string
          labor_value: number
          notes: string | null
          order_id: string
          parts_snapshot: Json
          parts_value: number
          shipping_value: number
          snapshot: Json
          total_value: number
          updated_at: string
          version: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          discount_scope?: string
          id?: string
          labor_value?: number
          notes?: string | null
          order_id: string
          parts_snapshot?: Json
          parts_value?: number
          shipping_value?: number
          snapshot?: Json
          total_value?: number
          updated_at?: string
          version?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          discount_scope?: string
          id?: string
          labor_value?: number
          notes?: string | null
          order_id?: string
          parts_snapshot?: Json
          parts_value?: number
          shipping_value?: number
          snapshot?: Json
          total_value?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "technical_budget_versions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "technical_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_budgets: {
        Row: {
          client_id: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          discount: number | null
          id: string
          notes: string | null
          status: string
          technical_order_id: string | null
          total_amount: number | null
          total_parts: number | null
          total_services: number | null
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount?: number | null
          id?: string
          notes?: string | null
          status?: string
          technical_order_id?: string | null
          total_amount?: number | null
          total_parts?: number | null
          total_services?: number | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount?: number | null
          id?: string
          notes?: string | null
          status?: string
          technical_order_id?: string | null
          total_amount?: number | null
          total_parts?: number | null
          total_services?: number | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technical_budgets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "technical_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_budgets_technical_order_id_fkey"
            columns: ["technical_order_id"]
            isOneToOne: false
            referencedRelation: "technical_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_clients: {
        Row: {
          address: string | null
          city: string | null
          company_id: string | null
          cpf_cnpj: string | null
          created_at: string
          created_by: string | null
          crm_client_id: string | null
          document_type: string | null
          email: string | null
          equipments: Json | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          state: string | null
          updated_at: string
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          crm_client_id?: string | null
          document_type?: string | null
          email?: string | null
          equipments?: Json | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          crm_client_id?: string | null
          document_type?: string | null
          email?: string | null
          equipments?: Json | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technical_clients_crm_client_id_fkey"
            columns: ["crm_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_cloud_files: {
        Row: {
          category: string | null
          company_id: string | null
          created_at: string | null
          description: string | null
          file_type: string | null
          file_url: string
          id: string
          name: string
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          file_type?: string | null
          file_url: string
          id?: string
          name: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          file_type?: string | null
          file_url?: string
          id?: string
          name?: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      technical_maintenances: {
        Row: {
          brand: string | null
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          model: string | null
          notes: string | null
          product_id: string | null
          status: string | null
          technician: string | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          model?: string | null
          notes?: string | null
          product_id?: string | null
          status?: string | null
          technician?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          model?: string | null
          notes?: string | null
          product_id?: string | null
          status?: string | null
          technician?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_maintenances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "technical_products"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_order_parts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_order_parts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "technical_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_order_parts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "technical_products"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_orders: {
        Row: {
          accessories: Json
          attachments: Json | null
          brand: string | null
          budget_sent_at: string | null
          budget_valid_days: number
          budget_version: number
          client_id: string | null
          client_name: string
          company_id: string | null
          created_at: string
          created_by: string | null
          discount_percent: number
          discount_scope: string
          entry_date: string | null
          equipment: string | null
          estimated_date: string | null
          exit_date: string | null
          handoff_quote_id: string | null
          id: string
          labor_value: number
          model: string | null
          os_number: string
          os_type: string | null
          parts_value: number
          payment_method: string | null
          payment_proof_url: string | null
          photos: Json | null
          physical_condition: string | null
          public_token: string | null
          repair_description: string | null
          reported_defect: string | null
          serial: string | null
          service_type: string | null
          services_value: number | null
          shipping_method: string | null
          shipping_value: number
          status: string
          technical_diagnosis: string | null
          technician_email: string | null
          technician_id: string | null
          technician_name: string | null
          technician_notes: string | null
          technician_phone: string | null
          total_value: number
          updated_at: string
          warranty: string | null
        }
        Insert: {
          accessories?: Json
          attachments?: Json | null
          brand?: string | null
          budget_sent_at?: string | null
          budget_valid_days?: number
          budget_version?: number
          client_id?: string | null
          client_name?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          discount_scope?: string
          entry_date?: string | null
          equipment?: string | null
          estimated_date?: string | null
          exit_date?: string | null
          handoff_quote_id?: string | null
          id?: string
          labor_value?: number
          model?: string | null
          os_number?: string
          os_type?: string | null
          parts_value?: number
          payment_method?: string | null
          payment_proof_url?: string | null
          photos?: Json | null
          physical_condition?: string | null
          public_token?: string | null
          repair_description?: string | null
          reported_defect?: string | null
          serial?: string | null
          service_type?: string | null
          services_value?: number | null
          shipping_method?: string | null
          shipping_value?: number
          status?: string
          technical_diagnosis?: string | null
          technician_email?: string | null
          technician_id?: string | null
          technician_name?: string | null
          technician_notes?: string | null
          technician_phone?: string | null
          total_value?: number
          updated_at?: string
          warranty?: string | null
        }
        Update: {
          accessories?: Json
          attachments?: Json | null
          brand?: string | null
          budget_sent_at?: string | null
          budget_valid_days?: number
          budget_version?: number
          client_id?: string | null
          client_name?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          discount_scope?: string
          entry_date?: string | null
          equipment?: string | null
          estimated_date?: string | null
          exit_date?: string | null
          handoff_quote_id?: string | null
          id?: string
          labor_value?: number
          model?: string | null
          os_number?: string
          os_type?: string | null
          parts_value?: number
          payment_method?: string | null
          payment_proof_url?: string | null
          photos?: Json | null
          physical_condition?: string | null
          public_token?: string | null
          repair_description?: string | null
          reported_defect?: string | null
          serial?: string | null
          service_type?: string | null
          services_value?: number | null
          shipping_method?: string | null
          shipping_value?: number
          status?: string
          technical_diagnosis?: string | null
          technician_email?: string | null
          technician_id?: string | null
          technician_name?: string | null
          technician_notes?: string | null
          technician_phone?: string | null
          total_value?: number
          updated_at?: string
          warranty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technical_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "technical_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_products: {
        Row: {
          brand: string | null
          category: string | null
          code: string | null
          company_id: string | null
          compatibility: string | null
          cost: number
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          location: string | null
          manufacturer: string | null
          min_quantity: number
          name: string
          notes: string | null
          price: number
          quantity: number
          unit_measure: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category?: string | null
          code?: string | null
          company_id?: string | null
          compatibility?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          manufacturer?: string | null
          min_quantity?: number
          name: string
          notes?: string | null
          price?: number
          quantity?: number
          unit_measure?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category?: string | null
          code?: string | null
          company_id?: string | null
          compatibility?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          manufacturer?: string | null
          min_quantity?: number
          name?: string
          notes?: string | null
          price?: number
          quantity?: number
          unit_measure?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      technical_purchase_order_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string | null
          purchase_order_id: string | null
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          purchase_order_id?: string | null
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          purchase_order_id?: string | null
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "technical_purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "technical_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "technical_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_purchase_orders: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          expected_delivery: string | null
          id: string
          notes: string | null
          order_type: string | null
          purchase_date: string | null
          received_at: string | null
          status: string
          supplier_id: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_type?: string | null
          purchase_date?: string | null
          received_at?: string | null
          status?: string
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_type?: string | null
          purchase_date?: string | null
          received_at?: string | null
          status?: string
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technical_purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "technical_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_services: {
        Row: {
          base_price: number | null
          category: string | null
          company_id: string | null
          created_at: string | null
          description: string | null
          estimated_time: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          base_price?: number | null
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          estimated_time?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          base_price?: number | null
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          estimated_time?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      technical_status_history: {
        Row: {
          created_at: string
          id: string
          new_status: string
          notes: string | null
          order_id: string
          performed_by: string | null
          performed_by_name: string | null
          previous_status: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          new_status: string
          notes?: string | null
          order_id: string
          performed_by?: string | null
          performed_by_name?: string | null
          previous_status?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          new_status?: string
          notes?: string | null
          order_id?: string
          performed_by?: string | null
          performed_by_name?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technical_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "technical_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_suppliers: {
        Row: {
          address: string | null
          cnpj: string | null
          company_id: string | null
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          company_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          company_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_approvals: {
        Row: {
          approved_by: string | null
          created_at: string | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          granted: boolean
          granted_by: string | null
          id: string
          permission: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          granted_by?: string | null
          id?: string
          permission: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          granted_by?: string | null
          id?: string
          permission?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          notifications_enabled: boolean
          sound_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notifications_enabled?: boolean
          sound_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notifications_enabled?: boolean
          sound_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_push_tokens: {
        Row: {
          browser: string | null
          company_id: string | null
          created_at: string
          device_info: Json | null
          device_type: string | null
          fcm_token: string
          id: string
          is_active: boolean | null
          last_seen_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          browser?: string | null
          company_id?: string | null
          created_at?: string
          device_info?: Json | null
          device_type?: string | null
          fcm_token: string
          id?: string
          is_active?: boolean | null
          last_seen_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          browser?: string | null
          company_id?: string | null
          created_at?: string
          device_info?: Json | null
          device_type?: string | null
          fcm_token?: string
          id?: string
          is_active?: boolean | null
          last_seen_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_user_permissions: { Args: { _user_id: string }; Returns: Json }
      admin_set_user_permissions: {
        Args: { _permissions: Json; _user_id: string }
        Returns: undefined
      }
      backup_export_count: {
        Args: { p_company_id?: string; p_table: string }
        Returns: number
      }
      backup_export_page: {
        Args: {
          p_company_id?: string
          p_cursor_created?: string
          p_cursor_key?: string
          p_limit?: number
          p_table: string
        }
        Returns: Json
      }
      backup_list_public_tables: {
        Args: never
        Returns: {
          has_created_at: boolean
          key_column: string
          table_name: string
        }[]
      }
      can_view_company_profile: {
        Args: { _target_company_id: string; _target_user_id: string }
        Returns: boolean
      }
      can_view_company_role: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      current_user_company_id: { Args: never; Returns: string }
      current_user_has_permission: {
        Args: { _permission: string }
        Returns: boolean
      }
      delete_quote_cascade: { Args: { p_quote_id: string }; Returns: undefined }
      diagnose_product_search: {
        Args: { p_term: string }
        Returns: {
          matches: number
          sample: Json
        }[]
      }
      generate_quote_number: { Args: never; Returns: string }
      generate_technical_os_number: { Args: never; Returns: string }
      get_commercial_summary: {
        Args: {
          p_company_id?: string
          p_end_date?: string
          p_start_date?: string
          p_user_id?: string
        }
        Returns: Json
      }
      get_current_user_access: {
        Args: never
        Returns: {
          approval_status: string
          avatar_url: string
          can_access_support_manager: boolean
          company_id: string
          force_password_change: boolean
          full_name: string
          permissions: Json
          phone: string
          role: string
          roles: string[]
        }[]
      }
      get_default_origin_cep: { Args: never; Returns: string }
      get_public_logistics_tracking: {
        Args: { p_token: string }
        Returns: Json
      }
      get_public_quote_token: { Args: never; Returns: string }
      get_public_technical_tracking: {
        Args: { p_token: string }
        Returns: Json
      }
      get_team_dashboard_recent_quotes: {
        Args: { p_limit?: number; p_owner?: string }
        Returns: {
          client_name: string
          created_at: string
          created_by: string
          id: string
          payment_method: string
          payment_status: string
          quote_number: string
          shipping_cost: number
          status: string
          total_amount: number
        }[]
      }
      get_team_dashboard_sellers: {
        Args: never
        Returns: {
          approved_count: number
          clients_count: number
          full_name: string
          pending_count: number
          quotes_count: number
          rejected_count: number
          total_value: number
          user_id: string
        }[]
      }
      get_team_dashboard_top_clients: {
        Args: { p_limit?: number; p_owner?: string }
        Returns: {
          client_id: string
          client_name: string
          quotes_count: number
          total_value: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_approved: { Args: never; Returns: boolean }
      is_financeiro: { Args: never; Returns: boolean }
      is_gestor: { Args: never; Returns: boolean }
      is_logistica: { Args: never; Returns: boolean }
      is_quote_owner: { Args: { p_quote_id: string }; Returns: boolean }
      is_support_any: { Args: never; Returns: boolean }
      is_support_manager: { Args: never; Returns: boolean }
      is_support_tech: { Args: never; Returns: boolean }
      list_reseller_assignable_users: {
        Args: never
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      list_reseller_registrations_summary: {
        Args: never
        Returns: {
          assigned_user_id: string
          assigned_user_name: string
          client_id: string
          cnpj: string
          company_name: string
          consultant_selected_label: string
          duplicate_reason: string
          id: string
          is_duplicate: boolean
          registration_status: string
          submitted_at: string
          trade_name: string
          viewed_by_me: boolean
        }[]
      }
      log_quote_payment_block: {
        Args: {
          _action: string
          _attempted_status: string
          _error_code: string
          _missing_fields: string[]
          _quote_id: string
        }
        Returns: undefined
      }
      log_reseller_registration_view: {
        Args: { p_registration_id: string }
        Returns: undefined
      }
      process_all_approved_quotes_opportunities: {
        Args: never
        Returns: number
      }
      process_smart_opportunities_diagnostics: { Args: never; Returns: Json }
      public_quote_action:
        | { Args: { p_action: string; p_token: string }; Returns: Json }
        | {
            Args: {
              p_action: string
              p_approver_name?: string
              p_token: string
            }
            Returns: Json
          }
      quote_has_presale_item: { Args: { _quote_id: string }; Returns: boolean }
      quote_payment_problem: {
        Args: { q: Database["public"]["Tables"]["quotes"]["Row"] }
        Returns: string
      }
      reseller_rate_limit_hit: {
        Args: { p_ip_hash: string; p_max?: number; p_window_seconds?: number }
        Returns: boolean
      }
      search_product_candidates:
        | {
            Args: {
              p_brand?: string
              p_category?: string
              p_limit?: number
              p_query: string
            }
            Returns: {
              brand: string
              category_principal: string
              code: string
              compatibility: string
              description: string
              id: string
              image_url: string
              name: string
              price: number
              score: number
              sku: string
            }[]
          }
        | {
            Args: {
              p_brand?: string
              p_category?: string
              p_keywords?: string[]
              p_limit?: number
              p_query: string
            }
            Returns: {
              brand: string
              category_principal: string
              code: string
              compatibility: string
              description: string
              id: string
              image_url: string
              name: string
              price: number
              score: number
              sku: string
            }[]
          }
      set_default_origin_cep: { Args: { _cep: string }; Returns: string }
      set_reseller_registration_status: {
        Args: { p_notes?: string; p_registration_id: string; p_status: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_presale_logistics: { Args: { p_quote_id: string }; Returns: string }
      transfer_reseller_registration_portfolio: {
        Args: {
          p_new_assigned_user_id: string
          p_reason?: string
          p_registration_id: string
          p_transfer_client?: boolean
        }
        Returns: Json
      }
    }
    Enums: {
      contract_signature_event_type:
        | "request_created"
        | "invitation_sent"
        | "link_opened"
        | "identity_confirmed"
        | "verification_code_sent"
        | "verification_code_validated"
        | "document_viewed"
        | "terms_accepted"
        | "signature_completed"
        | "signature_refused"
        | "request_expired"
        | "request_cancelled"
        | "document_downloaded"
      contract_signature_status:
        | "draft"
        | "ready_to_send"
        | "sent"
        | "viewed"
        | "awaiting_signature"
        | "signed"
        | "refused"
        | "expired"
        | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      contract_signature_event_type: [
        "request_created",
        "invitation_sent",
        "link_opened",
        "identity_confirmed",
        "verification_code_sent",
        "verification_code_validated",
        "document_viewed",
        "terms_accepted",
        "signature_completed",
        "signature_refused",
        "request_expired",
        "request_cancelled",
        "document_downloaded",
      ],
      contract_signature_status: [
        "draft",
        "ready_to_send",
        "sent",
        "viewed",
        "awaiting_signature",
        "signed",
        "refused",
        "expired",
        "cancelled",
      ],
    },
  },
} as const
