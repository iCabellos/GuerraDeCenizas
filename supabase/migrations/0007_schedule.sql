-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ 0007 · El reloj                                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- Vercel Hobby permite **un cron diario**. Los turnos en cadencia Blitz vencen cada tres
-- minutos, así que el reloj no puede vivir en Vercel: vive en Supabase, con `pg_cron`
-- llamando cada minuto a `/api/cron/resolve-due` por `pg_net` ([ADR-014](../docs/DECISIONS.md#adr-014)).
--
-- Es el **segundo** de los tres disparadores. El primero —el último jugador que envía
-- órdenes— cubre el 85 % de los turnos; el tercero es oportunista, cualquier petición de
-- cliente que detecte un plazo vencido. Los tres convergen en la misma función
-- idempotente, así que solaparse no hace daño.
--
-- Todo el archivo está condicionado a que las extensiones existan. El arnés local de
-- tests corre sobre un PostgreSQL pelado sin `pg_cron` ni `pg_net`, y una migración que
-- reventara ahí dejaría los tests de RLS sin poder ejecutarse — que es exactamente lo que
-- no puede pasar con un test bloqueante.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron no disponible: se omite la programación del reloj';
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  -- La URL y el secreto viven en `vault`, no en el cuerpo de la función: si estuvieran
  -- aquí, cualquiera con acceso al catálogo leería el secreto del cron.
  if not exists (select 1 from cron.job where jobname = 'gdc-resolve-due') then
    perform cron.schedule(
      'gdc-resolve-due',
      '* * * * *',
      $cron$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets
                       where name = 'gdc_resolve_url'),
          headers := jsonb_build_object(
                       'Content-Type', 'application/json',
                       'Authorization', 'Bearer ' || (select decrypted_secret
                                                        from vault.decrypted_secrets
                                                       where name = 'gdc_cron_secret')),
          body    := '{}'::jsonb,
          timeout_milliseconds := 8000
        );
      $cron$
    );
  end if;
end $$;

-- ─────────────────────────────── Puesta en marcha ─────────────────────────────
--
-- Una sola vez por proyecto, desde el SQL Editor de Supabase:
--
--   select vault.create_secret('https://TU-APP.vercel.app/api/cron/resolve-due',
--                              'gdc_resolve_url');
--   select vault.create_secret('EL-MISMO-VALOR-QUE-CRON_SECRET-EN-VERCEL',
--                              'gdc_cron_secret');
--
-- Comprobar que late:
--
--   select * from cron.job where jobname = 'gdc-resolve-due';
--   select * from cron.job_run_details order by start_time desc limit 10;
--
-- Sin el secreto, `/api/cron/resolve-due` sería una forma pública de forzar la resolución
-- de cualquier partida vencida — y de averiguar cuáles lo están.
