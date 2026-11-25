---------------------------------------------------------------------
 PART 1.  WHAT IS IN THE KIT
---------------------------------------------------------------------
 START-HERE-Guide.html      The same steps as this README with pictures of
                            the boxes to look for. Open in Chrome.
 README.txt                 This file.

 1-Database\                SQL files for Supabase (the cloud database)
    1-setup-new-shop.sql    Creates all the tables
    2-migration-23.sql      Employee logins, cash in hand, trips, leave
    3-migration-24.sql      Shop fund
    4-migration-25.sql      Staff inbox: reports, returns, tasks, stock counts, bill tags
    5-migration-26.sql      Owners/partners with no attendance
    6-migration-27.sql      Delivery follow-up and the activity log
    7-migration-28.sql      Bill numbers typed with letter O fixed to zero
    8-migration-30-roles.sql  Desk login and Accountant login
    9-migration-31-cash-slips.sql  Desk cash slips (owner approves) and the Desk's safe stock view
    10-migration-32-deliveries.sql  Desk sends bills out with an employee; employees see their bills
    optional\push-triggers.sql, weekly-push.sql   Push notifications (optional)
    RUN THE NUMBERED FILES ONE AT A TIME, IN ORDER, ONCE EACH.
    (Tested on a clean database: all 10 files run with no errors, in this order.)

 2-Website\                 The phone app. Goes to GitHub, then Vercel.
 3-Shop-PC\ShopSync\        Scripts for the shop computer (copy to C:\ShopSync)
 4-Push-Notifications\      Optional: alerts on phones (own guide inside)

---------------------------------------------------------------------
 CHECK FIRST: Profit Maker must save its data in files named like Data2627.Mdb.
 If the file names look different, STOP and ask before continuing.

