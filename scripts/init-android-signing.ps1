# Creates one upload key. Existing material is never overwritten; password is protected by Windows DPAPI.
$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
$taskSigning = Join-Path $taskRepo 'artifacts\signing'
$taskStore = Join-Path $taskSigning 'upload-keystore.p12'
$taskPasswordFile = Join-Path $taskSigning 'upload-password.dpapi'
if ((Test-Path -LiteralPath $taskStore) -or (Test-Path -LiteralPath $taskPasswordFile)) {
    throw 'Signing material already exists. Reuse it; do not rotate an upload key accidentally.'
}
$taskJdk = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Android\Android Studio\jbr' }
$taskKeytool = Join-Path $taskJdk 'bin\keytool.exe'
if (-not (Test-Path -LiteralPath $taskKeytool)) { throw 'Set JAVA_HOME to a JDK before creating the upload key.' }
New-Item -ItemType Directory -Path $taskSigning -Force | Out-Null
$taskBytes = New-Object byte[] 32
$taskRng = [Security.Cryptography.RandomNumberGenerator]::Create()
$taskRng.GetBytes($taskBytes); $taskRng.Dispose()
$taskPassword = [Convert]::ToBase64String($taskBytes)
$taskOldPassword = $env:SUDOKU_UPLOAD_STORE_PASSWORD
try {
    $env:SUDOKU_UPLOAD_STORE_PASSWORD = $taskPassword
    Add-Type -AssemblyName System.Security
    $taskPlain = [Text.Encoding]::UTF8.GetBytes($taskPassword)
    [IO.File]::WriteAllBytes($taskPasswordFile, [Security.Cryptography.ProtectedData]::Protect($taskPlain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))
    [Array]::Clear($taskPlain, 0, $taskPlain.Length)
    & $taskKeytool -genkeypair -alias upload -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Sudoku and Dragons Upload' -storetype PKCS12 -keystore $taskStore -storepass:env SUDOKU_UPLOAD_STORE_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'Upload key generation failed; inspect local signing files before retrying.' }
    & $taskKeytool -exportcert -rfc -alias upload -keystore $taskStore -storepass:env SUDOKU_UPLOAD_STORE_PASSWORD -file (Join-Path $taskSigning 'upload-certificate.pem')
    if ($LASTEXITCODE -ne 0) { throw 'Could not export upload certificate.' }
    Write-Output "Upload key created in $taskSigning. Back up the keystore AND its password before uploading to Play. See release/README.md."
} finally {
    $env:SUDOKU_UPLOAD_STORE_PASSWORD = $taskOldPassword
    $taskPassword = $null; [Array]::Clear($taskBytes, 0, $taskBytes.Length)
}
