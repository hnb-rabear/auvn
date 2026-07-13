@echo off
setlocal
cd /d "%~dp0\.."
echo ==== %date% %time% ==== >> "%~dp0sync-vn-gold.log"
call npx tsx scripts\sync-vn-gold.ts >> "%~dp0sync-vn-gold.log" 2>&1
