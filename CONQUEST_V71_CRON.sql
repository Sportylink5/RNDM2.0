-- Install AFTER CONQUEST_V71_SUPABASE.sql in the existing Supabase project.
-- Resolves arriving armies once per minute even when all players are offline.
-- Check Supabase Dashboard -> Integrations -> Cron if the extension is not enabled.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('rndm-cq71-orders', '* * * * *', 'select public.cq71_resolve_arrivals(50)');
-- For busy servers: configure a more frequent cron schedule as supported by your plan,
-- and distribute backend shards / workloads. Do not make browsers authoritative.
