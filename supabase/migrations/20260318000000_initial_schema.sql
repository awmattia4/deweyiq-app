CREATE TYPE public.customer_status AS ENUM (
    'active',
    'paused',
    'cancelled'
);
CREATE TYPE public.pool_surface AS ENUM (
    'plaster',
    'pebble',
    'fiberglass',
    'vinyl',
    'tile'
);
CREATE TYPE public.pool_type AS ENUM (
    'pool',
    'spa',
    'fountain'
);
CREATE TYPE public.sanitizer_type AS ENUM (
    'chlorine',
    'salt',
    'bromine',
    'biguanide'
);
CREATE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
    DECLARE
      claims jsonb;
      app_metadata jsonb;
      org_id text;
      user_role text;
    BEGIN
      claims := event -> 'claims';
      app_metadata := claims -> 'app_metadata';
      org_id := app_metadata ->> 'org_id';
      user_role := app_metadata ->> 'role';
      IF org_id IS NOT NULL THEN
        claims := jsonb_set(claims, '{org_id}', to_jsonb(org_id));
      END IF;
      IF user_role IS NOT NULL THEN
        claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
      END IF;
      RETURN jsonb_set(event, '{claims}', claims);
    END;
    $$;
CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    DECLARE
      new_org_id uuid;
      company_name text;
      full_name text;
    BEGIN
      IF NEW.raw_app_meta_data ->> 'org_id' IS NOT NULL THEN
        RETURN NEW;
      END IF;
      company_name := COALESCE(
        NEW.raw_user_meta_data ->> 'company_name',
        NEW.email
      );
      full_name := COALESCE(
        NEW.raw_user_meta_data ->> 'full_name',
        split_part(NEW.email, '@', 1)
      );
      INSERT INTO public.orgs (name)
      VALUES (company_name)
      RETURNING id INTO new_org_id;
      INSERT INTO public.profiles (id, org_id, full_name, email, role)
      VALUES (NEW.id, new_org_id, full_name, NEW.email, 'owner');
      -- Also create org_settings row
      INSERT INTO public.org_settings (org_id)
      VALUES (new_org_id);
      UPDATE auth.users
      SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'org_id', new_org_id::text,
        'role', 'owner'
      )
      WHERE id = NEW.id;
      RETURN NEW;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user failed for user %: % %', NEW.id, SQLERRM, SQLSTATE;
        RETURN NEW;
    END;
    $$;
