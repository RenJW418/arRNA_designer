param(
    [string[]]$Only
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $projectRoot
$sourceRoot = Join-Path $workspaceRoot "ms\20260825 Figure"
$outputRoot = Join-Path $projectRoot "frontend\public\figures"

$crops = @(
    [pscustomobject]@{ Source = "Figure 2.ai"; Name = "leaper-mechanism-comparison"; Rect = @(120.0, -55.0, 510.0, -274.0) },
    [pscustomobject]@{ Source = "Figure 1.ai"; Name = "leaper-1-0"; Rect = @(114.0, -58.0, 496.0, -165.0) },
    [pscustomobject]@{ Source = "Figure 1.ai"; Name = "leaper-2-0"; Rect = @(114.0, -170.0, 496.0, -277.0) },
    [pscustomobject]@{ Source = "Figure 1.ai"; Name = "leaper-3-0"; Rect = @(114.0, -283.0, 496.0, -390.0) },
    [pscustomobject]@{ Source = "Figure 1.ai"; Name = "leaper-exon-skipping"; Rect = @(114.0, -401.0, 520.0, -508.0) },
    [pscustomobject]@{ Source = "Figure 4.ai"; Name = "leaper3-universal-design"; Rect = @(110.0, -30.0, 505.0, -128.0) },
    [pscustomobject]@{ Source = "Figure 4.ai"; Name = "leaper3-custom-design"; Rect = @(102.0, -131.0, 502.0, -402.0) },
    [pscustomobject]@{ Source = "Figure 4.ai"; Name = "leaper-exon-skipping-design"; Rect = @(130.0, -407.0, 508.0, -535.0) }
)

if ($Only.Count -gt 0) {
    $crops = @($crops | Where-Object { $_.Name -in $Only })
    if ($crops.Count -eq 0) {
        throw "No matching figure names were supplied to -Only."
    }
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$illustrator = New-Object -ComObject Illustrator.Application
$openDocument = $null

try {
    foreach ($sourceGroup in ($crops | Group-Object Source)) {
        $sourcePath = Join-Path $sourceRoot $sourceGroup.Name
        if (-not (Test-Path -LiteralPath $sourcePath)) {
            throw "Missing manuscript artwork: $sourcePath"
        }

        $openDocument = $illustrator.Open($sourcePath)

        foreach ($crop in $sourceGroup.Group) {
            $openDocument.Artboards.Item(1).ArtboardRect = $crop.Rect

            $exportBase = Join-Path $outputRoot "$($crop.Name)-export.svg"
            $generatedPath = Join-Path $outputRoot "$($crop.Name)-export-01.svg"
            $finalPath = Join-Path $outputRoot "$($crop.Name).svg"

            foreach ($path in @($exportBase, $generatedPath, $finalPath)) {
                if (Test-Path -LiteralPath $path) {
                    Remove-Item -LiteralPath $path -Force
                }
            }

            $exportPath = $exportBase.Replace("\", "/")
            $exportScript = @"
var options = new ExportOptionsSVG();
options.coordinatePrecision = 3;
options.embedRasterImages = true;
options.fontType = SVGFontType.OUTLINEFONT;
options.optimizeForSVGViewer = true;
options.preserveEditability = false;
options.saveMultipleArtboards = true;
options.artboardRange = "1";
app.activeDocument.exportFile(new File("$exportPath"), ExportType.SVG, options);
"@
            $illustrator.DoJavaScript($exportScript) | Out-Null
            if (-not (Test-Path -LiteralPath $generatedPath)) {
                throw "Illustrator did not produce the expected SVG: $generatedPath"
            }

            $svg = [System.IO.File]::ReadAllText($generatedPath)
            $svg = $svg.Replace("&ns_extend;", "http://ns.adobe.com/Extensibility/1.0/")
            $svg = $svg.Replace("&ns_ai;", "http://ns.adobe.com/AdobeIllustrator/10.0/")
            $svg = $svg.Replace("&ns_graphs;", "http://ns.adobe.com/Graphs/1.0/")
            if ($crop.Name -eq "leaper-3-0") {
                $transitionArrow = '<linearGradient id="SVGID_1_"[\s\S]*?</linearGradient>\s*<polygon[^>]*fill:url\(#SVGID_1_\);[\s\S]*?/>'
                $svg = [regex]::Replace($svg, $transitionArrow, "")
            }
            [System.IO.File]::WriteAllText($finalPath, $svg, [System.Text.UTF8Encoding]::new($false))
            Remove-Item -LiteralPath $generatedPath -Force

            Write-Output "Exported $($crop.Name).svg"
        }

        $openDocument.Close(2)
        $openDocument = $null
    }
}
finally {
    if ($null -ne $openDocument) {
        $openDocument.Close(2)
    }
    $illustrator.Quit()
}
