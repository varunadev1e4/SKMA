SETUP FOR THE SHOP COMPUTER
===========================
Do this ONCE, on the computer where Profit Maker is installed (about 10 minutes).
The computer must be on and connected to the internet. Profit Maker can stay open.

1. Copy the folder  ShopSync  to the C: drive, so it becomes  C:\ShopSync
   (not on the Desktop, and not inside OneDrive).
2. Open the folder and double-click:  START HERE - SETUP.bat
3. If Windows says "Windows protected your PC": click "More info", then "Run anyway".
4. Wait. It looks for the Profit Maker file, makes a first backup, uploads the data
   and sets up the automatic schedule. If it asks which file is the current year,
   type the number of the file changed most recently and press Enter.
5. At the end you will see  ALL DONE.

AFTER THAT (all automatic)
  - Backup of the Profit Maker file: every 2 hours
  - Phone app updates: every 30 minutes
  - Golden backup of the app's cloud data: every evening at 7:45 pm
  Keep the computer on during shop hours. Do not delete or move C:\ShopSync or ShopBackups.

BUTTONS YOU CAN DOUBLE-CLICK ANY TIME
  run-sync.bat            update the phone app right now
  run-backup.bat          make a Profit Maker backup right now
  run-golden-backup.bat   make the golden backup right now (copy the zip to a pen drive too)
  LOAD-OLD-YEAR.bat       load an older financial year (once per year)
  restore-golden.bat      only for emergencies: puts a golden backup back

NOTHING here ever changes the Profit Maker file. The scripts only read a COPY of it.
If something goes wrong, take a photo of the black window and send it, with the files
sync.log and auto-backup.log from this folder.