CREATE TABLE public.accounting_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    closed_at timestamp with time zone,
    closed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    alert_type text NOT NULL,
    severity text DEFAULT 'warning'::text NOT NULL,
    reference_id uuid,
    reference_type text,
    title text NOT NULL,
    description text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    dismissed_at timestamp with time zone,
    snoozed_until timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    plaid_item_id text NOT NULL,
    plaid_access_token text NOT NULL,
    plaid_cursor text,
    plaid_account_id text NOT NULL,
    account_name text NOT NULL,
    account_type text NOT NULL,
    mask text,
    institution_name text,
    current_balance numeric(12,2),
    available_balance numeric(12,2),
    chart_of_accounts_id uuid,
    last_synced_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.bank_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    bank_account_id uuid NOT NULL,
    plaid_transaction_id text NOT NULL,
    amount numeric(12,2) NOT NULL,
    date text NOT NULL,
    name text,
    merchant_name text,
    category text,
    pending boolean DEFAULT false NOT NULL,
    status text DEFAULT 'unmatched'::text NOT NULL,
    matched_entry_id uuid,
    matched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.break_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    time_entry_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    is_auto_detected boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.chart_of_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    account_number text NOT NULL,
    account_name text NOT NULL,
    account_type text NOT NULL,
    display_name text NOT NULL,
    parent_id uuid,
    is_system boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.checklist_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    template_id uuid,
    customer_id uuid,
    label text NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    requires_photo boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    suppresses_task_id uuid
);
CREATE TABLE public.checklist_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    service_type text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.chemical_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    chemical_type text NOT NULL,
    concentration_pct real,
    unit text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cost_per_unit numeric(10,4)
);
CREATE TABLE public.customer_credits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text NOT NULL,
    source_type text DEFAULT 'goodwill'::text NOT NULL,
    source_id uuid,
    applied_to_invoice_id uuid,
    status text DEFAULT 'available'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    full_name text NOT NULL,
    address text,
    phone text,
    email text,
    gate_code text,
    access_notes text,
    status public.customer_status DEFAULT 'active'::public.customer_status NOT NULL,
    assigned_tech_id uuid,
    route_name text,
    lat double precision,
    lng double precision,
    notifications_enabled boolean DEFAULT true NOT NULL,
    tax_exempt boolean DEFAULT false NOT NULL,
    billing_model text,
    flat_rate_amount numeric(10,2),
    stripe_customer_id text,
    autopay_enabled boolean DEFAULT false NOT NULL,
    autopay_method_id text,
    qbo_customer_id text,
    overdue_balance numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.dunning_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    max_retries integer DEFAULT 3 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.employee_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tech_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time text NOT NULL,
    end_time text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.employee_blocked_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tech_id uuid NOT NULL,
    blocked_date date NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.employee_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tech_id uuid NOT NULL,
    doc_type text NOT NULL,
    doc_name text NOT NULL,
    file_url text,
    expires_at date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    pool_id uuid NOT NULL,
    type text NOT NULL,
    brand text,
    model text,
    install_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.equipment_readings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    equipment_id uuid NOT NULL,
    pool_id uuid NOT NULL,
    service_visit_id uuid,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    metrics jsonb NOT NULL,
    recorded_by_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    category text NOT NULL,
    description text,
    date date NOT NULL,
    receipt_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    vendor_name text
);
CREATE TABLE public.holidays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    date text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    description text NOT NULL,
    item_type text DEFAULT 'part'::text NOT NULL,
    quantity numeric(10,3) DEFAULT '1'::numeric NOT NULL,
    unit text DEFAULT 'each'::text NOT NULL,
    unit_price numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    discount_type text,
    discount_value numeric(10,2),
    is_taxable boolean DEFAULT true NOT NULL,
    line_total numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    visit_id uuid,
    stop_date date
);
CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    invoice_number text,
    status text DEFAULT 'draft'::text NOT NULL,
    work_order_ids jsonb,
    customer_id uuid NOT NULL,
    subtotal numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    tax_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    discount_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    notes text,
    issued_at timestamp with time zone,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    billing_model text,
    billing_period_start date,
    billing_period_end date,
    due_date date,
    stripe_payment_intent_id text,
    payment_method text,
    surcharge_amount numeric(10,2),
    qbo_invoice_id text,
    sent_at timestamp with time zone,
    sent_sms_at timestamp with time zone,
    project_id uuid,
    invoice_type text DEFAULT 'service'::text NOT NULL,
    project_milestone_id uuid,
    retainage_held numeric(12,2),
    retainage_released numeric(12,2)
);
CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    entry_date date NOT NULL,
    description text NOT NULL,
    source_type text NOT NULL,
    source_id text,
    is_posted boolean DEFAULT true NOT NULL,
    is_reversed boolean DEFAULT false NOT NULL,
    reversal_of uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.journal_entry_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    journal_entry_id uuid NOT NULL,
    account_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.mileage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tech_id uuid NOT NULL,
    work_date text NOT NULL,
    origin_address text,
    destination_address text,
    purpose text,
    miles numeric(8,2) NOT NULL,
    rate_per_mile numeric(6,4) DEFAULT 0.7250 NOT NULL,
    is_auto_calculated boolean DEFAULT false NOT NULL,
    time_entry_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    notification_type text NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    in_app_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.notification_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    template_type text NOT NULL,
    subject text,
    body_html text,
    sms_text text,
    enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.org_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    pre_arrival_sms_enabled boolean DEFAULT true NOT NULL,
    pre_arrival_email_enabled boolean DEFAULT true NOT NULL,
    service_report_email_enabled boolean DEFAULT true NOT NULL,
    alert_missed_stop_enabled boolean DEFAULT true NOT NULL,
    alert_declining_chemistry_enabled boolean DEFAULT true NOT NULL,
    alert_incomplete_data_enabled boolean DEFAULT true NOT NULL,
    required_chemistry_by_sanitizer jsonb,
    required_checklist_task_ids jsonb,
    report_include_chemistry boolean DEFAULT true NOT NULL,
    report_include_checklist boolean DEFAULT true NOT NULL,
    report_include_photos boolean DEFAULT true NOT NULL,
    report_include_tech_name boolean DEFAULT true NOT NULL,
    custom_chemistry_targets jsonb,
    home_base_address text,
    home_base_lat double precision,
    home_base_lng double precision,
    default_hourly_rate numeric(10,2),
    default_parts_markup_pct numeric(5,2) DEFAULT '30'::numeric,
    default_tax_rate numeric(5,4) DEFAULT 0.0875,
    default_quote_expiry_days integer DEFAULT 30,
    invoice_number_prefix text DEFAULT 'INV'::text,
    next_invoice_number integer DEFAULT 1 NOT NULL,
    quote_number_prefix text DEFAULT 'Q'::text,
    next_quote_number integer DEFAULT 1 NOT NULL,
    quote_terms_and_conditions text,
    wo_notify_office_on_flag boolean DEFAULT true NOT NULL,
    wo_notify_customer_on_scheduled boolean DEFAULT true NOT NULL,
    wo_notify_customer_on_complete boolean DEFAULT true NOT NULL,
    stripe_account_id text,
    stripe_onboarding_done boolean DEFAULT false NOT NULL,
    qbo_realm_id text,
    qbo_access_token text,
    qbo_refresh_token text,
    qbo_token_expires_at timestamp with time zone,
    qbo_last_sync_at timestamp with time zone,
    qbo_connected boolean DEFAULT false NOT NULL,
    payment_provider text DEFAULT 'none'::text NOT NULL,
    cc_surcharge_pct numeric(5,4),
    cc_surcharge_enabled boolean DEFAULT false NOT NULL,
    default_payment_terms_days integer DEFAULT 30 NOT NULL,
    invoice_footer_text text,
    google_review_url text,
    website_url text,
    social_media_urls jsonb,
    custom_email_footer text,
    custom_sms_signature text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    brand_color text,
    favicon_path text,
    portal_welcome_message text,
    chem_profit_margin_threshold_pct numeric(5,2) DEFAULT '20'::numeric,
    wo_upsell_commission_pct numeric(5,2) DEFAULT '0'::numeric,
    safety_timeout_minutes integer DEFAULT 30 NOT NULL,
    safety_escalation_chain jsonb DEFAULT '[{"role": "owner", "delay_minutes": 0}]'::jsonb,
    time_tracking_enabled boolean DEFAULT false NOT NULL,
    geofence_radius_meters integer DEFAULT 100 NOT NULL,
    break_auto_detect_minutes integer DEFAULT 30 NOT NULL,
    pay_period_type text DEFAULT 'bi_weekly'::text NOT NULL,
    overtime_threshold_hours integer DEFAULT 40 NOT NULL,
    accountant_mode_enabled boolean DEFAULT false NOT NULL,
    accounting_start_date date,
    broadcast_history jsonb,
    mileage_irs_rate numeric(6,4) DEFAULT 0.7250,
    mileage_road_factor numeric(4,2) DEFAULT 1.20,
    sales_tax_rates jsonb,
    project_inactivity_alert_days integer DEFAULT 7 NOT NULL
);
CREATE TABLE public.orgs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text,
    logo_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.parts_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    sku text,
    default_cost_price numeric(10,2),
    default_sell_price numeric(10,2),
    default_unit text,
    is_labor boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.payment_plan_installments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    payment_plan_id uuid NOT NULL,
    installment_number integer NOT NULL,
    due_date date NOT NULL,
    amount numeric(12,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_record_id uuid,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.payment_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    installment_count integer NOT NULL,
    installment_amount numeric(12,2) NOT NULL,
    frequency text DEFAULT 'monthly'::text NOT NULL,
    start_date date NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.payment_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    method text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    stripe_payment_intent_id text,
    qbo_payment_id text,
    settled_at timestamp with time zone,
    failure_reason text,
    attempt_count integer DEFAULT 1 NOT NULL,
    next_retry_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.pools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    name text NOT NULL,
    type public.pool_type DEFAULT 'pool'::public.pool_type NOT NULL,
    volume_gallons integer,
    surface_type public.pool_surface,
    sanitizer_type public.sanitizer_type,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.portal_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    service_request_id uuid,
    sender_role text NOT NULL,
    sender_name text NOT NULL,
    body text,
    photo_path text,
    read_by_office_at timestamp with time zone,
    read_by_customer_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id uuid
);
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    org_id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pay_type text DEFAULT 'per_stop'::text,
    pay_rate numeric(10,2),
    qbo_employee_id text
);
CREATE TABLE public.project_change_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    change_order_number text,
    description text NOT NULL,
    reason text DEFAULT 'scope_change'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    cost_impact numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    schedule_impact_days integer DEFAULT 0 NOT NULL,
    cost_allocation text DEFAULT 'add_to_final'::text NOT NULL,
    line_items jsonb,
    issue_flag_id uuid,
    approved_at timestamp with time zone,
    approved_signature text,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    document_type text DEFAULT 'other'::text NOT NULL,
    file_path text NOT NULL,
    file_name text NOT NULL,
    uploaded_by uuid,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_equipment_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    equipment_description text NOT NULL,
    assigned_date text NOT NULL,
    returned_date text,
    assigned_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_inspections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    phase_id uuid,
    inspection_type text NOT NULL,
    scheduled_date text,
    actual_date text,
    inspector_name text,
    inspector_contact text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    result_notes text,
    correction_tasks jsonb,
    documents jsonb,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_issue_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    phase_id uuid,
    task_id uuid,
    flagged_by uuid NOT NULL,
    title text NOT NULL,
    description text,
    severity text DEFAULT 'medium'::text NOT NULL,
    photo_urls jsonb,
    status text DEFAULT 'open'::text NOT NULL,
    change_order_id uuid,
    alert_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_material_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    material_id uuid NOT NULL,
    po_id uuid,
    quantity_received numeric(10,3) NOT NULL,
    received_by uuid,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    photo_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_material_returns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    material_id uuid NOT NULL,
    quantity_returned numeric(10,3) NOT NULL,
    return_reason text,
    credit_amount numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    returned_by uuid,
    returned_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_material_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    material_id uuid NOT NULL,
    project_id uuid NOT NULL,
    phase_id uuid,
    logged_by uuid,
    quantity_used numeric(10,3) NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    proposal_line_item_id uuid,
    name text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    quantity_estimated numeric(10,3) DEFAULT '0'::numeric NOT NULL,
    quantity_ordered numeric(10,3) DEFAULT '0'::numeric NOT NULL,
    quantity_received numeric(10,3) DEFAULT '0'::numeric NOT NULL,
    quantity_used numeric(10,3) DEFAULT '0'::numeric NOT NULL,
    unit text DEFAULT 'each'::text NOT NULL,
    unit_cost_estimated numeric(12,2),
    unit_cost_actual numeric(12,2),
    supplier text,
    order_status text DEFAULT 'not_ordered'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_payment_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    proposal_id uuid,
    name text NOT NULL,
    trigger_phase_id uuid,
    percentage numeric(5,2),
    amount numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    due_date text,
    invoice_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_permits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    permit_type text NOT NULL,
    permit_number text,
    status text DEFAULT 'not_applied'::text NOT NULL,
    applied_date text,
    approved_date text,
    expiration_date text,
    inspector_name text,
    inspector_phone text,
    fee numeric(12,2),
    documents jsonb,
    notes text,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_phase_subcontractors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    phase_id uuid NOT NULL,
    subcontractor_id uuid NOT NULL,
    scope_of_work text,
    agreed_price numeric(12,2),
    status text DEFAULT 'not_started'::text NOT NULL,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    amount_paid numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    lien_waiver_path text,
    scheduled_start text,
    scheduled_end text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_phase_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    phase_id uuid NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_completed boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    completed_by uuid,
    notes text,
    is_required boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_phases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    dependency_phase_id uuid,
    dependency_type text DEFAULT 'hard'::text,
    assigned_tech_id uuid,
    estimated_start_date text,
    estimated_end_date text,
    actual_start_date text,
    actual_end_date text,
    estimated_labor_hours numeric(8,2),
    actual_labor_hours numeric(8,2),
    is_outdoor boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    phase_id uuid,
    task_id uuid,
    tag text DEFAULT 'during'::text NOT NULL,
    file_path text NOT NULL,
    thumbnail_path text,
    caption text,
    taken_by uuid,
    taken_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_po_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    po_id uuid NOT NULL,
    material_id uuid,
    quantity numeric(10,3) DEFAULT '1'::numeric NOT NULL,
    unit_price numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_proposal_addons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    proposal_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    is_selected boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_proposal_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    proposal_id uuid NOT NULL,
    tier_id uuid,
    category text DEFAULT 'material'::text NOT NULL,
    description text NOT NULL,
    quantity numeric(10,3) DEFAULT '1'::numeric NOT NULL,
    unit_price numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    markup_pct numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_proposal_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    proposal_id uuid NOT NULL,
    tier_level text NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    features jsonb,
    photo_urls jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    pricing_method text DEFAULT 'lump_sum'::text NOT NULL,
    show_line_item_detail boolean DEFAULT true NOT NULL,
    scope_description text,
    terms_and_conditions text,
    warranty_info text,
    cancellation_policy text,
    selected_tier text,
    signature_data_url text,
    signed_at timestamp with time zone,
    signed_name text,
    signed_ip text,
    approved_at timestamp with time zone,
    sent_at timestamp with time zone,
    total_amount numeric(12,2) DEFAULT '0'::numeric,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_punch_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    item_description text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    assigned_to uuid,
    photo_urls jsonb,
    resolution_notes text,
    resolved_at timestamp with time zone,
    customer_accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    po_number text,
    supplier_name text NOT NULL,
    supplier_contact text,
    status text DEFAULT 'draft'::text NOT NULL,
    total_amount numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_surveys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    route_stop_id uuid,
    surveyed_by uuid,
    surveyed_at timestamp with time zone,
    measurements jsonb,
    existing_conditions jsonb,
    access_constraints text,
    utility_locations text,
    hoa_requirements text,
    photos jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    project_type text DEFAULT 'renovation'::text NOT NULL,
    default_phases jsonb,
    default_payment_schedule jsonb,
    tier_config jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_time_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    phase_id uuid,
    task_id uuid,
    tech_id uuid NOT NULL,
    time_entry_id uuid,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    duration_minutes integer,
    entry_type text DEFAULT 'timer'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_warranty_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_type text NOT NULL,
    warranty_type text NOT NULL,
    duration_months integer NOT NULL,
    what_covered text NOT NULL,
    exclusions text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    pool_id uuid,
    project_number text,
    name text NOT NULL,
    project_type text DEFAULT 'renovation'::text NOT NULL,
    template_id uuid,
    stage text DEFAULT 'lead'::text NOT NULL,
    stage_entered_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'active'::text NOT NULL,
    on_hold_reason text,
    suspended_at timestamp with time zone,
    contract_amount numeric(12,2),
    retainage_pct numeric(5,2) DEFAULT '10'::numeric,
    estimated_start_date text,
    estimated_completion_date text,
    actual_start_date text,
    actual_completion_date text,
    site_notes jsonb,
    lead_source text,
    lead_notes text,
    financing_status text,
    activity_log jsonb,
    last_activity_at timestamp with time zone,
    cancellation_policy jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.proposal_change_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    proposal_id uuid NOT NULL,
    customer_notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.pto_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tech_id uuid NOT NULL,
    pto_type text NOT NULL,
    balance_hours numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    accrual_rate_hours numeric(8,2) DEFAULT '0'::numeric NOT NULL,
    last_accrual_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.pto_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tech_id uuid NOT NULL,
    pto_type text NOT NULL,
    start_date text NOT NULL,
    end_date text NOT NULL,
    hours numeric(8,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    device_hint text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);
