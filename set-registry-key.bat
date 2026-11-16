@echo off
setlocal
echo Paste Comfy Registry API Key. Input is hidden.
powershell -NoProfile -Command "$s = Read-Host 'Registry API Key' -AsSecureString; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); $p = [Runtime.InteropServices.Marshal]::PtrToStringAuto($b); [Environment]::SetEnvironmentVariable('COMFY_REGISTRY_TOKEN', $p, 'User'); [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)"
echo Saved to user environment variable COMFY_REGISTRY_TOKEN.
echo Run update.bat now; it reads this value automatically.
pause
