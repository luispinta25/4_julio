-- Añadir columnas para lugar y punto de encuentro en eventos
ALTER TABLE public.unoric_eventos 
ADD COLUMN IF NOT EXISTS lugar text,
ADD COLUMN IF NOT EXISTS punto_encuentro text,
ADD COLUMN IF NOT EXISTS alcance_detalle text;