CREATE TABLE public.quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    work_order_id uuid NOT NULL,
    quote_number text,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    expires_at timestamp with time zone,
    approved_at timestamp with time zone,
    signature_name text,
    approved_optional_item_ids jsonb,
    declined_at timestamp with time zone,
    decline_reason text,
    change_note text,
    snapshot_json jsonb,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.route_days (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tech_id uuid,
    date date NOT NULL,
    stop_order jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.route_stops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tech_id uuid,
    customer_id uuid NOT NULL,
    pool_id uuid,
    schedule_rule_id uuid,
    work_order_id uuid,
    checklist_template_id uuid,
    scheduled_date text NOT NULL,
    sort_index integer NOT NULL,
    position_locked boolean DEFAULT false NOT NULL,
    window_start time without time zone,
    window_end time without time zone,
    status text DEFAULT 'scheduled'::text NOT NULL,
    pre_arrival_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    eta_sms_count smallint DEFAULT 0 NOT NULL,
    eta_previous_minutes integer,
    stop_type text DEFAULT 'service'::text NOT NULL,
    project_id uuid
);
CREATE TABLE public.schedule_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    pool_id uuid,
    tech_id uuid,
    frequency text NOT NULL,
    custom_interval_days integer,
    anchor_date text NOT NULL,
    preferred_day_of_week integer,
    checklist_template_id uuid,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.service_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    pool_id uuid,
    work_order_id uuid,
    category text NOT NULL,
    description text NOT NULL,
    is_urgent boolean DEFAULT false NOT NULL,
    photo_paths jsonb DEFAULT '[]'::jsonb,
    preferred_date text,
    preferred_time_window text,
    status text DEFAULT 'submitted'::text NOT NULL,
    office_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.service_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    pool_id uuid,
    tech_id uuid,
    visit_type text,
    visited_at timestamp with time zone NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    chemistry_readings jsonb,
    checklist_completion jsonb,
    photo_urls jsonb,
    status text,
    skip_reason text,
    report_html text,
    completed_at timestamp with time zone,
    email_sent_at timestamp with time zone,
    dosing_amounts jsonb,
    internal_notes text,
    internal_flags jsonb
);
CREATE TABLE public.subcontractors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    trade text DEFAULT 'other'::text NOT NULL,
    contact_name text,
    email text,
    phone text,
    address text,
    insurance_cert_path text,
    insurance_expiry text,
    license_number text,
    license_expiry text,
    payment_terms text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.time_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tech_id uuid NOT NULL,
    work_date text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    clocked_in_at timestamp with time zone NOT NULL,
    clocked_out_at timestamp with time zone,
    clock_in_lat double precision,
    clock_in_lng double precision,
    clock_out_lat double precision,
    clock_out_lng double precision,
    total_minutes integer,
    break_minutes integer DEFAULT 0,
    notes text,
    qbo_time_activity_id text,
    qbo_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    approved_by uuid
);
CREATE TABLE public.time_entry_stops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    time_entry_id uuid NOT NULL,
    route_stop_id uuid NOT NULL,
    arrived_at timestamp with time zone,
    departed_at timestamp with time zone,
    onsite_minutes integer,
    drive_minutes_to_stop integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.user_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    notification_type text NOT NULL,
    urgency text DEFAULT 'informational'::text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    read_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.vendor_bills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    bill_number text,
    bill_date date NOT NULL,
    due_date date NOT NULL,
    description text NOT NULL,
    amount numeric(12,2) NOT NULL,
    category_account_id uuid,
    status text DEFAULT 'unpaid'::text NOT NULL,
    scheduled_date date,
    payment_method text,
    payment_reference text,
    paid_at timestamp with time zone,
    paid_by uuid,
    journal_entry_id uuid,
    payment_journal_entry_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.vendors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    vendor_name text NOT NULL,
    contact_email text,
    contact_phone text,
    address text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.visit_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_id uuid NOT NULL,
    org_id uuid NOT NULL,
    storage_path text NOT NULL,
    tag text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.warranty_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    warranty_term_id uuid,
    work_order_id uuid,
    customer_description text NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    resolution_notes text,
    is_warranty_covered boolean DEFAULT true NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.weather_reschedule_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    affected_date text NOT NULL,
    weather_type text NOT NULL,
    weather_label text NOT NULL,
    forecast_data jsonb,
    affected_stops jsonb DEFAULT '[]'::jsonb NOT NULL,
    proposed_reschedules jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notify_customers boolean DEFAULT true NOT NULL,
    excluded_customer_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    approved_at timestamp with time zone,
    approved_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.wo_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    default_priority text DEFAULT 'normal'::text NOT NULL,
    line_items_snapshot jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.work_order_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    work_order_id uuid NOT NULL,
    catalog_item_id uuid,
    description text NOT NULL,
    item_type text DEFAULT 'part'::text NOT NULL,
    labor_type text,
    quantity numeric(10,3) DEFAULT '1'::numeric NOT NULL,
    unit text DEFAULT 'each'::text NOT NULL,
    unit_cost numeric(10,2),
    unit_price numeric(10,2),
    markup_pct numeric(5,2),
    discount_type text,
    discount_value numeric(10,2),
    is_taxable boolean DEFAULT true NOT NULL,
    is_optional boolean DEFAULT false NOT NULL,
    actual_hours numeric(6,2),
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.work_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    pool_id uuid,
    created_by_id uuid,
    assigned_tech_id uuid,
    parent_wo_id uuid,
    title text NOT NULL,
    description text,
    category text DEFAULT 'other'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    severity text,
    target_date text,
    completed_at timestamp with time zone,
    completion_notes text,
    completion_photo_paths jsonb,
    cancelled_at timestamp with time zone,
    cancelled_by_id uuid,
    cancel_reason text,
    flagged_by_tech_id uuid,
    flagged_from_visit_id uuid,
    tax_exempt boolean DEFAULT false NOT NULL,
    discount_type text,
    discount_value numeric(10,2),
    discount_reason text,
    labor_hours numeric(6,2),
    labor_rate numeric(10,2),
    labor_actual_hours numeric(6,2),
    template_id uuid,
    activity_log jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_org_type_ref_unique UNIQUE (org_id, alert_type, reference_id);
ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_plaid_account_unique UNIQUE (plaid_account_id);
ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_plaid_transaction_id_unique UNIQUE (plaid_transaction_id);
ALTER TABLE ONLY public.break_events
    ADD CONSTRAINT break_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.checklist_tasks
    ADD CONSTRAINT checklist_tasks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.chemical_products
    ADD CONSTRAINT chemical_products_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customer_credits
    ADD CONSTRAINT customer_credits_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.dunning_config
    ADD CONSTRAINT dunning_config_org_unique UNIQUE (org_id);
ALTER TABLE ONLY public.dunning_config
    ADD CONSTRAINT dunning_config_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.employee_availability
    ADD CONSTRAINT employee_availability_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.employee_blocked_dates
    ADD CONSTRAINT employee_blocked_dates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT employee_documents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.equipment_readings
    ADD CONSTRAINT equipment_readings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_org_date_unique UNIQUE (org_id, date);
ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.mileage_logs
    ADD CONSTRAINT mileage_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_prefs_user_org_type_unique UNIQUE (user_id, org_id, notification_type);
ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_org_type_unique UNIQUE (org_id, template_type);
ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.org_settings
    ADD CONSTRAINT org_settings_org_unique UNIQUE (org_id);
ALTER TABLE ONLY public.org_settings
    ADD CONSTRAINT org_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.orgs
    ADD CONSTRAINT orgs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.orgs
    ADD CONSTRAINT orgs_slug_unique UNIQUE (slug);
ALTER TABLE ONLY public.parts_catalog
    ADD CONSTRAINT parts_catalog_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.payment_plan_installments
    ADD CONSTRAINT payment_plan_installments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.payment_plans
    ADD CONSTRAINT payment_plans_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.payment_records
    ADD CONSTRAINT payment_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pools
    ADD CONSTRAINT pools_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_change_orders
    ADD CONSTRAINT project_change_orders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_documents
    ADD CONSTRAINT project_documents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_equipment_assignments
    ADD CONSTRAINT project_equipment_assignments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_inspections
    ADD CONSTRAINT project_inspections_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_issue_flags
    ADD CONSTRAINT project_issue_flags_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_material_receipts
    ADD CONSTRAINT project_material_receipts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_material_returns
    ADD CONSTRAINT project_material_returns_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_material_usage
    ADD CONSTRAINT project_material_usage_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_materials
    ADD CONSTRAINT project_materials_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_payment_milestones
    ADD CONSTRAINT project_payment_milestones_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_permits
    ADD CONSTRAINT project_permits_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_phase_subcontractors
    ADD CONSTRAINT project_phase_subcontractors_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_phase_tasks
    ADD CONSTRAINT project_phase_tasks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_phases
    ADD CONSTRAINT project_phases_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_photos
    ADD CONSTRAINT project_photos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_po_line_items
    ADD CONSTRAINT project_po_line_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_proposal_addons
    ADD CONSTRAINT project_proposal_addons_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_proposal_line_items
    ADD CONSTRAINT project_proposal_line_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_proposal_tiers
    ADD CONSTRAINT project_proposal_tiers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_proposals
    ADD CONSTRAINT project_proposals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_punch_list
    ADD CONSTRAINT project_punch_list_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_purchase_orders
    ADD CONSTRAINT project_purchase_orders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_surveys
    ADD CONSTRAINT project_surveys_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_templates
    ADD CONSTRAINT project_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_time_logs
    ADD CONSTRAINT project_time_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_warranty_terms
    ADD CONSTRAINT project_warranty_terms_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.proposal_change_requests
    ADD CONSTRAINT proposal_change_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pto_balances
    ADD CONSTRAINT pto_balances_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pto_requests
    ADD CONSTRAINT pto_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint);
ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.route_days
    ADD CONSTRAINT route_days_org_tech_date_unique UNIQUE (org_id, tech_id, date);
ALTER TABLE ONLY public.route_days
    ADD CONSTRAINT route_days_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_org_customer_pool_date_unique UNIQUE (org_id, customer_id, pool_id, scheduled_date);
ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.schedule_rules
    ADD CONSTRAINT schedule_rules_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.service_visits
    ADD CONSTRAINT service_visits_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.subcontractors
    ADD CONSTRAINT subcontractors_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.time_entry_stops
    ADD CONSTRAINT time_entry_stops_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vendor_bills
    ADD CONSTRAINT vendor_bills_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.visit_photos
    ADD CONSTRAINT visit_photos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.weather_reschedule_proposals
    ADD CONSTRAINT weather_reschedule_proposals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.wo_templates
    ADD CONSTRAINT wo_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.work_order_line_items
    ADD CONSTRAINT work_order_line_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_pkey PRIMARY KEY (id);
