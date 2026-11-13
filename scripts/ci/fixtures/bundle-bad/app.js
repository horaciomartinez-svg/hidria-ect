// Fixture NEGATIVO de dist-scan (SEC-PR29-03): credenciales de servicio inyectadas.
// No es una clave real: secretos sintéticos para probar que CI falla si aparecen en el bundle.
const leak = 'sb_secret_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const cfg = { SUPABASE_SERVICE_ROLE_KEY: 'fixture-value-1234567890' };
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwic3ViIjoiZml4dHVyZSJ9.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const guard = role === 'service_role';
