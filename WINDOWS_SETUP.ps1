# NEXUS Ops — Windows PowerShell Setup Guide
# Machine: HP Victus (AMD Ryzen 7), Windows 11
# See full file: WINDOWS_SETUP.ps1 (downloaded 2026-05-23 session)
#
# QUICK START:
#   winget install Python.Python.3.12
#   cd ll-cockpit/scripts
#   python -m venv .venv
#   .venv\Scripts\Activate.ps1
#   $env:PYTHONPATH = $(Get-Location)
#   pip install -r requirements.txt
#   $env:DRY_RUN = 'true'
#   python -m nexus_ops.bandit_updater
#
# EXECUTION POLICY (run once as admin if blocked):
#   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
#
# DAILY WORKFLOW:
#   cd scripts
#   .venv\Scripts\Activate.ps1
#   $env:PYTHONPATH = $(Get-Location)
#   $env:DRY_RUN = 'false'
#   python -m nexus_ops.daily_rollup
