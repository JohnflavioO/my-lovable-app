CREATE OR REPLACE FUNCTION public.prevent_support_client_field_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_support_any() AND NOT (public.is_admin() OR public.is_gestor()) THEN
    -- Whitelist: support-only users may change contact fields ONLY.
    -- Every other column is forcibly reset to its previous value.
    NEW.id := OLD.id;
    NEW.name := OLD.name;
    NEW.company := OLD.company;
    NEW.company_name := OLD.company_name;
    NEW.cpf_cnpj := OLD.cpf_cnpj;
    NEW.notes := OLD.notes;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.company_id := OLD.company_id;
    NEW.pipeline_stage := OLD.pipeline_stage;
    NEW.last_interaction_at := OLD.last_interaction_at;
    NEW.is_revenda := OLD.is_revenda;
    NEW.client_type := OLD.client_type;
    NEW.contrib_icms := OLD.contrib_icms;
    NEW.salesperson_id := OLD.salesperson_id;
    NEW.source := OLD.source;
    NEW.source_label := OLD.source_label;
    NEW.assigned_user_id := OLD.assigned_user_id;
    NEW.assigned_at := OLD.assigned_at;
    NEW.received_at := OLD.received_at;
    NEW.is_new_registration := OLD.is_new_registration;
    NEW.registration_status := OLD.registration_status;
    NEW.external_registration_id := OLD.external_registration_id;
    -- Editable by support: email, phone, contact_name, contact_phone, is_whatsapp,
    -- address, address_number, complement, neighborhood, city, state, cep, updated_at
  END IF;
  RETURN NEW;
END;
$function$;