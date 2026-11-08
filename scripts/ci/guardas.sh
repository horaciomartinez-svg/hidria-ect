#!/usr/bin/env bash
# =============================================================================
# HIDRIA — guardas de CI (Fase 0)
# Verifica: secretos, .env, integridad de migraciones, nomenclatura y artefactos.
# Uso: bash scripts/ci/guardas.sh
# Sale con código != 0 si alguna guarda falla.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
FALLOS=0
ok()   { printf '  [OK]   %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1"; FALLOS=$((FALLOS+1)); }

echo "== 1. .env fuera de git =="
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail ".env está versionado (debe estar en .gitignore)"
else
  ok ".env no está trackeado"
fi
if git ls-files --error-unmatch .env.example >/dev/null 2>&1; then
  ok ".env.example versionado (plantilla)"
else
  fail ".env.example no existe en el repo"
fi

echo "== 2. Secret scanning de archivos trackeados =="
PATRONES='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sbp_[a-f0-9]{40}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
if git grep -I -n -E "$PATRONES" -- . ':(exclude).env.example' ':(exclude)scripts/ci/guardas.sh' >/dev/null 2>&1; then
  echo "  Archivos con posible secreto:"
  git grep -I -n -E "$PATRONES" -- . ':(exclude).env.example' ':(exclude)scripts/ci/guardas.sh' | head -20
  fail "posible secreto en archivos trackeados"
else
  ok "sin patrones de secreto conocidos"
fi

echo "== 3. Integridad docs/02 <-> migración base =="
DOCS02="docs/02-supabase_schema_hidria_mdohi.sql"
MIGBASE="supabase/migrations/20261031000000_base_hidria_mdohi.sql"
if [ -f "$DOCS02" ] && [ -f "$MIGBASE" ]; then
  H1=$(sha256sum "$DOCS02" | cut -d' ' -f1)
  H2=$(sha256sum "$MIGBASE" | cut -d' ' -f1)
  if [ "$H1" = "$H2" ]; then ok "docs/02 byte-idéntico a la migración base"; else
    fail "docs/02 y la migración base difieren ($H1 != $H2)"; fi
else
  fail "faltan $DOCS02 o $MIGBASE"
fi

echo "== 4. .env.example sin valores reales =="
VIOLACIONES=$(awk -F= '/^[A-Z][A-Z0-9_]*=/ {
  var=$1; val=substr($0, index($0,"=")+1);
  if (var ~ /(TOKEN|KEY|PASSWORD|SECRET|SERVICE)/ && length(val) > 0 && val !~ /^[ ]*</ && var !~ /^R2_BUCKET/) print var
}' .env.example 2>/dev/null)
if [ -z "$VIOLACIONES" ]; then ok ".env.example no contiene valores de secretos"; else
  fail "variables con valor en .env.example: $VIOLACIONES"; fi

echo "== 5. Nomenclatura institucional (producto) =="
if grep -RIn -E 'UAT-CIT|Subsecretar[ií]a de Recursos H[ií]dricos y Desarrollo Sustentable' \
     app supabase 2>/dev/null | grep -v node_modules >/dev/null; then
  fail "nomenclatura prohibida en app/supabase"
else
  ok "sin nomenclatura prohibida en el producto"
fi

echo "== 6. Artefactos no versionados =="
if git ls-files | grep -E '(^|/)(node_modules|dist|coverage|\.temp|\.wrangler)/' >/dev/null 2>&1; then
  fail "artefactos de build/dependencias versionados"
else
  ok "sin node_modules/dist/coverage/.temp versionados"
fi

echo
if [ "$FALLOS" -ne 0 ]; then
  echo "RESULTADO: ROJO ($FALLOS guarda(s) fallaron)"
  exit 1
fi
echo "RESULTADO: VERDE (todas las guardas pasaron)"
