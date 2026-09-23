
-- 1) Quotes: restrict public-token updates to status-related fields only
CREATE OR REPLACE FUNCTION public.restrict_public_quote_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce restriction for anonymous (public-token) updates.
  IF auth.uid() IS NULL THEN
    IF NEW.quote_number       IS DISTINCT FROM OLD.quote_number
    OR NEW.client_id          IS DISTINCT FROM OLD.client_id
    OR NEW.client_name        IS DISTINCT FROM OLD.client_name
    OR NEW.salesperson        IS DISTINCT FROM OLD.salesperson
    OR NEW.salesperson_id     IS DISTINCT FROM OLD.salesperson_id
    OR NEW.quote_date         IS DISTINCT FROM OLD.quote_date
    OR NEW.total              IS DISTINCT FROM OLD.total
    OR NEW.total_amount       IS DISTINCT FROM OLD.total_amount
    OR NEW.discount           IS DISTINCT FROM OLD.discount
    OR NEW.notes              IS DISTINCT FROM OLD.notes
    OR NEW.created_by         IS DISTINCT FROM OLD.created_by
    OR NEW.payment_terms      IS DISTINCT FROM OLD.payment_terms
    OR NEW.payment_method     IS DISTINCT FROM OLD.payment_method
    OR NEW.payment_status     IS DISTINCT FROM OLD.payment_status
    OR NEW.payment_date       IS DISTINCT FROM OLD.payment_date
    OR NEW.installments       IS DISTINCT FROM OLD.installments
    OR NEW.is_split_payment   IS DISTINCT FROM OLD.is_split_payment
    OR NEW.split_method_1     IS DISTINCT FROM OLD.split_method_1
    OR NEW.split_value_1      IS DISTINCT FROM OLD.split_value_1
    OR NEW.split_date_1       IS DISTINCT FROM OLD.split_date_1
    OR NEW.split_installments_1 IS DISTINCT FROM OLD.split_installments_1
    OR NEW.split_method_2     IS DISTINCT FROM OLD.split_method_2
    OR NEW.split_value_2      IS DISTINCT FROM OLD.split_value_2
    OR NEW.split_date_2       IS DISTINCT FROM OLD.split_date_2
    OR NEW.split_installments_2 IS DISTINCT FROM OLD.split_installments_2
    OR NEW.shipping_cost      IS DISTINCT FROM OLD.shipping_cost
    OR NEW.shipping_method    IS DISTINCT FROM OLD.shipping_method
    OR NEW.shipping_deadline  IS DISTINCT FROM OLD.shipping_deadline
    OR NEW.proposal_validity  IS DISTINCT FROM OLD.proposal_validity
    OR NEW.public_token       IS DISTINCT FROM OLD.public_token
    OR NEW.is_reseller        IS DISTINCT FROM OLD.is_reseller
    OR NEW.source             IS DISTINCT FROM OLD.source
    OR NEW.external_order_id  IS DISTINCT FROM OLD.external_order_id
    OR NEW.external_status    IS DISTINCT FROM OLD.external_status
    OR NEW.use_alt_shipping_address IS DISTINCT FROM OLD.use_alt_shipping_address
    OR NEW.shipping_recipient IS DISTINCT FROM OLD.shipping_recipient
    OR NEW.shipping_cep       IS DISTINCT FROM OLD.shipping_cep
    OR NEW.shipping_address   IS DISTINCT FROM OLD.shipping_address
    OR NEW.shipping_address_number IS DISTINCT FROM OLD.shipping_address_number
    OR NEW.shipping_complement IS DISTINCT FROM OLD.shipping_complement
    OR NEW.shipping_neighborhood IS DISTINCT FROM OLD.shipping_neighborhood
    OR NEW.shipping_city      IS DISTINCT FROM OLD.shipping_city
    OR NEW.shipping_state     IS DISTINCT FROM OLD.shipping_state
    OR NEW.shipping_phone     IS DISTINCT FROM OLD.shipping_phone
    OR NEW.shipping_notes     IS DISTINCT FROM OLD.shipping_notes
    OR NEW.followup_date      IS DISTINCT FROM OLD.followup_date
    OR NEW.company_id         IS DISTINCT FROM OLD.company_id
    OR NEW.is_demonstration   IS DISTINCT FROM OLD.is_demonstration
    OR NEW.demonstration_start_date IS DISTINCT FROM OLD.demonstration_start_date
    OR NEW.demonstration_end_date   IS DISTINCT FROM OLD.demonstration_end_date
    THEN
      RAISE EXCEPTION 'Public quote token may only change status fields'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_public_quote_update ON public.quotes;
CREATE TRIGGER trg_restrict_public_quote_update
BEFORE UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.restrict_public_quote_update();

-- 2) Salespeople: hide email/phone from regular approved users via column privileges
REVOKE SELECT ON public.salespeople FROM authenticated;
GRANT SELECT (id, name, code, active, created_at) ON public.salespeople TO authenticated;
-- service_role keeps full access for edge functions/admin flows
GRANT ALL ON public.salespeople TO service_role;
