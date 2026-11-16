@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "NEWVER=%~1"
set "CHANGELOG=%~2"
if "%NEWVER%"=="" (
  for /f "usebackq delims=" %%v in (`python -c "import re,pathlib; s=pathlib.Path('pyproject.toml').read_text(); q=chr(34); m=re.search(r'^version\s*=\s*'+q+r'?(\d+)\.(\d+)\.(\d+)', s, re.M); print(f'{m.group(1)}.{m.group(2)}.{int(m.group(3))+1}')"`) do set "NEWVER=%%v"
)
if "%NEWVER%"=="" goto :fail
if "%CHANGELOG%"=="" for /f "usebackq delims=" %%t in (`python -c "import datetime; print(datetime.datetime.now().isoformat(timespec='seconds'))"`) do set "CHANGELOG=update %%t"

python -c "import re,pathlib; p=pathlib.Path('pyproject.toml'); s=p.read_text(); q=chr(34); p.write_text(re.sub(r'^version\s*=\s*.*$', 'version = '+q+'%NEWVER%'+q, s, count=1, flags=re.M))"
if errorlevel 1 goto :fail

findstr /c:"node.zip" .gitignore >nul 2>&1 || echo node.zip>>.gitignore
ver >nul

git add -A
git commit -m "release %NEWVER%"
if errorlevel 1 echo Nothing new to commit, continue.
ver >nul
git push
if errorlevel 1 goto :fail

set "HTTPS_PROXY=http://127.0.0.1:7897"
set "HTTP_PROXY=http://127.0.0.1:7897"
set "ALL_PROXY=http://127.0.0.1:7897"
if not defined COMFY_REGISTRY_TOKEN (
  for /f "usebackq delims=" %%k in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('COMFY_REGISTRY_TOKEN','User')"`) do set "COMFY_REGISTRY_TOKEN=%%k"
)
comfy node publish --changelog "%CHANGELOG%"
if errorlevel 1 goto :fail

if exist node.zip del node.zip
echo Done: %NEWVER%
pause
exit /b 0

:fail
if exist node.zip del node.zip
echo Update failed.
pause
exit /b 1
