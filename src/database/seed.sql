-- Seed data: sample meditations for each category and level

-- Admin user (password: admin123 - change in production!)
INSERT INTO users (id, email, password_hash, full_name, is_admin) VALUES
('00000000-0000-0000-0000-000000000001',
 'admin@mindreprogram.com',
 '$2a$10$dummy_hash_replace_on_init',
 'Admin MindReprogram',
 TRUE);

-- Sample meditations
INSERT INTO meditations (title, description, category, duration_minutes, unlock_level, min_tier, audio_s3_key, neural_target, tags) VALUES

-- ADHD Category
('Enfoque Inicial - Respiracion Consciente', 'Meditacion introductoria para calmar la mente dispersa y encontrar un punto de enfoque.', 'adhd', 5, 1, 'basic', 'meditations/adhd/level1_enfoque_inicial.mp3', 'beta', '{enfoque,respiracion,principiante}'),
('Atencion Plena en el Presente', 'Practica de mindfulness diseñada para fortalecer la atencion sostenida.', 'adhd', 8, 2, 'basic', 'meditations/adhd/level2_atencion_plena.mp3', 'beta', '{mindfulness,atencion,presente}'),
('Regulacion Dopaminergica', 'Visualizacion guiada para equilibrar los circuitos de recompensa del cerebro.', 'adhd', 10, 3, 'basic', 'meditations/adhd/level3_dopamina.mp3', 'alpha', '{dopamina,regulacion,visualizacion}'),
('Flujo de Concentracion Profunda', 'Sesion intermedia para entrar en estado de flujo y mantener la concentracion.', 'adhd', 15, 5, 'premium', 'meditations/adhd/level5_flujo.mp3', 'alpha', '{flujo,concentracion,intermedio}'),
('Reprogramacion Neural ADHD', 'Sesion avanzada de reprogramacion subconsciente para patrones de atencion.', 'adhd', 40, 10, 'pro', 'meditations/adhd/level10_reprogramacion.mp3', 'theta', '{reprogramacion,avanzado,neuroplasticidad}'),

-- Depression Category
('Luz Interior - Primer Paso', 'Meditacion suave para conectar con tu energia vital y sembrar esperanza.', 'depression', 5, 1, 'basic', 'meditations/depression/level1_luz_interior.mp3', 'alpha', '{esperanza,energia,suave}'),
('Liberacion de Patrones Rumiativos', 'Tecnica guiada para soltar pensamientos repetitivos y negativos.', 'depression', 8, 2, 'basic', 'meditations/depression/level2_liberacion.mp3', 'alpha', '{rumiacion,soltar,liberacion}'),
('Activacion Serotoninica', 'Visualizacion para estimular la produccion natural de serotonina.', 'depression', 15, 4, 'premium', 'meditations/depression/level4_serotonina.mp3', 'theta', '{serotonina,bioquimica,visualizacion}'),
('Auto-Compasion Profunda', 'Practica de amor propio y auto-compasion basada en tecnicas terapeuticas.', 'depression', 25, 7, 'premium', 'meditations/depression/level7_compasion.mp3', 'theta', '{autocompasion,amor,terapeutico}'),

-- Anxiety Category
('Regulacion Vagal - Calma Inmediata', 'Tecnica de respiracion 4-7-8 para activar el nervio vago y calmar la ansiedad.', 'anxiety', 5, 1, 'basic', 'meditations/anxiety/level1_vagal.mp3', 'alpha', '{vagal,respiracion,calma}'),
('Grounding - Anclaje al Presente', 'Ejercicio de los 5 sentidos para anclarte al momento presente.', 'anxiety', 8, 2, 'basic', 'meditations/anxiety/level2_grounding.mp3', 'alpha', '{grounding,sentidos,presente}'),
('Disolucion del Miedo', 'Meditacion para identificar, aceptar y disolver patrones de miedo.', 'anxiety', 15, 5, 'premium', 'meditations/anxiety/level5_miedo.mp3', 'theta', '{miedo,aceptacion,disolucion}'),

-- Sleep Category
('Descanso Delta - Sueno Reparador', 'Induccion al sueno profundo mediante ondas delta y relajacion progresiva.', 'sleep', 10, 1, 'basic', 'meditations/sleep/level1_delta.mp3', 'delta', '{delta,sueno,relajacion}'),
('Hipnosis para Insomnio', 'Sesion de hipnosis terapeutica para reprogramar patrones de sueno.', 'sleep', 25, 6, 'premium', 'meditations/sleep/level6_hipnosis.mp3', 'delta', '{hipnosis,insomnio,reprogramacion}'),
('Viaje Nocturno de Sanacion', 'Meditacion extendida para un descanso profundo y restaurador.', 'sleep', 60, 12, 'pro', 'meditations/sleep/level12_sanacion.mp3', 'delta', '{sanacion,profundo,restaurador}'),

-- Trauma Category
('Ventana de Tolerancia', 'Introduccion suave al trabajo con trauma, estableciendo un espacio seguro.', 'trauma', 5, 1, 'basic', 'meditations/trauma/level1_ventana.mp3', 'alpha', '{seguridad,tolerancia,suave}'),
('Somatic Experiencing Guiado', 'Tecnica de liberacion somatica para procesar trauma almacenado en el cuerpo.', 'trauma', 15, 4, 'premium', 'meditations/trauma/level4_somatic.mp3', 'theta', '{somatico,cuerpo,liberacion}'),

-- Focus Category
('Micro-Enfoque 5 Minutos', 'Sesion rapida de enfoque para antes de trabajar o estudiar.', 'focus', 5, 1, 'basic', 'meditations/focus/level1_micro.mp3', 'beta', '{rapido,trabajo,estudio}'),
('Estado de Flujo Creativo', 'Meditacion para entrar en estado de flujo y potenciar la creatividad.', 'focus', 25, 8, 'premium', 'meditations/focus/level8_flujo_creativo.mp3', 'gamma', '{flujo,creatividad,gamma}');
