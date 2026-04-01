$PipelineDir = "C:\Users\venob\Downloads\art-pipeline"
$SiteDir = "C:\Users\venob\Downloads\neocities-coiledlamb(1)"

$NeocitiesFiguresUrl = "https://coiledlamb.neocities.org/figures.html"
$LocalPort = 3000
$LocalFiguresUrl = "http://localhost:$LocalPort/figures.html"

$LogDir = Join-Path $PipelineDir "logs"
if (!(Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

function ColorText($hex, $text) {
    $r = [Convert]::ToInt32($hex.Substring(1, 2), 16)
    $g = [Convert]::ToInt32($hex.Substring(3, 2), 16)
    $b = [Convert]::ToInt32($hex.Substring(5, 2), 16)
    return "$([char]27)[38;2;${r};${g};${b}m${text}$([char]27)[0m"
}

function Write-Header($text) {
    Clear-Host
    Write-Host (ColorText "#FFFFFF" "========================================")
    Write-Host (ColorText "#FFFFFF" "  $text")
    Write-Host (ColorText "#FFFFFF" "========================================")
    Write-Host ""
}

function Pause-Return {
    Write-Host ""
    Read-Host "Press Enter to return to menu"
}

function Test-CommandExists($command) {
    return $null -ne (Get-Command $command -ErrorAction SilentlyContinue)
}

function Get-Timestamp {
    return Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
}

function Write-Menu {
    Write-Header "ART PIPELINE LAUNCHER"

    Write-Host (ColorText "#FFFFFF" "1. Watch   — watch incoming/ for new files")
    Write-Host (ColorText "#c3d7d3" "2. Sync    — add new files from incoming/")
    Write-Host (ColorText "#86c7c9" "3. Rebuild — wipe processed/, sync from scratch")
    Write-Host (ColorText "#54bcc3" "4. Prune   — clean up gallery and remote orphans")
    Write-Host (ColorText "#2ba3a8" "5. Preview — open local figures page")
    Write-Host (ColorText "#159fa5" "6. Live    — open live Neocities page")
    Write-Host (ColorText "#888888" "7. Exit")
    Write-Host ""

    Write-Host (ColorText "#FFFFFF" "Pipeline: $PipelineDir")
    Write-Host (ColorText "#FFFFFF" "Live:     $NeocitiesFiguresUrl")
    Write-Host ""
}

function Run-LoggedCommand {
    param(
        [string]$WorkingDir,
        [string]$DisplayName,
        [string]$CommandLine,
        [string]$LogPrefix,
        [bool]$LongRunning = $false
    )

    if (!(Test-Path $WorkingDir)) {
        Write-Host "Directory not found: $WorkingDir" -ForegroundColor Red
        Pause-Return
        return
    }

    $timestamp = Get-Timestamp
    $logFile = Join-Path $LogDir "${LogPrefix}_${timestamp}.log"

    Write-Header $DisplayName
    Write-Host (ColorText "#FFFFFF" "Working directory: $WorkingDir")
    Write-Host (ColorText "#FFFFFF" "Log file:          $logFile")
    Write-Host ""
    Write-Host (ColorText "#FFFFFF" "Running: $CommandLine")
    Write-Host ""

    if ($LongRunning) {
        Write-Host (ColorText "#FFFFFF" "This is a long-running process.")
        Write-Host (ColorText "#FFFFFF" "Press Ctrl+C to stop it and return to the menu.")
        Write-Host ""
    }

    Push-Location $WorkingDir
    try {
        cmd /c "$CommandLine 2>&1" | Tee-Object -FilePath $logFile
    }
    finally {
        Pop-Location
    }

    Write-Host ""
    Write-Host (ColorText "#FFFFFF" "Finished. Log saved to: $logFile")

    if ($LongRunning) {
        Write-Host ""
        Write-Host (ColorText "#FFFFFF" "Process stopped. Returning to menu...")
        Start-Sleep -Milliseconds 700
    }
    else {
        Pause-Return
    }
}

function Run-Rebuild {
    Write-Header "REBUILD"
    Write-Host (ColorText "#d74200" "This wipes processed/ and rebuilds gallery from remote state.")
    Write-Host (ColorText "#FFFFFF" "Images already on Neocities will NOT be re-uploaded.")
    Write-Host ""
    $confirm = Read-Host (ColorText "#d74200" "Type REBUILD to proceed, or anything else to cancel")

    if ($confirm -eq "REBUILD") {
        Run-LoggedCommand `
            -WorkingDir $PipelineDir `
            -DisplayName "REBUILD" `
            -CommandLine "node index.js sync --clean" `
            -LogPrefix "sync_rebuild" `
            -LongRunning $false
    }
    else {
        Write-Host ""
        Write-Host (ColorText "#888888" "Cancelled.")
        Pause-Return
    }
}

function Run-Prune {
    Write-Header "PRUNE"
    Write-Host (ColorText "#FFFFFF" "Running dry-run first...")
    Write-Host ""

    Push-Location $PipelineDir
    try {
        node index.js prune
    }
    finally {
        Pop-Location
    }

    Write-Host ""
    $confirm = Read-Host (ColorText "#d74200" "Type DELETE to apply, or anything else to cancel")

    if ($confirm -eq "DELETE") {
        $timestamp = Get-Timestamp
        $logFile = Join-Path $LogDir "prune_${timestamp}.log"
        Write-Host ""
        Write-Host (ColorText "#FFFFFF" "Applying prune...")
        Push-Location $PipelineDir
        try {
            cmd /c "node index.js prune --confirm 2>&1" | Tee-Object -FilePath $logFile
        }
        finally {
            Pop-Location
        }
        Write-Host ""
        Write-Host (ColorText "#FFFFFF" "Done. Log saved to: $logFile")
    }
    else {
        Write-Host ""
        Write-Host (ColorText "#888888" "Cancelled.")
    }

    Pause-Return
}

function Open-Preview {
    if (!(Test-CommandExists "python")) {
        Write-Host "Python not found on PATH." -ForegroundColor Red
        Pause-Return
        return
    }

    Write-Header "LOCAL PREVIEW"
    Write-Host (ColorText "#FFFFFF" "Starting preview server...")
    Write-Host (ColorText "#FFFFFF" "URL: $LocalFiguresUrl")
    Write-Host ""

    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$SiteDir'; python -m http.server $LocalPort"
    Start-Sleep -Milliseconds 500
    Start-Process $LocalFiguresUrl

    Pause-Return
}

while ($true) {
    Write-Menu
    $choice = Read-Host "Select an option"

    switch ($choice) {
        "1" {
            Run-LoggedCommand `
                -WorkingDir $PipelineDir `
                -DisplayName "WATCH" `
                -CommandLine "node index.js watch" `
                -LogPrefix "watch" `
                -LongRunning $true
        }
        "2" {
            Run-LoggedCommand `
                -WorkingDir $PipelineDir `
                -DisplayName "SYNC" `
                -CommandLine "node index.js sync" `
                -LogPrefix "sync" `
                -LongRunning $false
        }
        "3" { Run-Rebuild }
        "4" { Run-Prune }
        "5" { Open-Preview }
        "6" { Start-Process $NeocitiesFiguresUrl }
        "7" { break }
        default {
            Write-Host ""
            Write-Host "Invalid option." -ForegroundColor Red
            Pause-Return
        }
    }
}
