Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = 'C:\Users\Admin\Downloads\MSG MTC 2026 (2).zip'
$outDir = 'C:\Users\Admin\.gemini\antigravity\scratch\msg-oilfield-erp\public\certificates'

if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$manifest = @()

foreach ($entry in $zip.Entries) {
    if ($entry.Name -like '*.pdf') {
        $cleanName = $entry.Name
        # Sanitize filename if needed
        $targetPath = Join-Path $outDir $cleanName
        
        # Extract file
        try {
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $targetPath, $true)
        } catch {
            Write-Host "Warning extracting $($entry.Name): $_"
        }

        # Detect heat number from filename
        # Common patterns: -65P20M039.pdf, -67C20M351.pdf, etc.
        $heat = ""
        if ($cleanName -match '[\-_ ]([0-9]{2}[A-Za-z][0-9]{2}[A-Za-z0-9]+)') {
            $heat = $matches[1]
        } elseif ($cleanName -match '[\-_ ]([A-Za-z0-9]{4,15})\.pdf$') {
            $heat = $matches[1]
        }

        $manifest += @{
            fileName = $cleanName
            url = "/certificates/$cleanName"
            heatNumber = $heat
            fileSize = $entry.Length
        }
    }
}

$zip.Dispose()

$manifestJson = $manifest | ConvertTo-Json -Depth 3
Set-Content -Path (Join-Path $outDir 'manifest.json') -Value $manifestJson -Encoding UTF8

Write-Host "Extracted $($manifest.Count) authentic PDF certificates to $outDir and wrote manifest.json!"
