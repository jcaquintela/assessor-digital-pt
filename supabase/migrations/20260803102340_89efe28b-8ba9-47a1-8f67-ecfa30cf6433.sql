CREATE TABLE public.whatsapp_template_bindings (
  purpose text PRIMARY KEY,
  template_name text NOT NULL,
  language text NOT NULL DEFAULT 'pt_PT',
  param_count integer NOT NULL DEFAULT 3,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.whatsapp_template_bindings TO authenticated;
GRANT ALL ON public.whatsapp_template_bindings TO service_role;

ALTER TABLE public.whatsapp_template_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read template bindings"
ON public.whatsapp_template_bindings
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE TRIGGER whatsapp_template_bindings_touch
BEFORE UPDATE ON public.whatsapp_template_bindings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();