---------------------------------------------------------------------
 ===== C.  THE SHOP COMPUTER =====
 C1. Copy the folder 3-Shop-PC\ShopSync to the C: drive: it must be exactly
     C:\ShopSync  (NOT on the Desktop, NOT in OneDrive or Documents).
 C2. Open C:\ShopSync and double-click  START HERE - SETUP.bat
     "Windows protected your PC"? Click More info > Run anyway.
 C3. The black window asks, one by one:
        Supabase Project URL    paste (right-click pastes in the black window)
        Supabase secret key     paste the SECRET key
        GSTIN                   type it, press Enter
     It then searches the computer for the Profit Maker file (a few minutes). If it lists
     several, type the number of the CURRENT year (changed most recently). If it cannot find
     it, it asks for the full path of the Data....Mdb file.
 C4. Wait. It makes a first backup, uploads the data (first time takes a few minutes) and sets
     the automatic schedule.
     YOU SHOULD SEE "Backup OK", "Upload OK" and "ALL DONE". Press Enter.
     A folder ShopBackups (on D: or C:) now holds a zip file.
     (Different backup folder or file location? See Part 6, "Settings in sync-config.json".)
 C5. On the phone: pull down to refresh or close and reopen the app.
     YOU SHOULD SEE stock, parties and dues. Open Insights: this year's sales and profit.
     Compare 2 numbers with Profit Maker (e.g. "To receive" total and the stock of one item).
     The first full load can take up to 10 minutes; if Insights is empty, wait, then
     double-click run-sync.bat again.
 C6. Double-click run-golden-backup.bat once. A zip appears in C:\ShopSync\golden.
     Copy it to a pen drive or Google Drive (repeat every week).
 C7. (Optional) LOAD-OLD-YEAR.bat: drag an older Data2526.Mdb into the black window,
     Enter. Once per old year. It only reads.

 ===== D.  LOGINS FOR EMPLOYEES, DESK AND ACCOUNTANT =====
 D1. In Supabase: Authentication > Users > Add user, one by one, for each employee
     (about 15): email + password, TICK "Auto Confirm User". Write them on the list.
     They can see NOTHING until you link them in the app (next step).
 D2. In the app, log in as an owner > Staff > "+" to add each employee (or open the
     employee) > type the SAME email in "Login email for this employee" > Save.
     The employee can now log in and sees the employee screen.
 D3. For the DESK person(s): same screen, also tick "Desk login", Save.
 D4. For the ACCOUNTANT(s) (up to 3): same screen, tick "Accountant login", Save.
     (A person can be Desk and Accountant at the same time.)
 D5. The iPad/tablet: log in on it with a Desk login (or a separate login per person -
     better, then the activity log shows who did what).
 D6. To take an extra right away: open the employee, untick the box, Save.
 D7. To make a 4th owner later: create the user in Supabase, then run in the SQL Editor
        insert into app_roles (email, role) values ('newowner@example.com','owner')
        on conflict (email) do update set role = 'owner';

 ===== E.  TESTS BEFORE YOU LEAVE (10 minutes) =====
 Do each test on a phone. Write PASS/FAIL.
 [ ] E1 OWNER  login: Home opens with Stock, Parties, Insights, Staff at the bottom.
 [ ] E2 OWNER  Staff > Attendance > mark one person absent, then present again.
 [ ] E3 OWNER  Menu > Change password works (and sign in again with the new one).
 [ ] E4 EMPLOYEE login: only coloured tiles (Add expense, tasks, delivered bills...).
               No Stock / Parties / Insights anywhere.
 [ ] E5 EMPLOYEE add a small test expense (Tea 10) and see it in "My entries".
 [ ] E6 DESK login: tiles Mark attendance, Deliveries, Reports returns tasks, Shop expenses,
               Activity log + the employee tiles. Shop expenses shows everyone's spending
               and has NO "+ Add" button. Mark attendance lists everyone, no salaries.
 [ ] E6b DESK cash slip: Desk > Cash slip > type a customer name, add a product (pick a batch), Save.
               It says it went to the owner. In "My slips" it shows "Waiting for owner approval" and
               has NO PDF / WhatsApp button. Log in as an owner > Temporary bill > To approve: the slip
               is there with the Desk person's name. Tap Approve. Back on the Desk login the slip now has
               PDF and WhatsApp. (Also try Reject with a reason: the Desk sees the reason under Rejected.)
 [ ] E6c DESK Stock tile: stock list, batches and expiry show. There is NO Margin column anywhere.
 [ ] E6d DELIVERIES: Desk > Deliveries > "Bills to send out": each recent bill shows number, customer, city and
               the products (no amounts). Choose "Out for delivery with..." an employee > Send out. The bill leaves the list.
               Log in as that employee > My deliveries: the bill is there with customer, city and products and
               "sent out by the Desk", and has NO x button. (An employee can still tag a bill themselves and remove it the same day.)
 [ ] E7 ACCOUNTANT login: the Receivables tile PLUS all the normal employee tiles. Receivables lists parties that owe money, no "To pay",
               no Directory. Open a party > Share PDF works > Statement opens.
               The accountant still cannot reach Stock, Insights, Staff, sales.
 [ ] E8 Phone Back button closes sheets and goes up one level; on Home press twice to exit.
 [ ] E9 Company data: owner "To receive" total matches Profit Maker's total receivable.
 If any test fails, do NOT hand over yet; use Part 6 or send me a photo.

 ===== F.  HANDOVER =====
 [ ] Print/write the logins list (Part 7) and give a copy to the owner
 [ ] Show the owner: Menu > About (version, "Last updated"), Staff inbox, Activity log
 [ ] Show employees the colourful tiles (no reading needed)
 [ ] Tell them: the app updates from Profit Maker about every 30 minutes; the shop
     computer must be switched on during shop hours
 [ ] Weekly: copy the newest golden backup zip (C:\ShopSync\golden) to a pen drive

---------------------------------------------------------------------
 PART 4.  WHO CAN SEE WHAT