CREATE INDEX accounting_periods_org_idx ON public.accounting_periods USING btree (org_id);
CREATE INDEX alerts_org_dismissed_idx ON public.alerts USING btree (org_id, dismissed_at);
CREATE INDEX bank_accounts_org_idx ON public.bank_accounts USING btree (org_id);
CREATE INDEX bank_transactions_account_idx ON public.bank_transactions USING btree (bank_account_id);
CREATE INDEX bank_transactions_org_date_idx ON public.bank_transactions USING btree (org_id, date);
CREATE INDEX bank_transactions_status_idx ON public.bank_transactions USING btree (org_id, status);
CREATE INDEX break_events_time_entry_idx ON public.break_events USING btree (time_entry_id);
CREATE INDEX chart_of_accounts_org_idx ON public.chart_of_accounts USING btree (org_id);
CREATE UNIQUE INDEX chart_of_accounts_org_number_idx ON public.chart_of_accounts USING btree (org_id, account_number);
CREATE INDEX checklist_tasks_customer_id_idx ON public.checklist_tasks USING btree (customer_id);
CREATE INDEX checklist_tasks_org_id_idx ON public.checklist_tasks USING btree (org_id);
CREATE INDEX checklist_tasks_template_id_idx ON public.checklist_tasks USING btree (template_id);
CREATE INDEX checklist_templates_org_id_idx ON public.checklist_templates USING btree (org_id);
CREATE INDEX chemical_products_chemical_type_idx ON public.chemical_products USING btree (chemical_type);
CREATE INDEX chemical_products_org_id_idx ON public.chemical_products USING btree (org_id);
CREATE INDEX customer_credits_customer_id_idx ON public.customer_credits USING btree (customer_id);
CREATE INDEX customer_credits_org_id_idx ON public.customer_credits USING btree (org_id);
CREATE INDEX customer_credits_status_idx ON public.customer_credits USING btree (status);
CREATE INDEX customers_assigned_tech_idx ON public.customers USING btree (assigned_tech_id);
CREATE INDEX customers_org_id_idx ON public.customers USING btree (org_id);
CREATE INDEX customers_status_idx ON public.customers USING btree (status);
CREATE INDEX employee_availability_tech_idx ON public.employee_availability USING btree (tech_id);
CREATE INDEX employee_blocked_dates_date_idx ON public.employee_blocked_dates USING btree (org_id, blocked_date);
CREATE INDEX employee_blocked_dates_tech_idx ON public.employee_blocked_dates USING btree (tech_id);
CREATE INDEX employee_documents_org_expires_idx ON public.employee_documents USING btree (org_id, expires_at);
CREATE INDEX employee_documents_tech_idx ON public.employee_documents USING btree (tech_id);
CREATE INDEX equipment_org_id_idx ON public.equipment USING btree (org_id);
CREATE INDEX equipment_pool_id_idx ON public.equipment USING btree (pool_id);
CREATE INDEX equipment_readings_equipment_id_idx ON public.equipment_readings USING btree (equipment_id);
CREATE INDEX equipment_readings_org_id_idx ON public.equipment_readings USING btree (org_id);
CREATE INDEX equipment_readings_pool_id_idx ON public.equipment_readings USING btree (pool_id);
CREATE INDEX equipment_readings_recorded_at_idx ON public.equipment_readings USING btree (recorded_at);
CREATE INDEX expenses_category_idx ON public.expenses USING btree (category);
CREATE INDEX expenses_date_idx ON public.expenses USING btree (date);
CREATE INDEX expenses_org_id_idx ON public.expenses USING btree (org_id);
CREATE INDEX holidays_org_date_idx ON public.holidays USING btree (org_id, date);
CREATE INDEX invoices_customer_id_idx ON public.invoices USING btree (customer_id);
CREATE INDEX invoices_org_id_idx ON public.invoices USING btree (org_id);
CREATE INDEX invoices_status_idx ON public.invoices USING btree (status);
CREATE INDEX journal_entries_org_date_idx ON public.journal_entries USING btree (org_id, entry_date);
CREATE INDEX journal_entries_source_idx ON public.journal_entries USING btree (org_id, source_type, source_id);
CREATE INDEX journal_entry_lines_account_idx ON public.journal_entry_lines USING btree (account_id);
CREATE INDEX journal_entry_lines_entry_idx ON public.journal_entry_lines USING btree (journal_entry_id);
CREATE INDEX mileage_logs_org_date_idx ON public.mileage_logs USING btree (org_id, work_date);
CREATE INDEX mileage_logs_tech_date_idx ON public.mileage_logs USING btree (tech_id, work_date);
CREATE INDEX notification_prefs_user_org_idx ON public.notification_preferences USING btree (user_id, org_id);
CREATE INDEX payment_plans_invoice_id_idx ON public.payment_plans USING btree (invoice_id);
CREATE INDEX payment_plans_org_id_idx ON public.payment_plans USING btree (org_id);
CREATE INDEX payment_plans_status_idx ON public.payment_plans USING btree (status);
CREATE INDEX payment_records_invoice_id_idx ON public.payment_records USING btree (invoice_id);
CREATE INDEX payment_records_org_id_idx ON public.payment_records USING btree (org_id);
CREATE INDEX payment_records_status_idx ON public.payment_records USING btree (status);
CREATE INDEX pools_customer_id_idx ON public.pools USING btree (customer_id);
CREATE INDEX pools_org_id_idx ON public.pools USING btree (org_id);
CREATE INDEX portal_messages_customer_id_idx ON public.portal_messages USING btree (customer_id);
CREATE INDEX portal_messages_org_id_idx ON public.portal_messages USING btree (org_id);
CREATE INDEX portal_messages_project_id_idx ON public.portal_messages USING btree (project_id);
CREATE INDEX portal_messages_service_request_id_idx ON public.portal_messages USING btree (service_request_id);
CREATE INDEX ppi_org_id_idx ON public.payment_plan_installments USING btree (org_id);
CREATE INDEX ppi_plan_id_idx ON public.payment_plan_installments USING btree (payment_plan_id);
CREATE INDEX ppi_status_idx ON public.payment_plan_installments USING btree (status);
CREATE INDEX profiles_org_id_idx ON public.profiles USING btree (org_id);
CREATE INDEX project_change_orders_project_id_idx ON public.project_change_orders USING btree (project_id);
CREATE INDEX project_documents_project_id_idx ON public.project_documents USING btree (project_id);
CREATE INDEX project_equipment_assignments_project_id_idx ON public.project_equipment_assignments USING btree (project_id);
CREATE INDEX project_inspections_project_id_idx ON public.project_inspections USING btree (project_id);
CREATE INDEX project_issue_flags_org_id_idx ON public.project_issue_flags USING btree (org_id);
CREATE INDEX project_issue_flags_project_id_idx ON public.project_issue_flags USING btree (project_id);
CREATE INDEX project_material_receipts_material_id_idx ON public.project_material_receipts USING btree (material_id);
CREATE INDEX project_material_returns_material_id_idx ON public.project_material_returns USING btree (material_id);
CREATE INDEX project_material_usage_material_id_idx ON public.project_material_usage USING btree (material_id);
CREATE INDEX project_material_usage_project_id_idx ON public.project_material_usage USING btree (project_id);
CREATE INDEX project_materials_org_id_idx ON public.project_materials USING btree (org_id);
CREATE INDEX project_materials_project_id_idx ON public.project_materials USING btree (project_id);
CREATE INDEX project_payment_milestones_project_id_idx ON public.project_payment_milestones USING btree (project_id);
CREATE INDEX project_permits_project_id_idx ON public.project_permits USING btree (project_id);
CREATE INDEX project_phase_subcontractors_phase_id_idx ON public.project_phase_subcontractors USING btree (phase_id);
CREATE INDEX project_phase_subcontractors_sub_id_idx ON public.project_phase_subcontractors USING btree (subcontractor_id);
CREATE INDEX project_phase_tasks_phase_id_idx ON public.project_phase_tasks USING btree (phase_id);
CREATE INDEX project_phases_org_id_idx ON public.project_phases USING btree (org_id);
CREATE INDEX project_phases_project_id_idx ON public.project_phases USING btree (project_id);
CREATE INDEX project_photos_phase_id_idx ON public.project_photos USING btree (phase_id);
CREATE INDEX project_photos_project_id_idx ON public.project_photos USING btree (project_id);
CREATE INDEX project_po_line_items_po_id_idx ON public.project_po_line_items USING btree (po_id);
CREATE INDEX project_proposal_addons_proposal_id_idx ON public.project_proposal_addons USING btree (proposal_id);
CREATE INDEX project_proposal_li_proposal_id_idx ON public.project_proposal_line_items USING btree (proposal_id);
CREATE INDEX project_proposal_tiers_proposal_id_idx ON public.project_proposal_tiers USING btree (proposal_id);
CREATE INDEX project_proposals_org_id_idx ON public.project_proposals USING btree (org_id);
CREATE INDEX project_proposals_project_id_idx ON public.project_proposals USING btree (project_id);
CREATE INDEX project_punch_list_project_id_idx ON public.project_punch_list USING btree (project_id);
CREATE INDEX project_purchase_orders_project_id_idx ON public.project_purchase_orders USING btree (project_id);
CREATE INDEX project_surveys_project_id_idx ON public.project_surveys USING btree (project_id);
CREATE INDEX project_templates_org_id_idx ON public.project_templates USING btree (org_id);
CREATE INDEX project_time_logs_project_id_idx ON public.project_time_logs USING btree (project_id);
CREATE INDEX project_time_logs_tech_id_idx ON public.project_time_logs USING btree (tech_id);
CREATE INDEX project_warranty_terms_org_id_idx ON public.project_warranty_terms USING btree (org_id);
CREATE INDEX projects_customer_id_idx ON public.projects USING btree (customer_id);
CREATE INDEX projects_org_id_idx ON public.projects USING btree (org_id);
CREATE INDEX projects_stage_idx ON public.projects USING btree (stage);
CREATE INDEX projects_status_idx ON public.projects USING btree (status);
CREATE INDEX proposal_change_requests_proposal_id_idx ON public.proposal_change_requests USING btree (proposal_id);
CREATE INDEX pto_balances_org_idx ON public.pto_balances USING btree (org_id);
CREATE INDEX pto_balances_tech_idx ON public.pto_balances USING btree (tech_id);
CREATE INDEX pto_requests_org_status_idx ON public.pto_requests USING btree (org_id, status);
CREATE INDEX pto_requests_tech_idx ON public.pto_requests USING btree (tech_id);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions USING btree (user_id);
CREATE INDEX route_days_tech_date_idx ON public.route_days USING btree (tech_id, date);
CREATE INDEX route_stops_org_date_idx ON public.route_stops USING btree (org_id, scheduled_date);
CREATE INDEX route_stops_project_id_idx ON public.route_stops USING btree (project_id);
CREATE INDEX route_stops_schedule_rule_idx ON public.route_stops USING btree (schedule_rule_id);
CREATE INDEX route_stops_tech_date_idx ON public.route_stops USING btree (tech_id, scheduled_date);
CREATE INDEX schedule_rules_customer_idx ON public.schedule_rules USING btree (customer_id);
CREATE INDEX schedule_rules_org_idx ON public.schedule_rules USING btree (org_id);
CREATE INDEX schedule_rules_tech_idx ON public.schedule_rules USING btree (tech_id);
CREATE INDEX service_requests_customer_id_idx ON public.service_requests USING btree (customer_id);
CREATE INDEX service_requests_org_id_idx ON public.service_requests USING btree (org_id);
CREATE INDEX service_requests_status_idx ON public.service_requests USING btree (status);
CREATE INDEX service_visits_customer_id_idx ON public.service_visits USING btree (customer_id);
CREATE INDEX service_visits_org_id_idx ON public.service_visits USING btree (org_id);
CREATE INDEX service_visits_pool_id_idx ON public.service_visits USING btree (pool_id);
CREATE INDEX subcontractors_org_id_idx ON public.subcontractors USING btree (org_id);
CREATE UNIQUE INDEX time_entries_one_open_shift_idx ON public.time_entries USING btree (tech_id, org_id) WHERE (clocked_out_at IS NULL);
CREATE INDEX time_entries_org_date_idx ON public.time_entries USING btree (org_id, work_date);
CREATE INDEX time_entries_tech_date_idx ON public.time_entries USING btree (tech_id, work_date);
CREATE INDEX time_entries_tech_id_idx ON public.time_entries USING btree (tech_id);
CREATE INDEX time_entry_stops_entry_idx ON public.time_entry_stops USING btree (time_entry_id);
CREATE INDEX time_entry_stops_stop_idx ON public.time_entry_stops USING btree (route_stop_id);
CREATE INDEX user_notifications_recipient_created_idx ON public.user_notifications USING btree (recipient_id, created_at);
CREATE INDEX user_notifications_recipient_read_idx ON public.user_notifications USING btree (recipient_id, read_at);
CREATE INDEX vendor_bills_due_date_idx ON public.vendor_bills USING btree (org_id, due_date);
CREATE INDEX vendor_bills_org_status_idx ON public.vendor_bills USING btree (org_id, status);
CREATE INDEX vendor_bills_vendor_idx ON public.vendor_bills USING btree (vendor_id);
CREATE INDEX vendors_org_idx ON public.vendors USING btree (org_id);
CREATE INDEX visit_photos_org_id_idx ON public.visit_photos USING btree (org_id);
CREATE INDEX visit_photos_visit_id_idx ON public.visit_photos USING btree (visit_id);
CREATE INDEX warranty_claims_org_id_idx ON public.warranty_claims USING btree (org_id);
CREATE INDEX warranty_claims_project_id_idx ON public.warranty_claims USING btree (project_id);
CREATE INDEX weather_proposals_org_date_idx ON public.weather_reschedule_proposals USING btree (org_id, affected_date);
CREATE INDEX weather_proposals_org_status_idx ON public.weather_reschedule_proposals USING btree (org_id, status);
CREATE INDEX work_order_line_items_wo_id_idx ON public.work_order_line_items USING btree (work_order_id);
CREATE INDEX work_orders_assigned_tech_idx ON public.work_orders USING btree (assigned_tech_id);
CREATE INDEX work_orders_customer_id_idx ON public.work_orders USING btree (customer_id);
CREATE INDEX work_orders_org_id_idx ON public.work_orders USING btree (org_id);
CREATE INDEX work_orders_status_idx ON public.work_orders USING btree (status);
ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_closed_by_profiles_id_fk FOREIGN KEY (closed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_chart_of_accounts_id_chart_of_accounts_id_fk FOREIGN KEY (chart_of_accounts_id) REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_bank_account_id_bank_accounts_id_fk FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_matched_entry_id_journal_entries_id_fk FOREIGN KEY (matched_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.break_events
    ADD CONSTRAINT break_events_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.break_events
    ADD CONSTRAINT break_events_time_entry_id_time_entries_id_fk FOREIGN KEY (time_entry_id) REFERENCES public.time_entries(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.checklist_tasks
    ADD CONSTRAINT checklist_tasks_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.checklist_tasks
    ADD CONSTRAINT checklist_tasks_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.checklist_tasks
    ADD CONSTRAINT checklist_tasks_template_id_checklist_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.checklist_templates(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.chemical_products
    ADD CONSTRAINT chemical_products_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_credits
    ADD CONSTRAINT customer_credits_applied_to_invoice_id_invoices_id_fk FOREIGN KEY (applied_to_invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.customer_credits
    ADD CONSTRAINT customer_credits_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.customer_credits
    ADD CONSTRAINT customer_credits_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_credits
    ADD CONSTRAINT customer_credits_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_assigned_tech_id_profiles_id_fk FOREIGN KEY (assigned_tech_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dunning_config
    ADD CONSTRAINT dunning_config_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.employee_availability
    ADD CONSTRAINT employee_availability_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.employee_availability
    ADD CONSTRAINT employee_availability_tech_id_profiles_id_fk FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.employee_blocked_dates
    ADD CONSTRAINT employee_blocked_dates_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.employee_blocked_dates
    ADD CONSTRAINT employee_blocked_dates_tech_id_profiles_id_fk FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT employee_documents_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT employee_documents_tech_id_profiles_id_fk FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_pool_id_pools_id_fk FOREIGN KEY (pool_id) REFERENCES public.pools(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.equipment_readings
    ADD CONSTRAINT equipment_readings_equipment_id_equipment_id_fk FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.equipment_readings
    ADD CONSTRAINT equipment_readings_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.equipment_readings
    ADD CONSTRAINT equipment_readings_pool_id_pools_id_fk FOREIGN KEY (pool_id) REFERENCES public.pools(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.equipment_readings
    ADD CONSTRAINT equipment_readings_recorded_by_id_profiles_id_fk FOREIGN KEY (recorded_by_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.equipment_readings
    ADD CONSTRAINT equipment_readings_service_visit_id_service_visits_id_fk FOREIGN KEY (service_visit_id) REFERENCES public.service_visits(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_invoices_id_fk FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_account_id_chart_of_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_journal_entry_id_journal_entries_id_fk FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.mileage_logs
    ADD CONSTRAINT mileage_logs_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.mileage_logs
    ADD CONSTRAINT mileage_logs_tech_id_profiles_id_fk FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.mileage_logs
    ADD CONSTRAINT mileage_logs_time_entry_id_time_entries_id_fk FOREIGN KEY (time_entry_id) REFERENCES public.time_entries(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_settings
    ADD CONSTRAINT org_settings_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.parts_catalog
    ADD CONSTRAINT parts_catalog_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.payment_plan_installments
    ADD CONSTRAINT payment_plan_installments_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.payment_plan_installments
    ADD CONSTRAINT payment_plan_installments_payment_plan_id_payment_plans_id_fk FOREIGN KEY (payment_plan_id) REFERENCES public.payment_plans(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.payment_plan_installments
    ADD CONSTRAINT payment_plan_installments_payment_record_id_payment_records_id_ FOREIGN KEY (payment_record_id) REFERENCES public.payment_records(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.payment_plans
    ADD CONSTRAINT payment_plans_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.payment_plans
    ADD CONSTRAINT payment_plans_invoice_id_invoices_id_fk FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.payment_plans
    ADD CONSTRAINT payment_plans_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.payment_records
    ADD CONSTRAINT payment_records_invoice_id_invoices_id_fk FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.payment_records
    ADD CONSTRAINT payment_records_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pools
    ADD CONSTRAINT pools_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pools
    ADD CONSTRAINT pools_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_change_orders
    ADD CONSTRAINT project_change_orders_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_change_orders
    ADD CONSTRAINT project_change_orders_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_documents
    ADD CONSTRAINT project_documents_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_documents
    ADD CONSTRAINT project_documents_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_documents
    ADD CONSTRAINT project_documents_uploaded_by_profiles_id_fk FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_equipment_assignments
    ADD CONSTRAINT project_equipment_assignments_assigned_by_profiles_id_fk FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_equipment_assignments
    ADD CONSTRAINT project_equipment_assignments_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_equipment_assignments
    ADD CONSTRAINT project_equipment_assignments_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_inspections
    ADD CONSTRAINT project_inspections_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_inspections
    ADD CONSTRAINT project_inspections_phase_id_project_phases_id_fk FOREIGN KEY (phase_id) REFERENCES public.project_phases(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_inspections
    ADD CONSTRAINT project_inspections_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_issue_flags
    ADD CONSTRAINT project_issue_flags_alert_id_alerts_id_fk FOREIGN KEY (alert_id) REFERENCES public.alerts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_issue_flags
    ADD CONSTRAINT project_issue_flags_change_order_id_project_change_orders_id_fk FOREIGN KEY (change_order_id) REFERENCES public.project_change_orders(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_issue_flags
    ADD CONSTRAINT project_issue_flags_flagged_by_profiles_id_fk FOREIGN KEY (flagged_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_issue_flags
    ADD CONSTRAINT project_issue_flags_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_issue_flags
    ADD CONSTRAINT project_issue_flags_phase_id_project_phases_id_fk FOREIGN KEY (phase_id) REFERENCES public.project_phases(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_issue_flags
    ADD CONSTRAINT project_issue_flags_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_issue_flags
    ADD CONSTRAINT project_issue_flags_task_id_project_phase_tasks_id_fk FOREIGN KEY (task_id) REFERENCES public.project_phase_tasks(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_material_receipts
    ADD CONSTRAINT project_material_receipts_material_id_project_materials_id_fk FOREIGN KEY (material_id) REFERENCES public.project_materials(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_material_receipts
    ADD CONSTRAINT project_material_receipts_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_material_receipts
    ADD CONSTRAINT project_material_receipts_po_id_project_purchase_orders_id_fk FOREIGN KEY (po_id) REFERENCES public.project_purchase_orders(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_material_receipts
    ADD CONSTRAINT project_material_receipts_received_by_profiles_id_fk FOREIGN KEY (received_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_material_returns
    ADD CONSTRAINT project_material_returns_material_id_project_materials_id_fk FOREIGN KEY (material_id) REFERENCES public.project_materials(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_material_returns
    ADD CONSTRAINT project_material_returns_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_material_returns
    ADD CONSTRAINT project_material_returns_returned_by_profiles_id_fk FOREIGN KEY (returned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_material_usage
    ADD CONSTRAINT project_material_usage_logged_by_profiles_id_fk FOREIGN KEY (logged_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_material_usage
    ADD CONSTRAINT project_material_usage_material_id_project_materials_id_fk FOREIGN KEY (material_id) REFERENCES public.project_materials(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_material_usage
    ADD CONSTRAINT project_material_usage_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_material_usage
    ADD CONSTRAINT project_material_usage_phase_id_project_phases_id_fk FOREIGN KEY (phase_id) REFERENCES public.project_phases(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_material_usage
    ADD CONSTRAINT project_material_usage_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_materials
    ADD CONSTRAINT project_materials_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_materials
    ADD CONSTRAINT project_materials_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_materials
    ADD CONSTRAINT project_materials_proposal_line_item_id_project_proposal_line_i FOREIGN KEY (proposal_line_item_id) REFERENCES public.project_proposal_line_items(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_payment_milestones
    ADD CONSTRAINT project_payment_milestones_invoice_id_invoices_id_fk FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_payment_milestones
    ADD CONSTRAINT project_payment_milestones_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_payment_milestones
    ADD CONSTRAINT project_payment_milestones_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_payment_milestones
    ADD CONSTRAINT project_payment_milestones_proposal_id_project_proposals_id_fk FOREIGN KEY (proposal_id) REFERENCES public.project_proposals(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_payment_milestones
    ADD CONSTRAINT project_payment_milestones_trigger_phase_id_project_phases_id_f FOREIGN KEY (trigger_phase_id) REFERENCES public.project_phases(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_permits
    ADD CONSTRAINT project_permits_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_permits
    ADD CONSTRAINT project_permits_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_phase_subcontractors
    ADD CONSTRAINT project_phase_subcontractors_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_phase_subcontractors
    ADD CONSTRAINT project_phase_subcontractors_phase_id_project_phases_id_fk FOREIGN KEY (phase_id) REFERENCES public.project_phases(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_phase_subcontractors
    ADD CONSTRAINT project_phase_subcontractors_subcontractor_id_subcontractors_id FOREIGN KEY (subcontractor_id) REFERENCES public.subcontractors(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_phase_tasks
    ADD CONSTRAINT project_phase_tasks_completed_by_profiles_id_fk FOREIGN KEY (completed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_phase_tasks
    ADD CONSTRAINT project_phase_tasks_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_phase_tasks
    ADD CONSTRAINT project_phase_tasks_phase_id_project_phases_id_fk FOREIGN KEY (phase_id) REFERENCES public.project_phases(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_phases
    ADD CONSTRAINT project_phases_assigned_tech_id_profiles_id_fk FOREIGN KEY (assigned_tech_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_phases
    ADD CONSTRAINT project_phases_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_phases
    ADD CONSTRAINT project_phases_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_photos
    ADD CONSTRAINT project_photos_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_photos
    ADD CONSTRAINT project_photos_phase_id_project_phases_id_fk FOREIGN KEY (phase_id) REFERENCES public.project_phases(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_photos
    ADD CONSTRAINT project_photos_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_photos
    ADD CONSTRAINT project_photos_taken_by_profiles_id_fk FOREIGN KEY (taken_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_photos
    ADD CONSTRAINT project_photos_task_id_project_phase_tasks_id_fk FOREIGN KEY (task_id) REFERENCES public.project_phase_tasks(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_po_line_items
    ADD CONSTRAINT project_po_line_items_material_id_project_materials_id_fk FOREIGN KEY (material_id) REFERENCES public.project_materials(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_po_line_items
    ADD CONSTRAINT project_po_line_items_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_po_line_items
    ADD CONSTRAINT project_po_line_items_po_id_project_purchase_orders_id_fk FOREIGN KEY (po_id) REFERENCES public.project_purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_proposal_addons
    ADD CONSTRAINT project_proposal_addons_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_proposal_addons
    ADD CONSTRAINT project_proposal_addons_proposal_id_project_proposals_id_fk FOREIGN KEY (proposal_id) REFERENCES public.project_proposals(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_proposal_line_items
    ADD CONSTRAINT project_proposal_line_items_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_proposal_line_items
    ADD CONSTRAINT project_proposal_line_items_proposal_id_project_proposals_id_fk FOREIGN KEY (proposal_id) REFERENCES public.project_proposals(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_proposal_line_items
    ADD CONSTRAINT project_proposal_line_items_tier_id_project_proposal_tiers_id_f FOREIGN KEY (tier_id) REFERENCES public.project_proposal_tiers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_proposal_tiers
    ADD CONSTRAINT project_proposal_tiers_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_proposal_tiers
    ADD CONSTRAINT project_proposal_tiers_proposal_id_project_proposals_id_fk FOREIGN KEY (proposal_id) REFERENCES public.project_proposals(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_proposals
    ADD CONSTRAINT project_proposals_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_proposals
    ADD CONSTRAINT project_proposals_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_punch_list
    ADD CONSTRAINT project_punch_list_assigned_to_profiles_id_fk FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_punch_list
    ADD CONSTRAINT project_punch_list_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_punch_list
    ADD CONSTRAINT project_punch_list_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_purchase_orders
    ADD CONSTRAINT project_purchase_orders_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_purchase_orders
    ADD CONSTRAINT project_purchase_orders_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_surveys
    ADD CONSTRAINT project_surveys_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_surveys
    ADD CONSTRAINT project_surveys_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_surveys
    ADD CONSTRAINT project_surveys_route_stop_id_route_stops_id_fk FOREIGN KEY (route_stop_id) REFERENCES public.route_stops(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_surveys
    ADD CONSTRAINT project_surveys_surveyed_by_profiles_id_fk FOREIGN KEY (surveyed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_templates
    ADD CONSTRAINT project_templates_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_time_logs
    ADD CONSTRAINT project_time_logs_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_time_logs
    ADD CONSTRAINT project_time_logs_phase_id_project_phases_id_fk FOREIGN KEY (phase_id) REFERENCES public.project_phases(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_time_logs
    ADD CONSTRAINT project_time_logs_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_time_logs
    ADD CONSTRAINT project_time_logs_task_id_project_phase_tasks_id_fk FOREIGN KEY (task_id) REFERENCES public.project_phase_tasks(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_time_logs
    ADD CONSTRAINT project_time_logs_tech_id_profiles_id_fk FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_time_logs
    ADD CONSTRAINT project_time_logs_time_entry_id_time_entries_id_fk FOREIGN KEY (time_entry_id) REFERENCES public.time_entries(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.project_warranty_terms
    ADD CONSTRAINT project_warranty_terms_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pool_id_pools_id_fk FOREIGN KEY (pool_id) REFERENCES public.pools(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.proposal_change_requests
    ADD CONSTRAINT proposal_change_requests_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.proposal_change_requests
    ADD CONSTRAINT proposal_change_requests_proposal_id_project_proposals_id_fk FOREIGN KEY (proposal_id) REFERENCES public.project_proposals(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pto_balances
    ADD CONSTRAINT pto_balances_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pto_balances
    ADD CONSTRAINT pto_balances_tech_id_profiles_id_fk FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pto_requests
    ADD CONSTRAINT pto_requests_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pto_requests
    ADD CONSTRAINT pto_requests_reviewed_by_profiles_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.pto_requests
    ADD CONSTRAINT pto_requests_tech_id_profiles_id_fk FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_work_order_id_work_orders_id_fk FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.route_days
    ADD CONSTRAINT route_days_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.route_days
    ADD CONSTRAINT route_days_tech_id_profiles_id_fk FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_checklist_template_id_checklist_templates_id_fk FOREIGN KEY (checklist_template_id) REFERENCES public.checklist_templates(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_pool_id_pools_id_fk FOREIGN KEY (pool_id) REFERENCES public.pools(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_schedule_rule_id_schedule_rules_id_fk FOREIGN KEY (schedule_rule_id) REFERENCES public.schedule_rules(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_tech_id_profiles_id_fk FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_work_order_id_work_orders_id_fk FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.schedule_rules
    ADD CONSTRAINT schedule_rules_checklist_template_id_checklist_templates_id_fk FOREIGN KEY (checklist_template_id) REFERENCES public.checklist_templates(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.schedule_rules
    ADD CONSTRAINT schedule_rules_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.schedule_rules
    ADD CONSTRAINT schedule_rules_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.schedule_rules
    ADD CONSTRAINT schedule_rules_pool_id_pools_id_fk FOREIGN KEY (pool_id) REFERENCES public.pools(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.schedule_rules
    ADD CONSTRAINT schedule_rules_tech_id_profiles_id_fk FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_pool_id_pools_id_fk FOREIGN KEY (pool_id) REFERENCES public.pools(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.service_visits
    ADD CONSTRAINT service_visits_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.service_visits
    ADD CONSTRAINT service_visits_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.service_visits
    ADD CONSTRAINT service_visits_pool_id_pools_id_fk FOREIGN KEY (pool_id) REFERENCES public.pools(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.service_visits
    ADD CONSTRAINT service_visits_tech_id_profiles_id_fk FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.subcontractors
    ADD CONSTRAINT subcontractors_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_approved_by_profiles_id_fk FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_tech_id_profiles_id_fk FOREIGN KEY (tech_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.time_entry_stops
    ADD CONSTRAINT time_entry_stops_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.time_entry_stops
    ADD CONSTRAINT time_entry_stops_route_stop_id_route_stops_id_fk FOREIGN KEY (route_stop_id) REFERENCES public.route_stops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.time_entry_stops
    ADD CONSTRAINT time_entry_stops_time_entry_id_time_entries_id_fk FOREIGN KEY (time_entry_id) REFERENCES public.time_entries(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_recipient_id_profiles_id_fk FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.vendor_bills
    ADD CONSTRAINT vendor_bills_category_account_id_chart_of_accounts_id_fk FOREIGN KEY (category_account_id) REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.vendor_bills
    ADD CONSTRAINT vendor_bills_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.vendor_bills
    ADD CONSTRAINT vendor_bills_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.vendor_bills
    ADD CONSTRAINT vendor_bills_paid_by_profiles_id_fk FOREIGN KEY (paid_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.vendor_bills
    ADD CONSTRAINT vendor_bills_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.visit_photos
    ADD CONSTRAINT visit_photos_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.visit_photos
    ADD CONSTRAINT visit_photos_visit_id_service_visits_id_fk FOREIGN KEY (visit_id) REFERENCES public.service_visits(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_warranty_term_id_project_warranty_terms_id_fk FOREIGN KEY (warranty_term_id) REFERENCES public.project_warranty_terms(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_work_order_id_work_orders_id_fk FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.weather_reschedule_proposals
    ADD CONSTRAINT weather_reschedule_proposals_approved_by_id_profiles_id_fk FOREIGN KEY (approved_by_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.weather_reschedule_proposals
    ADD CONSTRAINT weather_reschedule_proposals_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.wo_templates
    ADD CONSTRAINT wo_templates_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.work_order_line_items
    ADD CONSTRAINT work_order_line_items_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.work_order_line_items
    ADD CONSTRAINT work_order_line_items_work_order_id_work_orders_id_fk FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_assigned_tech_id_profiles_id_fk FOREIGN KEY (assigned_tech_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_cancelled_by_id_profiles_id_fk FOREIGN KEY (cancelled_by_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_created_by_id_profiles_id_fk FOREIGN KEY (created_by_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_flagged_by_tech_id_profiles_id_fk FOREIGN KEY (flagged_by_tech_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_org_id_orgs_id_fk FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_pool_id_pools_id_fk FOREIGN KEY (pool_id) REFERENCES public.pools(id) ON DELETE SET NULL;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounting_periods_delete_policy ON public.accounting_periods FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY accounting_periods_insert_policy ON public.accounting_periods FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY accounting_periods_select_policy ON public.accounting_periods FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY accounting_periods_update_policy ON public.accounting_periods FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY alerts_delete_policy ON public.alerts FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY alerts_insert_policy ON public.alerts FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY alerts_select_policy ON public.alerts FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY alerts_update_policy ON public.alerts FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_accounts_delete_policy ON public.bank_accounts FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY bank_accounts_insert_policy ON public.bank_accounts FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY bank_accounts_select_policy ON public.bank_accounts FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY bank_accounts_update_policy ON public.bank_accounts FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_transactions_delete_policy ON public.bank_transactions FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY bank_transactions_insert_policy ON public.bank_transactions FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY bank_transactions_select_policy ON public.bank_transactions FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY bank_transactions_update_policy ON public.bank_transactions FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.break_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY break_events_delete_policy ON public.break_events FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY break_events_insert_policy ON public.break_events FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((( SELECT time_entries.tech_id
   FROM public.time_entries
  WHERE (time_entries.id = break_events.time_entry_id)) = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))));
CREATE POLICY break_events_select_policy ON public.break_events FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((( SELECT time_entries.tech_id
   FROM public.time_entries
  WHERE (time_entries.id = break_events.time_entry_id)) = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))));
CREATE POLICY break_events_update_policy ON public.break_events FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((( SELECT time_entries.tech_id
   FROM public.time_entries
  WHERE (time_entries.id = break_events.time_entry_id)) = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((( SELECT time_entries.tech_id
   FROM public.time_entries
  WHERE (time_entries.id = break_events.time_entry_id)) = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))));
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY chart_of_accounts_delete_policy ON public.chart_of_accounts FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY chart_of_accounts_insert_policy ON public.chart_of_accounts FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY chart_of_accounts_select_policy ON public.chart_of_accounts FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY chart_of_accounts_update_policy ON public.chart_of_accounts FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.checklist_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY checklist_tasks_delete_policy ON public.checklist_tasks FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY checklist_tasks_insert_policy ON public.checklist_tasks FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY checklist_tasks_select_policy ON public.checklist_tasks FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY checklist_tasks_update_policy ON public.checklist_tasks FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY checklist_templates_delete_policy ON public.checklist_templates FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY checklist_templates_insert_policy ON public.checklist_templates FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY checklist_templates_select_policy ON public.checklist_templates FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY checklist_templates_update_policy ON public.checklist_templates FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.chemical_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY chemical_products_delete_policy ON public.chemical_products FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY chemical_products_insert_policy ON public.chemical_products FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY chemical_products_select_policy ON public.chemical_products FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY chemical_products_update_policy ON public.chemical_products FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_credits_delete_policy ON public.customer_credits FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY customer_credits_insert_policy ON public.customer_credits FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY customer_credits_select_policy ON public.customer_credits FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY customer_credits_update_policy ON public.customer_credits FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_delete_policy ON public.customers FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY customers_insert_policy ON public.customers FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY customers_select_policy ON public.customers FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY customers_update_policy ON public.customers FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.dunning_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY dunning_config_delete_policy ON public.dunning_config FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY dunning_config_insert_policy ON public.dunning_config FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY dunning_config_select_policy ON public.dunning_config FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY dunning_config_update_policy ON public.dunning_config FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.employee_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_availability_delete_policy ON public.employee_availability FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY employee_availability_insert_policy ON public.employee_availability FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY employee_availability_select_policy ON public.employee_availability FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((tech_id = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))));
CREATE POLICY employee_availability_update_policy ON public.employee_availability FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.employee_blocked_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_blocked_dates_delete_policy ON public.employee_blocked_dates FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY employee_blocked_dates_insert_policy ON public.employee_blocked_dates FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY employee_blocked_dates_select_policy ON public.employee_blocked_dates FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((tech_id = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))));
CREATE POLICY employee_blocked_dates_update_policy ON public.employee_blocked_dates FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_documents_delete_policy ON public.employee_documents FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY employee_documents_insert_policy ON public.employee_documents FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY employee_documents_select_policy ON public.employee_documents FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((tech_id = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))));
CREATE POLICY employee_documents_update_policy ON public.employee_documents FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY equipment_delete_policy ON public.equipment FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY equipment_insert_policy ON public.equipment FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.equipment_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY equipment_readings_delete_policy ON public.equipment_readings FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY equipment_readings_insert_policy ON public.equipment_readings FOR INSERT TO authenticated WITH CHECK ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY equipment_readings_select_policy ON public.equipment_readings FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY equipment_readings_update_policy ON public.equipment_readings FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY equipment_select_policy ON public.equipment FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY equipment_update_policy ON public.equipment FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY expenses_delete_policy ON public.expenses FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY expenses_insert_policy ON public.expenses FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY expenses_select_policy ON public.expenses FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY expenses_update_policy ON public.expenses FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY holidays_delete_policy ON public.holidays FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY holidays_insert_policy ON public.holidays FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY holidays_select_policy ON public.holidays FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY holidays_update_policy ON public.holidays FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_line_items_delete_policy ON public.invoice_line_items FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY invoice_line_items_insert_policy ON public.invoice_line_items FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY invoice_line_items_select_policy ON public.invoice_line_items FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY invoice_line_items_update_policy ON public.invoice_line_items FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_delete_policy ON public.invoices FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY invoices_insert_policy ON public.invoices FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY invoices_select_policy ON public.invoices FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY invoices_update_policy ON public.invoices FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY journal_entries_delete_policy ON public.journal_entries FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY journal_entries_insert_policy ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY journal_entries_select_policy ON public.journal_entries FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY journal_entries_update_policy ON public.journal_entries FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY journal_entry_lines_delete_policy ON public.journal_entry_lines FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY journal_entry_lines_insert_policy ON public.journal_entry_lines FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY journal_entry_lines_select_policy ON public.journal_entry_lines FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY journal_entry_lines_update_policy ON public.journal_entry_lines FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.mileage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY mileage_logs_delete_policy ON public.mileage_logs FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY mileage_logs_insert_policy ON public.mileage_logs FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((tech_id = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))));
CREATE POLICY mileage_logs_select_policy ON public.mileage_logs FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((tech_id = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))));
CREATE POLICY mileage_logs_update_policy ON public.mileage_logs FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_prefs_delete_policy ON public.notification_preferences FOR DELETE TO authenticated USING (((user_id = auth.uid()) AND (org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid)));
CREATE POLICY notification_prefs_insert_policy ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid)));
CREATE POLICY notification_prefs_select_policy ON public.notification_preferences FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid)));
CREATE POLICY notification_prefs_update_policy ON public.notification_preferences FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid))) WITH CHECK (((user_id = auth.uid()) AND (org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid)));
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_templates_delete_policy ON public.notification_templates FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY notification_templates_insert_policy ON public.notification_templates FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY notification_templates_select_policy ON public.notification_templates FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY notification_templates_update_policy ON public.notification_templates FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_settings_delete_policy ON public.org_settings FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY org_settings_insert_policy ON public.org_settings FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY org_settings_select_policy ON public.org_settings FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY org_settings_update_policy ON public.org_settings FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY orgs_select_policy ON public.orgs FOR SELECT TO authenticated USING ((id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY orgs_update_policy ON public.orgs FOR UPDATE TO authenticated USING (((id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.parts_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY parts_catalog_delete_policy ON public.parts_catalog FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY parts_catalog_insert_policy ON public.parts_catalog FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY parts_catalog_select_policy ON public.parts_catalog FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY parts_catalog_update_policy ON public.parts_catalog FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.payment_plan_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_plans_delete_policy ON public.payment_plans FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY payment_plans_insert_policy ON public.payment_plans FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY payment_plans_select_policy ON public.payment_plans FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY payment_plans_update_policy ON public.payment_plans FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_records_delete_policy ON public.payment_records FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY payment_records_insert_policy ON public.payment_records FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY payment_records_select_policy ON public.payment_records FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY payment_records_update_policy ON public.payment_records FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY pools_delete_policy ON public.pools FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY pools_insert_policy ON public.pools FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY pools_select_policy ON public.pools FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY pools_update_policy ON public.pools FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_messages_customer_policy ON public.portal_messages TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'customer'::text) AND (customer_id IN ( SELECT customers.id
   FROM public.customers
  WHERE ((customers.email = ( SELECT auth.email() AS email)) AND (customers.org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid)))))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'customer'::text) AND (customer_id IN ( SELECT customers.id
   FROM public.customers
  WHERE ((customers.email = ( SELECT auth.email() AS email)) AND (customers.org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid))))));
CREATE POLICY portal_messages_office_policy ON public.portal_messages TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY ppi_delete_policy ON public.payment_plan_installments FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY ppi_insert_policy ON public.payment_plan_installments FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY ppi_select_policy ON public.payment_plan_installments FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY ppi_update_policy ON public.payment_plan_installments FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_delete_policy ON public.profiles FOR DELETE TO authenticated USING (((( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text) AND (org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid)));
CREATE POLICY profiles_insert_policy ON public.profiles FOR INSERT TO authenticated WITH CHECK ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY profiles_select_policy ON public.profiles FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY profiles_update_policy ON public.profiles FOR UPDATE TO authenticated USING (((id = auth.uid()) OR ((( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])) AND (org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid)))) WITH CHECK (((id = auth.uid()) OR ((( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])) AND (org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid))));
ALTER TABLE public.project_change_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_change_orders_delete_policy ON public.project_change_orders FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY project_change_orders_insert_policy ON public.project_change_orders FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_change_orders_select_policy ON public.project_change_orders FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_change_orders_update_policy ON public.project_change_orders FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_documents_delete_policy ON public.project_documents FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_documents_insert_policy ON public.project_documents FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY project_documents_select_policy ON public.project_documents FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_documents_update_policy ON public.project_documents FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_equipment_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_equipment_assignments_delete_policy ON public.project_equipment_assignments FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_equipment_assignments_insert_policy ON public.project_equipment_assignments FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_equipment_assignments_select_policy ON public.project_equipment_assignments FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_equipment_assignments_update_policy ON public.project_equipment_assignments FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_inspections_delete_policy ON public.project_inspections FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY project_inspections_insert_policy ON public.project_inspections FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_inspections_select_policy ON public.project_inspections FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_inspections_update_policy ON public.project_inspections FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_issue_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_issue_flags_delete_policy ON public.project_issue_flags FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_issue_flags_insert_policy ON public.project_issue_flags FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY project_issue_flags_select_policy ON public.project_issue_flags FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_issue_flags_update_policy ON public.project_issue_flags FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_material_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_material_receipts_delete_policy ON public.project_material_receipts FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_material_receipts_insert_policy ON public.project_material_receipts FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY project_material_receipts_select_policy ON public.project_material_receipts FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_material_receipts_update_policy ON public.project_material_receipts FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_material_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_material_returns_delete_policy ON public.project_material_returns FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_material_returns_insert_policy ON public.project_material_returns FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY project_material_returns_select_policy ON public.project_material_returns FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_material_returns_update_policy ON public.project_material_returns FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_material_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_material_usage_delete_policy ON public.project_material_usage FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_material_usage_insert_policy ON public.project_material_usage FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY project_material_usage_select_policy ON public.project_material_usage FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_material_usage_update_policy ON public.project_material_usage FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_materials_delete_policy ON public.project_materials FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_materials_insert_policy ON public.project_materials FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_materials_select_policy ON public.project_materials FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_materials_update_policy ON public.project_materials FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_payment_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_payment_milestones_delete_policy ON public.project_payment_milestones FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_payment_milestones_insert_policy ON public.project_payment_milestones FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_payment_milestones_select_policy ON public.project_payment_milestones FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_payment_milestones_update_policy ON public.project_payment_milestones FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_permits ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_permits_delete_policy ON public.project_permits FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY project_permits_insert_policy ON public.project_permits FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_permits_select_policy ON public.project_permits FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_permits_update_policy ON public.project_permits FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_phase_subcontractors ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_phase_subcontractors_delete_policy ON public.project_phase_subcontractors FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_phase_subcontractors_insert_policy ON public.project_phase_subcontractors FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_phase_subcontractors_select_policy ON public.project_phase_subcontractors FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_phase_subcontractors_update_policy ON public.project_phase_subcontractors FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_phase_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_phase_tasks_delete_policy ON public.project_phase_tasks FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_phase_tasks_insert_policy ON public.project_phase_tasks FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY project_phase_tasks_select_policy ON public.project_phase_tasks FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_phase_tasks_update_policy ON public.project_phase_tasks FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_phases_delete_policy ON public.project_phases FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_phases_insert_policy ON public.project_phases FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_phases_select_policy ON public.project_phases FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_phases_update_policy ON public.project_phases FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_photos_delete_policy ON public.project_photos FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_photos_insert_policy ON public.project_photos FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY project_photos_select_policy ON public.project_photos FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_photos_update_policy ON public.project_photos FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_po_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_po_line_items_delete_policy ON public.project_po_line_items FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_po_line_items_insert_policy ON public.project_po_line_items FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_po_line_items_select_policy ON public.project_po_line_items FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_po_line_items_update_policy ON public.project_po_line_items FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_proposal_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_proposal_addons_delete_policy ON public.project_proposal_addons FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_proposal_addons_insert_policy ON public.project_proposal_addons FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_proposal_addons_select_policy ON public.project_proposal_addons FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_proposal_addons_update_policy ON public.project_proposal_addons FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_proposal_li_delete_policy ON public.project_proposal_line_items FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_proposal_li_insert_policy ON public.project_proposal_line_items FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_proposal_li_select_policy ON public.project_proposal_line_items FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_proposal_li_update_policy ON public.project_proposal_line_items FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_proposal_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_proposal_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_proposal_tiers_delete_policy ON public.project_proposal_tiers FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_proposal_tiers_insert_policy ON public.project_proposal_tiers FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_proposal_tiers_select_policy ON public.project_proposal_tiers FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_proposal_tiers_update_policy ON public.project_proposal_tiers FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_proposals_delete_policy ON public.project_proposals FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY project_proposals_insert_policy ON public.project_proposals FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_proposals_select_policy ON public.project_proposals FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_proposals_update_policy ON public.project_proposals FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_punch_list ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_punch_list_delete_policy ON public.project_punch_list FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_punch_list_insert_policy ON public.project_punch_list FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_punch_list_select_policy ON public.project_punch_list FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_punch_list_update_policy ON public.project_punch_list FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
ALTER TABLE public.project_purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_purchase_orders_delete_policy ON public.project_purchase_orders FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_purchase_orders_insert_policy ON public.project_purchase_orders FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_purchase_orders_select_policy ON public.project_purchase_orders FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_purchase_orders_update_policy ON public.project_purchase_orders FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_surveys_delete_policy ON public.project_surveys FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_surveys_insert_policy ON public.project_surveys FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY project_surveys_select_policy ON public.project_surveys FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_surveys_update_policy ON public.project_surveys FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_templates_delete_policy ON public.project_templates FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_templates_insert_policy ON public.project_templates FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_templates_select_policy ON public.project_templates FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_templates_update_policy ON public.project_templates FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.project_time_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_time_logs_delete_policy ON public.project_time_logs FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_time_logs_insert_policy ON public.project_time_logs FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY project_time_logs_select_policy ON public.project_time_logs FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_time_logs_update_policy ON public.project_time_logs FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
ALTER TABLE public.project_warranty_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_warranty_terms_delete_policy ON public.project_warranty_terms FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_warranty_terms_insert_policy ON public.project_warranty_terms FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY project_warranty_terms_select_policy ON public.project_warranty_terms FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY project_warranty_terms_update_policy ON public.project_warranty_terms FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_delete_policy ON public.projects FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY projects_insert_policy ON public.projects FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY projects_select_policy ON public.projects FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY projects_update_policy ON public.projects FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.proposal_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY proposal_change_requests_delete_policy ON public.proposal_change_requests FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY proposal_change_requests_insert_policy ON public.proposal_change_requests FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY proposal_change_requests_select_policy ON public.proposal_change_requests FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY proposal_change_requests_update_policy ON public.proposal_change_requests FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.pto_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY pto_balances_delete_policy ON public.pto_balances FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY pto_balances_insert_policy ON public.pto_balances FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY pto_balances_select_policy ON public.pto_balances FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((tech_id = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))));
CREATE POLICY pto_balances_update_policy ON public.pto_balances FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.pto_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY pto_requests_delete_policy ON public.pto_requests FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY pto_requests_insert_policy ON public.pto_requests FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((tech_id = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))));
CREATE POLICY pto_requests_select_policy ON public.pto_requests FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((tech_id = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))));
CREATE POLICY pto_requests_update_policy ON public.pto_requests FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_delete_policy ON public.push_subscriptions FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY push_subscriptions_insert_policy ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY push_subscriptions_select_policy ON public.push_subscriptions FOR SELECT TO authenticated USING ((user_id = auth.uid()));
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotes_delete_policy ON public.quotes FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY quotes_insert_policy ON public.quotes FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY quotes_select_policy ON public.quotes FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY quotes_update_policy ON public.quotes FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.route_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY route_days_delete_policy ON public.route_days FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY route_days_insert_policy ON public.route_days FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY route_days_select_policy ON public.route_days FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY route_days_update_policy ON public.route_days FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY route_stops_delete_policy ON public.route_stops FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY route_stops_insert_policy ON public.route_stops FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY route_stops_select_policy ON public.route_stops FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY route_stops_update_policy ON public.route_stops FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
ALTER TABLE public.schedule_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY schedule_rules_delete_policy ON public.schedule_rules FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY schedule_rules_insert_policy ON public.schedule_rules FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY schedule_rules_select_policy ON public.schedule_rules FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY schedule_rules_update_policy ON public.schedule_rules FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_requests_customer_insert_policy ON public.service_requests FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'customer'::text) AND (customer_id IN ( SELECT customers.id
   FROM public.customers
  WHERE ((customers.email = ( SELECT auth.email() AS email)) AND (customers.org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid))))));
CREATE POLICY service_requests_customer_select_policy ON public.service_requests FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'customer'::text) AND (customer_id IN ( SELECT customers.id
   FROM public.customers
  WHERE ((customers.email = ( SELECT auth.email() AS email)) AND (customers.org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid))))));
CREATE POLICY service_requests_office_policy ON public.service_requests TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.service_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_visits_delete_policy ON public.service_visits FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY service_visits_insert_policy ON public.service_visits FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY service_visits_select_policy ON public.service_visits FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY service_visits_update_policy ON public.service_visits FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
CREATE POLICY subcontractors_delete_policy ON public.subcontractors FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY subcontractors_insert_policy ON public.subcontractors FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY subcontractors_select_policy ON public.subcontractors FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY subcontractors_update_policy ON public.subcontractors FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY time_entries_delete_policy ON public.time_entries FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY time_entries_insert_policy ON public.time_entries FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((tech_id = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))));
CREATE POLICY time_entries_select_policy ON public.time_entries FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((tech_id = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))));
CREATE POLICY time_entries_update_policy ON public.time_entries FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((tech_id = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((tech_id = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))));
ALTER TABLE public.time_entry_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY time_entry_stops_delete_policy ON public.time_entry_stops FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY time_entry_stops_insert_policy ON public.time_entry_stops FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((( SELECT time_entries.tech_id
   FROM public.time_entries
  WHERE (time_entries.id = time_entry_stops.time_entry_id)) = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))));
CREATE POLICY time_entry_stops_select_policy ON public.time_entry_stops FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((( SELECT time_entries.tech_id
   FROM public.time_entries
  WHERE (time_entries.id = time_entry_stops.time_entry_id)) = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))));
CREATE POLICY time_entry_stops_update_policy ON public.time_entry_stops FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((( SELECT time_entries.tech_id
   FROM public.time_entries
  WHERE (time_entries.id = time_entry_stops.time_entry_id)) = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((( SELECT time_entries.tech_id
   FROM public.time_entries
  WHERE (time_entries.id = time_entry_stops.time_entry_id)) = auth.uid()) OR (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))));
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_notifications_select_policy ON public.user_notifications FOR SELECT TO authenticated USING (((recipient_id = auth.uid()) AND (org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid)));
CREATE POLICY user_notifications_update_policy ON public.user_notifications FOR UPDATE TO authenticated USING (((recipient_id = auth.uid()) AND (org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid))) WITH CHECK (((recipient_id = auth.uid()) AND (org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid)));
ALTER TABLE public.vendor_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_bills_delete_policy ON public.vendor_bills FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY vendor_bills_insert_policy ON public.vendor_bills FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY vendor_bills_select_policy ON public.vendor_bills FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY vendor_bills_update_policy ON public.vendor_bills FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendors_delete_policy ON public.vendors FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY vendors_insert_policy ON public.vendors FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY vendors_select_policy ON public.vendors FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY vendors_update_policy ON public.vendors FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.visit_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY visit_photos_delete_policy ON public.visit_photos FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY visit_photos_insert_policy ON public.visit_photos FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY visit_photos_select_policy ON public.visit_photos FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY visit_photos_update_policy ON public.visit_photos FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY warranty_claims_delete_policy ON public.warranty_claims FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY warranty_claims_insert_policy ON public.warranty_claims FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY warranty_claims_select_policy ON public.warranty_claims FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY warranty_claims_update_policy ON public.warranty_claims FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY weather_proposals_delete_policy ON public.weather_reschedule_proposals FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY weather_proposals_insert_policy ON public.weather_reschedule_proposals FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY weather_proposals_select_policy ON public.weather_reschedule_proposals FOR SELECT TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY weather_proposals_update_policy ON public.weather_reschedule_proposals FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.weather_reschedule_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY wo_line_items_delete_policy ON public.work_order_line_items FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY wo_line_items_insert_policy ON public.work_order_line_items FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY wo_line_items_select_policy ON public.work_order_line_items FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY wo_line_items_update_policy ON public.work_order_line_items FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.wo_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY wo_templates_delete_policy ON public.wo_templates FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY wo_templates_insert_policy ON public.wo_templates FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
CREATE POLICY wo_templates_select_policy ON public.wo_templates FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY wo_templates_update_policy ON public.wo_templates FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text]))));
ALTER TABLE public.work_order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_orders_delete_policy ON public.work_orders FOR DELETE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = 'owner'::text)));
CREATE POLICY work_orders_insert_policy ON public.work_orders FOR INSERT TO authenticated WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND (( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text, 'tech'::text]))));
CREATE POLICY work_orders_select_policy ON public.work_orders FOR SELECT TO authenticated USING ((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid));
CREATE POLICY work_orders_update_policy ON public.work_orders FOR UPDATE TO authenticated USING (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])) OR ((( SELECT (auth.jwt() ->> 'user_role'::text)) = 'tech'::text) AND (assigned_tech_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK (((org_id = (( SELECT (auth.jwt() ->> 'org_id'::text)))::uuid) AND ((( SELECT (auth.jwt() ->> 'user_role'::text)) = ANY (ARRAY['owner'::text, 'office'::text])) OR ((( SELECT (auth.jwt() ->> 'user_role'::text)) = 'tech'::text) AND (assigned_tech_id = ( SELECT auth.uid() AS uid))))));
