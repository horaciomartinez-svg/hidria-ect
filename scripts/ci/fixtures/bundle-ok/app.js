// Fixture POSITIVO de dist-scan (SEC-PR29-03): el literal `service_role` de la guarda
// build-time/UI/supabase-js es un aviso, no una credencial; no debe fallar el escaneo.
const guard = role === 'service_role';
const message = 'la clave service_role jamás se usa aquí';
