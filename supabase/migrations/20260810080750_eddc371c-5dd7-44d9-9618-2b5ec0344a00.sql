WITH explicit_answers AS (
  SELECT DISTINCT ON (n.user_id, n.subject_id)
    n.user_id,
    n.subject_id,
    CASE
      WHEN lower(trim(m.content)) IN ('sim', 'sim!', 'ok', 'pode ser', 'claro') THEN 'yes'
      WHEN lower(trim(m.content)) IN ('não', 'nao', 'não!', 'nao!') THEN 'no'
    END AS answer,
    m.created_at AS answered_at
  FROM public.assessor_nudges n
  JOIN public.assessor_messages m
    ON m.user_id = n.user_id
   AND m.role = 'user'
   AND m.created_at >= n.sent_at
   AND m.created_at <= n.sent_at + interval '15 minutes'
  WHERE n.kind = 'property_missing_docs'
    AND n.sent_at IS NOT NULL
    AND lower(trim(m.content)) IN ('sim', 'sim!', 'ok', 'pode ser', 'claro', 'não', 'nao', 'não!', 'nao!')
  ORDER BY n.user_id, n.subject_id, m.created_at DESC
)
UPDATE public.assessor_nudges n
SET status = 'resolved',
    outcome = a.answer,
    outcome_at = a.answered_at,
    updated_at = now()
FROM explicit_answers a
WHERE n.user_id = a.user_id
  AND n.subject_id = a.subject_id
  AND n.kind = 'property_missing_docs'
  AND n.outcome_at IS NULL;