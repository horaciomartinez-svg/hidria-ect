# HIDRIA — verificación local de Fase 0 (PowerShell)
# Uso: pwsh -File hidria_coding_team/scripts/phase0_verify.ps1
# No imprime valores de secretos. Sale con código 1 si algo falla.

$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root
$fallos = 0
function Ok($m)   { Write-Host "  [OK]   $m" }
function Fail($m) { Write-Host "  [FAIL] $m"; $script:fallos++ }

Write-Host '== 1. .env presente y fuera de git =='
if (Test-Path '.env') { Ok '.env existe' } else { Fail '.env no existe' }
$tracked = git ls-files --error-unmatch .env 2>$null
if ($LASTEXITCODE -eq 0) { Fail '.env está versionado' } else { Ok '.env no trackeado' }

Write-Host '== 2. Variables del .env (solo presencia) =='
$requeridas = @('GITHUB_TOKEN','GITHUB_REPO','SUPABASE_URL','SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DB_PASSWORD','SUPABASE_PROJECT_REF',
  'CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID')
$lineas = Get-Content .env
foreach ($v in $requeridas) {
  $l = $lineas | Where-Object { $_ -match "^$v=" } | Select-Object -First 1
  if ($null -eq $l) { Fail "$v ausente" } else {
    $val = ($l -replace "^$v=",'').Trim()
    if ([string]::IsNullOrEmpty($val)) { Fail "$v vacío" } else { Ok "$v presente ($($val.Length) chars)" }
  }
}

Write-Host '== 3. .gitignore cubre secretos y artefactos =='
$gi = Get-Content .gitignore -Raw
foreach ($p in @('.env','node_modules/','dist/','reference/','supabase/.temp/','.wrangler/')) {
  if ($gi -match [regex]::Escape($p)) { Ok ".gitignore contiene $p" } else { Fail ".gitignore no contiene $p" }
}

Write-Host '== 4. Integridad docs/02 <-> migración base =='
$h1 = (Get-FileHash 'docs\02-supabase_schema_hidria_mdohi.sql' -Algorithm SHA256).Hash
$h2 = (Get-FileHash 'supabase\migrations\20261031000000_base_hidria_mdohi.sql' -Algorithm SHA256).Hash
if ($h1 -eq $h2) { Ok "hashes idénticos ($($h1.Substring(0,16))…)" } else { Fail 'docs/02 != migración base' }

Write-Host '== 5. .env.example sin valores reales =='
if (Select-String -Path '.env.example' -Pattern '^(SUPABASE_SERVICE_ROLE_KEY|GITHUB_TOKEN|CLOUDFLARE_API_TOKEN|SUPABASE_ANON_KEY)=.+' -Quiet) {
  Fail '.env.example parece tener valores reales'
} else { Ok '.env.example solo nombres/valores públicos' }

Write-Host '== 6. Rama y estado git =='
$branch = git rev-parse --abbrev-ref HEAD
Ok "rama actual: $branch"
if ($branch -eq 'main') { Write-Host '  [WARN] estás en main; los cambios deben ir por rama + PR' }

Write-Host ''
if ($fallos -ne 0) { Write-Host "RESULTADO: ROJO ($fallos fallo(s))"; exit 1 }
Write-Host 'RESULTADO: VERDE (verificación local Fase 0)'
