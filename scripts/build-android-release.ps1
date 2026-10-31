$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
$taskNames = @('JAVA_HOME', 'SUDOKU_UPLOAD_STORE', 'SUDOKU_UPLOAD_STORE_PASSWORD', 'SUDOKU_UPLOAD_ALIAS', 'SUDOKU_UPLOAD_KEY_PASSWORD')
$taskOriginal = @{}
foreach ($taskName in $taskNames) { $taskOriginal[$taskName] = [Environment]::GetEnvironmentVariable($taskName) }
Push-Location -LiteralPath $taskRepo
try {
    if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }
    if (-not $env:SUDOKU_UPLOAD_STORE) {
        $env:SUDOKU_UPLOAD_STORE = Join-Path $taskRepo 'artifacts\signing\upload-keystore.p12'
        Add-Type -AssemblyName System.Security
        $taskProtected = [IO.File]::ReadAllBytes((Join-Path $taskRepo 'artifacts\signing\upload-password.dpapi'))
        $taskPlain = [Security.Cryptography.ProtectedData]::Unprotect($taskProtected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $env:SUDOKU_UPLOAD_STORE_PASSWORD = [Text.Encoding]::UTF8.GetString($taskPlain)
        [Array]::Clear($taskPlain, 0, $taskPlain.Length)
        $env:SUDOKU_UPLOAD_ALIAS = 'upload'
        $env:SUDOKU_UPLOAD_KEY_PASSWORD = $env:SUDOKU_UPLOAD_STORE_PASSWORD
    }
    foreach ($taskName in $taskNames) { if (-not [Environment]::GetEnvironmentVariable($taskName)) { throw "Missing $taskName" } }
    if (-not (Test-Path -LiteralPath $env:SUDOKU_UPLOAD_STORE)) { throw 'Upload keystore not found.' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
    & npx.cmd cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
    & ./android/gradlew.bat -p android bundleRelease assembleDebug lintRelease --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android build or lint failed.' }
    $taskBundle = Join-Path $taskRepo 'android\app\build\outputs\bundle\release\app-release.aab'
    $taskVerification = & (Join-Path $env:JAVA_HOME 'bin\jarsigner.exe') '-J-Duser.language=en' -verify $taskBundle 2>&1
    if ($LASTEXITCODE -ne 0 -or ($taskVerification -join "`n") -notmatch 'jar verified\.') { throw 'AAB signature verification failed.' }
    Write-Output 'Verified AAB signature (self-signed upload certificate).'
    Write-Output "Signed test bundle: $taskBundle"
} finally {
    foreach ($taskName in $taskNames) { [Environment]::SetEnvironmentVariable($taskName, $taskOriginal[$taskName]) }
    Pop-Location
}