---------------------------------------------------------------------
 This is enforced inside the database, not just by hiding screens.
                                   Owner  Employee  Desk  Accountant
 Stock, batches, expiry              yes      no       no      no
 Parties dues (to receive)           yes      no       no      YES (receivables only)
 Parties to pay / ledgers            yes      no       no      no
 Sales, profit, CA and GST reports   yes      no       no      no
 Bill copies / share a bill          yes      no       no      no
 Own expenses, trips, cash, tasks    -        yes      yes     yes
 Own attendance (read only)          -        yes      yes     yes
 My deliveries (bills sent with me) -        yes      yes     yes
 Stock count sheets (counting)       -        yes      yes     yes
 Suggestions / return notes          -        yes      yes     yes
 Mark attendance for everyone        yes      no       YES     no
 Send bills out with an employee    yes      no       YES (no amounts)  no
 Reply to reports / return notes     yes      no       YES     no
 Set tasks for staff                 yes      no       YES     no
 View ALL expenses + shop fund       yes      no       YES (read only)  no
 Stock screen (batches, expiry)      yes      no       YES (no cost/margin)  no
 Make a cash slip (temporary bill)   yes      no       YES (owner approves)  no
 Approve / reject Desk slips         yes      no       no      no
 Activity log                        full     no       limited  no
 Salaries, advances, leave           yes      own leave only   no   no
 Money requests / add to fund        yes      request only     no   no
 Create/review stock count sheets    yes      no       no      no
 Staff logins and roles              yes      no       no      no
 Notes
  - Desk's limited activity log shows expenses, shop fund, delivery tags, counts, fund requests
    and attendance. It never shows salaries, advances or logins.
  - An Accountant is a normal employee (all employee tiles: expenses, trips, tasks,
    deliveries, attendance...) with ONE extra: Receivables. So an accountant who also
    delivers needs nothing more. Tick Desk as well if he should also have the Desk tiles.
  - Within Receivables the accountant sees only parties that owe money (not suppliers), their pending bills and
    ledger statements. Sharing is PDF / Excel / WhatsApp reminder from those screens only.
  - Deliveries: the Desk sees recent bills with customer, city and products only (no rates, no amounts, no
    profit), sends each out with an employee, and can see the Deliveries list of who took what. The employee sees
    only their own bills (customer, city, products) and cannot remove a bill the Desk assigned.
  - Desk cash slips: the Desk types a customer name (no access to the party list or anyone's dues),
    picks products and batches and saves. The slip is a DRAFT: it holds the stock (so nobody else can use it)
    and an owner gets a push alert (if push is set up). The Desk can see only its own slips, can delete a
    draft, and can share the PDF only after an owner approves. A rejected slip frees the stock again.
    The Desk never sees cost price or margin. The owner makes the real bill in Profit Maker and taps Mark billed.
  - An employee cannot promote themselves: only owners can change roles.

---------------------------------------------------------------------
 PART 5.  DAILY LIFE
---------------------------------------------------------------------
 WHAT RUNS BY ITSELF (computer must be on; it catches up when switched on)
   Backup of the Profit Maker file into ShopBackups
   Update of the phone app from Profit Maker (about every 30 minutes)
   Golden backup of everything in the cloud (every evening)
 BUTTONS in C:\ShopSync
   run-sync.bat            update the phone app right now
   run-backup.bat          make a Profit Maker backup right now
   run-golden-backup.bat   make the golden backup right now
   LOAD-OLD-YEAR.bat       load an older financial year
   restore-golden.bat      EMERGENCY ONLY
 GOLDEN BACKUP (do not skip): Supabase's free plan keeps NO backups. The golden zip is the
   only copy of staff, expenses, directory, temporary bills, returns, collections and tags.
   Copy the newest zip off the computer every week.
 NEW FINANCIAL YEAR (April): Profit Maker makes a new file (e.g. Data2728.Mdb). The backup
   picks the newest by itself. After 1 April run run-backup.bat then run-sync.bat and check the
   app shows the new year.
 UPDATING THE WEBSITE: GitHub > src > Add file > Upload files > commit. Vercel updates in about
   a minute. Close and reopen the app on phones.
 GOING BACK to an older website: Vercel > Deployments > the earlier one > Promote to Production.
 EMERGENCY RESTORE: new Supabase project; run SQL files 1 to 10 again (owners first, as in
   A3); create logins; put the new keys in Vercel (Redeploy) and in sync-config.json; then
   restore-golden.bat (drag the zip in, type YES); then run-sync.bat.
 PUSH ALERTS FOR CASH SLIPS AND DELIVERIES: only if you already set up push (folder 4-Push-Notifications): paste the new
   functions\notify\index.ts over the old one in the Supabase function and Deploy, then run the last four lines of
   optional\push-triggers.sql (triggers push_temp_bills and push_bill_tags). Without push, owners just open Temporary bill > To approve.
 VERSION HISTORY: in the app, Menu > About.

---------------------------------------------------------------------
 PART 6.  IF SOMETHING GOES WRONG
---------------------------------------------------------------------
 Invalid login credentials     Wrong email/password, or Auto Confirm was not ticked: delete the
                               user in Supabase and create it again with Auto Confirm ticked.
 Login works but the app is    The login has no role. Owner: run the app_roles line in A6.
   empty / "nothing to see"    Employee: link it in Staff (D2).
 Employee sees the OWNER       The login was created before the SQL files ran. In Supabase run:
   screens                       delete from app_roles where role='owner' and email not in
                                 ('owner1@..','owner2@..','owner3@..');   (your 3 owners)
                               then link the employee in Staff.
 Desk/Accountant tile missing  Run 8-migration-30-roles.sql, 9-migration-31-cash-slips.sql and 10-migration-32-deliveries.sql, then in Staff tick the box and save;
                               the person closes and reopens the app.
 401 / Invalid API key         Wrong secret key in C:\ShopSync\sync-config.json: fix it (keep the
                               quotes), run run-sync.bat.
 "column / relation ... does   A SQL file was not run completely. Run the missing numbered file.
   not exist"                  Run each file ONCE and in order (do not re-run an older one after a newer).
 "No Data*.zip / .Mdb found"   Run run-backup.bat first; else fix data_file in sync-config.json.
 Red text about execution      Start the .bat files (double-click), not the .ps1 files.
   policy
 App shows old numbers         Check "last updated" on Home; run run-sync.bat; close and reopen.
 Blank website / error         A Vercel setting is missing or wrong: fix and Redeploy.
 "Failed to load module"       Close and reopen the app once (an old copy after an update).
 Asked to log in after every  A phone with full storage cannot save the login. Build 41 clears the app's offline
   reload                      copies by itself. If it still happens: Chrome > lock icon > Site settings > Clear data, log in again.
 Logged out often              Supabase > Authentication > Sessions: check Time-box, Inactivity
                               timeout and "Single session per user" (turn the last one off if
                               employees share a login).
 Supabase project "paused"     Click Restore project. The regular sync normally keeps it awake.
 SETTINGS IN sync-config.json (open with Notepad; every \ is typed twice \\ ; keep the quotes)
     data_file      the current Profit Maker file, e.g. "D:\\PM\\Data2627.Mdb". The backup uses the
                    newest Data####.Mdb in that folder, so a new year is picked up by itself.
     backup_folder  where the kit saves backup zips, e.g. "D:\\ShopBackups"
     live_mdb       optional; if set, the app update reads that file directly. Normally empty.
   After editing: save, run run-backup.bat then run-sync.bat; the last line should say OK.
   If Profit Maker already makes its own backup zips, you may point backup_folder there (zips must
   be named like Data####_....zip) but keep data_file set.
 ASKING FOR HELP: photo of the black window + sync.log and auto-backup.log from C:\ShopSync.
   NEVER send the Secret key.

---------------------------------------------------------------------
 PART 7.  KEEP THESE SAFE (print a copy for the owner)
---------------------------------------------------------------------
   Supabase email, password and database password
   The 3 owner logins and every employee login (email + password)
   Secret key (never share)  |  GitHub and Vercel logins
   The newest golden backup zip (pen drive / Google Drive)
