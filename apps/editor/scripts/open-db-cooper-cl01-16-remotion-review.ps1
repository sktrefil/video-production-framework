$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$props = 'output/db-cooper-v3/review/remotion-cl01-16-v1/remotion-props.json'
if (-not (Test-Path -LiteralPath $props)) {
  python scripts/prepare-db-cooper-cl01-16-remotion-review.py
}
npx remotion studio src/index.ts "--props=$props"
