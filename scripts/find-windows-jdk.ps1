# Finds a JDK 17-22 for the Tsunami APK builder.
# Prefers the Java\latest\jdk-21 layout from the user's machine.
# Prints one JAVA_HOME path and exits 0, or exits 1 with a message on stderr.

$ErrorActionPreference = "SilentlyContinue"

function Test-JdkHome {
	param([string]$Path)
	if (-not $Path) { return $false }
	$java = Join-Path $Path "bin\java.exe"
	$javac = Join-Path $Path "bin\javac.exe"
	return (Test-Path -LiteralPath $java) -and (Test-Path -LiteralPath $javac)
}

function Get-JdkMajor {
	param([string]$Path)
	$release = Join-Path $Path "release"
	if (Test-Path -LiteralPath $release) {
		$line = Select-String -LiteralPath $release -Pattern 'JAVA_VERSION="?([0-9]+)' | Select-Object -First 1
		if ($line) { return [int]$line.Matches[0].Groups[1].Value }
	}
	$out = & (Join-Path $Path "bin\java.exe") -version 2>&1 | Out-String
	if ($out -match 'version "1\.(\d+)') { return [int]$Matches[1] }
	if ($out -match 'version "(\d+)') { return [int]$Matches[1] }
	return 0
}

function Add-Candidate {
	param($List, [string]$Path, [int]$Priority)
	if (-not (Test-JdkHome $Path)) { return }
	$major = Get-JdkMajor $Path
	if ($major -lt 17) { return }
	$List.Add([pscustomobject]@{ Path = $Path; Major = $major; Priority = $Priority }) | Out-Null
}

$candidates = New-Object System.Collections.Generic.List[object]

if ($env:JAVA_HOME) { Add-Candidate $candidates $env:JAVA_HOME 10 }
if ($env:JDK_HOME) { Add-Candidate $candidates $env:JDK_HOME 20 }

$roots = @(
	"$env:ProgramFiles\Java\latest\jdk-21",
	"$env:ProgramFiles\Java\latest\jdk-17",
	"${env:ProgramFiles(x86)}\Java\latest\jdk-21",
	"$env:ProgramFiles\Java",
	"${env:ProgramFiles(x86)}\Java",
	"$env:ProgramFiles\Eclipse Adoptium",
	"$env:ProgramFiles\Microsoft",
	"$env:ProgramFiles\Android\Android Studio\jbr",
	"$env:LOCALAPPDATA\Programs\Eclipse Adoptium",
	"$env:USERPROFILE\.jdks",
	"$env:USERPROFILE\scoop\apps\temurin21\current",
	"$env:USERPROFILE\scoop\apps\temurin17\current",
	"G:\Java\latest\jdk-21",
	"G:\Java\latest",
	"G:\Java",
	"D:\Java\latest\jdk-21",
	"C:\Java\latest\jdk-21"
)

foreach ($root in $roots) {
	if (-not $root -or -not (Test-Path -LiteralPath $root)) { continue }
	Add-Candidate $candidates $root 40
	Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
		Where-Object { $_.Name -match 'jdk-21|jdk-17|temurin-21|temurin-17|hotspot|jbr' } |
		ForEach-Object {
			$priority = 50
			if ($_.Name -match 'jdk-21|temurin-21') { $priority = 30 }
			if ($_.Name -match 'jdk-25|jdk-24|jdk-23') { $priority = 90 }
			Add-Candidate $candidates $_.FullName $priority
		}
}

# Nested hotspot JDKs inside Java\latest\jdk-21
Get-ChildItem -Path @(
	"$env:ProgramFiles\Java\latest\jdk-21",
	"G:\Java\latest\jdk-21",
	"D:\Java\latest\jdk-21",
	"C:\Java\latest\jdk-21"
) -Directory -ErrorAction SilentlyContinue |
	Where-Object { $_.Name -match '^jdk-21' } |
	ForEach-Object { Add-Candidate $candidates $_.FullName 25 }

$usable = $candidates |
	Where-Object { $_.Major -ge 17 -and $_.Major -le 22 } |
	Sort-Object Priority, @{ Expression = { if ($_.Major -eq 21) { 0 } else { [Math]::Abs($_.Major - 21) } } }

if (-not $usable) {
	Write-Error "No JDK 17-22 found. Open Java\latest\jdk-21 (the folder with bin\javac.exe) and set JAVA_HOME to that path. Do not use the nested jdk-25 folder with this builder."
	exit 1
}

$chosen = $usable | Select-Object -First 1
Write-Output $chosen.Path
exit 0
