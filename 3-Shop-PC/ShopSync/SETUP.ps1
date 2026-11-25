# Shop setup. Please use "START HERE - SETUP.bat" instead of running this file directly.
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfgPath = Join-Path $dir "sync-config.json"
$ps32 = Join-Path $env:WINDIR "SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
function Say($m, $c = "White") { Write-Host $m -ForegroundColor $c }
function Fail($m) {
  Say ""; Say "STOPPED: $m" Red
  Say "Please take a photo of this screen and send it to the person who gave you this kit."
  Read-Host "Press Enter to close"; exit 1
}

Say "=== Shop setup for this shop computer ===" Cyan
if ($dir -match "OneDrive") { Fail "This folder is inside OneDrive. Move the folder ShopSync to the C: drive (so it becomes C:\ShopSync), then run START HERE again." }
if (-not (Test-Path $cfgPath)) { Fail "The file sync-config.json is missing from this folder." }
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
function Set-Cfg($name, $value) {
  if ($cfg.PSObject.Properties.Name -contains $name) { $cfg.$name = $value } else { $cfg | Add-Member -NotePropertyName $name -NotePropertyValue $value }
}

if ($cfg.supabase_url -match "YOUR-PROJECT" -or $cfg.supabase_key -match "PASTE") {
  Say "The cloud details are not filled in yet." Yellow
  Set-Cfg "supabase_url" (Read-Host "Paste the Supabase Project URL")
  Set-Cfg "supabase_key" (Read-Host "Paste the Supabase secret key")
}

if (-not $cfg.home_state) {
  Say "What is the shop's GST number (GSTIN)? The first two digits are the state code (36 = Telangana, 37 = Andhra Pradesh). Press Enter to skip and use 36." Cyan
  $g = (Read-Host "GSTIN").Trim()
  $hs = if ($g.Length -ge 2 -and $g.Substring(0, 2) -match '^\d\d$') { $g.Substring(0, 2) } else { "36" }
  Set-Cfg "home_state" $hs
}

if (-not $cfg.data_file -or -not (Test-Path $cfg.data_file)) {
  Say "Step 1 of 4: looking for the Profit Maker data file. This can take a few minutes, please wait..." Cyan
  $found = @()
  foreach ($d in (Get-PSDrive -PSProvider FileSystem)) {
    if (-not $d.Root -or -not (Test-Path $d.Root)) { continue }
    $found += Get-ChildItem $d.Root -Recurse -File -Filter "Data*.mdb" -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '^Data\d{4}\.mdb$' -and $_.Length -gt 1MB -and $_.FullName -notmatch '\\Temp\\|\\Windows\\|Backup|ProfitBk|ShopSync|ShopBackups' }
  }
  $found = @($found | Sort-Object LastWriteTime -Descending | Select-Object -First 6)
  if ($found.Count -eq 0) {
    $p = (Read-Host "Could not find it. Type the full path of the Data....Mdb file").Trim('"')
    if (-not (Test-Path $p)) { Fail "That file does not exist." }
    Set-Cfg "data_file" $p
  } elseif ($found.Count -eq 1) {
    Set-Cfg "data_file" $found[0].FullName; Say "Found: $($found[0].FullName)" Green
  } else {
    Say "Found more than one. Which is the CURRENT year (the one changed most recently)?"
    for ($i = 0; $i -lt $found.Count; $i++) { Say ("  {0}) {1}   (changed {2})" -f ($i + 1), $found[$i].FullName, $found[$i].LastWriteTime) }
    $n = [int](Read-Host "Type the number and press Enter")
    if ($n -lt 1 -or $n -gt $found.Count) { Fail "That number is not in the list." }
    Set-Cfg "data_file" $found[$n - 1].FullName
  }
}
if (-not $cfg.backup_folder) { Set-Cfg "backup_folder" $(if (Test-Path "D:\") { "D:\ShopBackups" } else { "C:\ShopBackups" }) }
if (-not (Test-Path $cfg.backup_folder)) { New-Item -ItemType Directory -Path $cfg.backup_folder | Out-Null }
$cfg | ConvertTo-Json | Set-Content $cfgPath -Encoding UTF8

Say "Step 2 of 4: making a first backup..." Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "auto-backup.ps1")
if ($LASTEXITCODE -ne 0) { Fail "The backup did not work. Open auto-backup.log in this folder to see why." }
Say "Backup OK." Green

Say "Step 3 of 4: sending the data to the cloud (the first time can take a minute)..." Cyan
& $ps32 -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "sync.ps1")
if ($LASTEXITCODE -ne 0) { Fail "The upload did not work. Open sync.log in this folder to see why." }
Say "Upload OK." Green

Say "Step 4 of 4: setting up automatic running (backup every 2 hours, upload every 30 minutes)..." Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "install-schedule.ps1")

Say ""; Say "ALL DONE. You can close this window. Keep this computer switched on during shop hours." Green
Read-Host "Press Enter to close"
