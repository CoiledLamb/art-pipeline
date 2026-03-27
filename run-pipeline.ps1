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

    Write-Host (ColorText "#FFFFFF" "1. Watch pipeline")
    Write-Host (ColorText "#c3d7d3" "2. Sync pipeline")
    Write-Host (ColorText "#86c7c9" "3. Start local figures preview server")
    Write-Host (ColorText "#54bcc3" "4. Open local figures page in browser")
    Write-Host (ColorText "#159fa5" "5. Open live Neocities figures page")
    Write-Host (ColorText "#d74200" "6. Prune (placeholder)")
    Write-Host (ColorText "#888888" "7. Exit")
    Write-Host ""

    Write-Host (ColorText "#FFFFFF" "Pipeline repo: $PipelineDir")
    Write-Host (ColorText "#FFFFFF" "Site repo:     $SiteDir")
    Write-Host (ColorText "#FFFFFF" "Local page:    $LocalFiguresUrl")
    Write-Host (ColorText "#FFFFFF" "Live page:     $NeocitiesFiguresUrl")
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
    Write-Host (ColorText "#FFFFFF" "Finished. Log saved to:")
    Write-Host (ColorText "#FFFFFF" $logFile)

    if ($LongRunning) {
        Write-Host ""
        Write-Host (ColorText "#FFFFFF" "Process stopped. Returning to menu...")
        Start-Sleep -Milliseconds 700
    }
    else {
        Pause-Return
    }
}

function Start-LocalPreviewServer {
    if (!(Test-Path $SiteDir)) {
        Write-Host "Site directory not found: $SiteDir" -ForegroundColor Red
        Pause-Return
        return
    }

    $figuresPath = Join-Path $SiteDir "figures.html"
    if (!(Test-Path $figuresPath)) {
        Write-Host "figures.html not found at: $figuresPath" -ForegroundColor Red
        Pause-Return
        return
    }

    if (!(Test-CommandExists "python")) {
        Write-Host "Python was not found on PATH." -ForegroundColor Red
        Write-Host "Install Python or switch this launcher to a Node static server." -ForegroundColor Yellow
        Pause-Return
        return
    }

    Write-Header "LOCAL FIGURES PREVIEW"

    Write-Host (ColorText "#FFFFFF" "Starting local preview server in a new window...")
    Write-Host (ColorText "#FFFFFF" "Browser URL: $LocalFiguresUrl")
    Write-Host ""

    # Start server in a NEW PowerShell window
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$SiteDir'; python -m http.server $LocalPort"

    # Open browser
    Start-Sleep -Milliseconds 500
    Start-Process $LocalFiguresUrl

    Pause-Return
}

function Open-LocalFigures {
    Start-Process $LocalFiguresUrl
    Pause-Return
}

function Open-LiveFigures {
    Start-Process $NeocitiesFiguresUrl
}

function Show-PrunePlaceholder {
    Write-Header "PRUNE MODE"
    Write-Host (ColorText "#d74200" "Prune is not implemented yet.")
    Write-Host ""
    Write-Host (ColorText "#FFFFFF" "When added, it should:")
    Write-Host (ColorText "#FFFFFF" " - default to dry-run")
    Write-Host (ColorText "#FFFFFF" " - show exactly what would be removed")
    Write-Host (ColorText "#FFFFFF" " - require explicit confirmation before deletion")
    Write-Host ""
    Write-Host (ColorText "#FFFFFF" "Suggested future confirmation flow:")
    Write-Host (ColorText "#888888" "  1. node index.js prune --dry-run")
    Write-Host (ColorText "#888888" "  2. review output")
    Write-Host (ColorText "#888888" "  3. type DELETE to continue")
    Pause-Return
}

while ($true) {
    Write-Menu
    $choice = Read-Host "Select an option"

    switch ($choice) {
        "1" {
            Run-LoggedCommand `
                -WorkingDir $PipelineDir `
                -DisplayName "WATCH MODE" `
                -CommandLine "node index.js watch" `
                -LogPrefix "watch" `
                -LongRunning $true
        }

        "2" {
            Run-LoggedCommand `
                -WorkingDir $PipelineDir `
                -DisplayName "SYNC MODE" `
                -CommandLine "node index.js sync" `
                -LogPrefix "sync" `
                -LongRunning $false
        }

        "3" {
            Start-LocalPreviewServer
        }

        "4" {
            Open-LocalFigures
        }

        "5" {
            Open-LiveFigures
        }

        "6" {
            Show-PrunePlaceholder
        }

        "7" {
            break
        }

        default {
            Write-Host ""
            Write-Host "Invalid option." -ForegroundColor Red
            Pause-Return
        }
    }
}