Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = 'C:\Users\Admin\Downloads\MSG MTC 2026 (2).zip'
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$pdfEntries = @($zip.Entries | Where-Object { $_.Name -like '*.pdf' })
Write-Host "Total PDF Certificates in Bulk Zip: $($pdfEntries.Count)"
$pdfEntries | Select-Object -First 30 Name, Length | Format-Table -AutoSize
