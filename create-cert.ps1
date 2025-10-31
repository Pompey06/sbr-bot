# === create-cert.ps1 ===
$certPath = "$PSScriptRoot\localhost-cert"
New-Item -ItemType Directory -Force -Path $certPath | Out-Null

$cert = New-SelfSignedCertificate `
  -DnsName "localhost" `
  -CertStoreLocation "cert:\CurrentUser\My" `
  -FriendlyName "Localhost Dev Cert" `
  -NotAfter (Get-Date).AddYears(1)

$pwd = ConvertTo-SecureString -String "1234" -Force -AsPlainText
$pfx = "$certPath\localhost.pfx"

Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $pwd | Out-Null
Write-Host "✅ Certificate created at: $pfx"
