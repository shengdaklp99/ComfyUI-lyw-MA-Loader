@echo off
cd /d "%~dp0"

if not exist ".git" (
  echo [1/4] Initializing git repository...
  git init -b main
) else (
  echo [1/4] Git repository present.
)

echo [2/4] Staging changes...
git add -A

echo [3/4] Committing...
git commit -m "update %DATE% %TIME%"
if errorlevel 1 echo Nothing new to commit, continue.

echo [4/4] Pushing to origin...
git push
if errorlevel 1 (
  echo.
  echo Push failed. Check that origin is set:
  echo   git remote add origin https://github.com/USER/ComfyUI-lyw-MA-Loader.git
)

echo.
echo Finished.
pause
