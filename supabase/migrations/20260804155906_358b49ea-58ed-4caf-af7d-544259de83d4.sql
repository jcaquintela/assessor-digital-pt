WITH q AS (
  SELECT s.id, t.user_id, t.channel, t.input_content, t.created_at
  FROM public.assessor_quality_scores s JOIN public.assessor_reasoning_traces t ON t.id=s.trace_id
), ctx AS (
  SELECT q.*, p.content prev_msg, p.created_at prev_at,
    (SELECT m.content FROM public.assessor_messages m WHERE m.user_id=q.user_id AND m.channel=q.channel AND m.role='assistant' AND m.created_at<q.created_at ORDER BY m.created_at DESC LIMIT 1) last_reply
  FROM q LEFT JOIN LATERAL (
    SELECT content, created_at FROM (
      SELECT m.content, m.created_at, row_number() OVER (ORDER BY m.created_at DESC) rn
      FROM public.assessor_messages m
      WHERE m.user_id=q.user_id AND m.channel=q.channel AND m.role='user' AND m.created_at<q.created_at
      ORDER BY m.created_at DESC LIMIT 3) x
    WHERE rn = (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM public.assessor_messages m2 WHERE m2.user_id=q.user_id AND m2.channel=q.channel AND m2.role='user'
          AND m2.created_at<q.created_at AND btrim(m2.content)=btrim(q.input_content)
          AND m2.created_at=(SELECT max(m3.created_at) FROM public.assessor_messages m3 WHERE m3.user_id=q.user_id AND m3.channel=q.channel AND m3.role='user' AND m3.created_at<q.created_at)
      ) THEN 2 ELSE 1 END) LIMIT 1) p ON true
), sim AS (
  SELECT c.*, EXTRACT(epoch FROM (c.created_at-c.prev_at)) dt,
   COALESCE((SELECT cardinality(ARRAY(SELECT unnest(z.a) INTERSECT SELECT unnest(z.b)))::numeric/NULLIF(cardinality(ARRAY(SELECT unnest(z.a) UNION SELECT unnest(z.b))),0)
    FROM (SELECT
     ARRAY(SELECT DISTINCT w FROM unnest(regexp_split_to_array(lower(regexp_replace(translate(c.input_content,'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ','aaaaeeioooucAAAAEEIOOOUC'),'[^a-zA-Z0-9 ]',' ','g')),'\s+')) w WHERE length(w)>1 AND w NOT IN ('de','da','do','das','dos','um','uma','que','para','por','com','no','na','nos','nas','em','ao','as','os','se','ou')) a,
     ARRAY(SELECT DISTINCT w FROM unnest(regexp_split_to_array(lower(regexp_replace(translate(COALESCE(c.prev_msg,''),'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ','aaaaeeioooucAAAAEEIOOOUC'),'[^a-zA-Z0-9 ]',' ','g')),'\s+')) w WHERE length(w)>1 AND w NOT IN ('de','da','do','das','dos','um','uma','que','para','por','com','no','na','nos','nas','em','ao','as','os','se','ou')) b) z),0) jac
  FROM ctx c
), cls AS (
  SELECT id,
   CASE WHEN prev_msg IS NULL OR dt IS NULL OR dt<0 OR dt>600 THEN false
        WHEN jac>=0.9 THEN true
        WHEN last_reply ~ '\?\s*$' THEN false
        WHEN dt>60 THEN false
        WHEN jac>=0.6 OR input_content ~* '(nao e|nao era|errado|erraste|quis dizer|queria dizer|afinal|alias|corrige|troca|substitui)' THEN true
        ELSE false END novo FROM sim)
UPDATE public.assessor_quality_scores s
SET reformulated = c.novo,
    score = round((
      (CASE WHEN s.understood_first_try THEN 1 ELSE 0 END)
      + (CASE WHEN c.novo THEN 0 ELSE 1 END)
      + (CASE WHEN s.executed_successfully THEN 1 ELSE 0 END)
      + (CASE WHEN s.human_tone THEN 1 ELSE 0 END)
    )::numeric / NULLIF((
      (CASE WHEN s.understood_first_try IS NULL THEN 0 ELSE 1 END)
      + 1
      + (CASE WHEN s.executed_successfully IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN s.human_tone IS NULL THEN 0 ELSE 1 END)
    ),0), 3)
FROM cls c WHERE c.id = s.id AND s.reformulated IS DISTINCT FROM c.novo;