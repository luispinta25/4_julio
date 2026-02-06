-- ==========================================================
-- MODULO DE CONVOCATORIAS Y ASISTENCIA (UNORIC)
-- ==========================================================

-- 1. TABLA DE EVENTOS / CONVOCATORIAS
-- Almacena la información principal del evento: Minga, Asamblea, etc.
CREATE TABLE IF NOT EXISTS public.unoric_eventos (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tipo text NOT NULL, -- 'MINGA', 'ASAMBLEA', 'SESION', 'EVENTO_SOCIAL'
    descripcion text NOT NULL,
    fecha date NOT NULL,
    hora_inicio time NOT NULL,
    hora_toma_lista time NOT NULL, -- Hora a partir de la cual se considera atraso o se cierra puntualidad
    multa_ausencia numeric(10, 2) NOT NULL DEFAULT 0, -- Si es 0, no se genera multa económica
    alcance text NOT NULL DEFAULT 'GENERAL', -- 'GENERAL', 'ETAPA_1', 'ETAPA_2', 'ETAPA_3', 'CON_LOTES'
    estado text NOT NULL DEFAULT 'PENDIENTE', -- 'PENDIENTE' (Creada), 'EN_CURSO' (Toma de lista), 'FINALIZADO' (Asistencias cerradas), 'CANCELADO'
    notas_asistencia text NULL, -- Notas generales del resultado del evento
    
    created_by uuid NOT NULL DEFAULT auth.uid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    
    CONSTRAINT unoric_eventos_pkey PRIMARY KEY (id),
    CONSTRAINT unoric_eventos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users (id)
) TABLESPACE pg_default;

-- 2. TABLA DE ASISTENCIAS
-- Registra el estado de cada socio convocado al evento
CREATE TABLE IF NOT EXISTS public.unoric_asistencias (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    evento_id uuid NOT NULL,
    cedula_socio text NOT NULL,
    estado text NOT NULL DEFAULT 'AUSENTE', -- 'PUNTUAL', 'ATRASADO', 'AUSENTE', 'JUSTIFICADO'
    hora_llegada timestamp with time zone NULL,
    multa_aplicada numeric(10, 2) NOT NULL DEFAULT 0, -- El valor real de la multa al momento del cierre
    pago_id uuid NULL, -- Referencia opcional a la deuda generada en unoric_pagos
    observaciones text NULL,
    
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    
    CONSTRAINT unoric_asistencias_pkey PRIMARY KEY (id),
    CONSTRAINT unoric_asistencias_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.unoric_eventos (id) ON DELETE CASCADE,
    CONSTRAINT unoric_asistencias_cedula_socio_fkey FOREIGN KEY (cedula_socio) REFERENCES public.unoric_socios (cedula),
    CONSTRAINT unoric_asistencias_evento_socio_unique UNIQUE (evento_id, cedula_socio)
) TABLESPACE pg_default;

-- 3. SEGURIDAD (RLS)
ALTER TABLE public.unoric_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unoric_asistencias ENABLE ROW LEVEL SECURITY;

-- Políticas para unoric_eventos
CREATE POLICY "Authenticated users can read events" 
ON public.unoric_eventos FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can manage events" 
ON public.unoric_eventos FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Políticas para unoric_asistencias
CREATE POLICY "Authenticated users can read attendance" 
ON public.unoric_asistencias FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can manage attendance" 
ON public.unoric_asistencias FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- 4. ÍNDICES PARA OPTIMIZACIÓN
CREATE INDEX IF NOT EXISTS idx_unoric_eventos_fecha ON public.unoric_eventos (fecha);
CREATE INDEX IF NOT EXISTS idx_unoric_eventos_estado ON public.unoric_eventos (estado);
CREATE INDEX IF NOT EXISTS idx_unoric_asistencias_evento ON public.unoric_asistencias (evento_id);
CREATE INDEX IF NOT EXISTS idx_unoric_asistencias_socio ON public.unoric_asistencias (cedula_socio);

-- 5. FUNCTION & TRIGGER PARA UPDATED_AT
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER tr_unoric_eventos_updated_at
    BEFORE UPDATE ON public.unoric_eventos
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER tr_unoric_asistencias_updated_at
    BEFORE UPDATE ON public.unoric_asistencias
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
