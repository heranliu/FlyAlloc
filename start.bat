@echo off
setlocal
if not defined PORT set "PORT=8080"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>nul
  if not errorlevel 1 goto run_py
)
where python >nul 2>nul
if not errorlevel 1 (
  python -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>nul
  if not errorlevel 1 goto run_python
)
where python3 >nul 2>nul
if not errorlevel 1 (
  python3 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>nul
  if not errorlevel 1 goto run_python3
)
echo Python 3.10 or newer is required. Install Python and run this file again.
set "FLYALLOC_EXIT=1"
goto finish
:run_py
py -3 -X utf8 "%~dp0serve.py" start --port "%PORT%"
set "FLYALLOC_EXIT=%ERRORLEVEL%"
goto finish
:run_python
python -X utf8 "%~dp0serve.py" start --port "%PORT%"
set "FLYALLOC_EXIT=%ERRORLEVEL%"
goto finish
:run_python3
python3 -X utf8 "%~dp0serve.py" start --port "%PORT%"
set "FLYALLOC_EXIT=%ERRORLEVEL%"
:finish
if not defined FLYALLOC_NO_PAUSE pause
exit /b %FLYALLOC_EXIT%
