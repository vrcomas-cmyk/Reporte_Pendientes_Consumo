-- Reduce la carga del proyecto compartido (caída por saturación del 2026-11-18).
-- 1) Realtime: quita de la publicación las tablas legado que ningún cliente escucha
--    (cada cambio en ellas obligaba a Realtime a leer/decodificar el WAL).
-- 2) pg_cron: purga diaria del historial de ejecuciones (más de 7 días).

do $$
declare t text;
begin
  foreach t in array array['tasks', 'task_history', 'attachments', 'pendientes', 'notas'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

select cron.unschedule('purgar-cron-historial')
where exists (select 1 from cron.job where jobname = 'purgar-cron-historial');

select cron.schedule(
  'purgar-cron-historial',
  '30 8 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
