-- ────────────────────────────────── El Juramento ─────────────────────────────
--
-- `profiles.faction_id` nace con `'vantera'` por defecto y **no es escribible desde el
-- cliente** (GRANT de columna, migración 0001). Eso es correcto para cambiar de facción
-- —un Cisma cuesta Ceniza y renombre— pero deja un agujero en el primer paso: no había
-- forma de jurar, así que todo el mundo era de Vantera sin haberlo elegido y la pantalla
-- de Juramento del diseño no tenía dónde escribir.
--
-- Faltaba además poder distinguir «juré Vantera» de «nadie me ha preguntado nunca».
-- Con un `not null default` no se puede: los dos casos son la misma fila.

alter table public.profiles
  add column if not exists sworn_at timestamptz;

comment on column public.profiles.sworn_at is
  'Cuándo juró esta cuenta. Null = nunca eligió y `faction_id` es solo el valor por defecto.';

-- El primer juramento es gratis; cambiar después es un Cisma y tiene su propio precio
-- (FACTIONS.md §5), así que esta función se niega a repetir. Sin esa condición sería una
-- forma de cambiar de facción sin pagar, saltándose la regla entera desde el cliente.
create or replace function public.swear_oath(p_profile uuid, p_faction text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sworn timestamptz;
begin
  if p_faction not in ('vantera','koldvik','saranth','meridia','oshara','tarn') then
    return jsonb_build_object('ok', false, 'code', 'unknown_faction');
  end if;

  select sworn_at into v_sworn from public.profiles where id = p_profile;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_profile');
  end if;
  if v_sworn is not null then
    -- Cambiar de facción existe, pero es un Cisma y no pasa por aquí.
    return jsonb_build_object('ok', false, 'code', 'already_sworn');
  end if;

  update public.profiles
     set faction_id = p_faction, sworn_at = now()
   where id = p_profile and sworn_at is null;

  return jsonb_build_object('ok', true, 'faction_id', p_faction);
end;
$$;

-- Supabase concede `all on functions` a `anon` y `authenticated` por defecto, así que hay
-- que nombrarlos: `revoke ... from public` no toca los GRANT explícitos (lección 7).
revoke all on function public.swear_oath(uuid, text) from public, anon, authenticated;
