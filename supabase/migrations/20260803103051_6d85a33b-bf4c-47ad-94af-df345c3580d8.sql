REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  name,
  phone,
  assessor_name,
  primary_channel,
  onboarding_goals,
  onboarding_stage,
  onboarding_offers,
  onboarding_last_offer_at,
  updated_at
) ON public.profiles TO authenticated;