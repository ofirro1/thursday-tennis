# Thursday tennis

Six friends. Doubles every Thursday at 8pm at Chris's house. Four play, so one or two sit out. This is one shared page for Chris, Gordon, John, Mick, Carlton, and Ofir.

The page is a normal website (GitHub Pages). The answers live in a free Cloudflare database, not in this public repository. The admin PIN is a GitHub secret. It is never written in the code.

## How a Thursday works

The page shows the next 4 Thursdays. Each person taps **I'm in** or **I'm out**. No answer yet is fine.

On Wednesday at 8pm (Brisbane time) the page picks the four.

- Exactly 4 people are in: they play.
- More than 4 are in: someone who sat out more recently plays first. If that is a tie, the person who has played fewer games so far plays first. If it is still a tie, a coin toss picks, and every phone shows the same result. The page says in plain words why someone sits out, for example `Gordon sits out: played last 3 weeks`.
- Fewer than 4 are in: it says **Short a player this week**.
- Being out does not count as sitting out.

Until 8pm Thursday, people can still change. If someone who was picked taps out, the next person comes in. After 8pm Thursday, that week is finished. Ofir can still correct it.

Counts are for every week stored so far. They do not reset in January.

## What you do once

The live page will be:

https://ofirro1.github.io/thursday-tennis/

It starts working after you merge this, add three secrets, and the Deploy workflow goes green. Nothing here costs money. The GitHub repo needs to stay **public** (GitHub Pages is free for public repos). Cloudflare's free plan is enough, and it does not go to sleep if nobody opens the app for a week.

1. Merge this pull request into `main`.
2. On GitHub, open **Settings → Pages → Build and deployment**. Set **Source** to **GitHub Actions**.
3. Create a free account at https://dash.cloudflare.com/sign-up
4. Copy your **Account ID**. It is on the Workers overview, on the right-hand side.
5. Create an API token: **My Profile → API Tokens → Create Token**. Start from the template **Edit Cloudflare Workers**. Add a permission: **Account → D1 → Edit**. Create the token and copy it. You only see it once.
6. Pick a PIN of 6 to 8 numbers. Do not put it in the repository, in a text, or in this file.
7. On GitHub, open **Settings → Secrets and variables → Actions → New repository secret**. Add these three secrets:
   - `CLOUDFLARE_API_TOKEN` = the token you copied
   - `CLOUDFLARE_ACCOUNT_ID` = the account id
   - `ADMIN_PIN` = the PIN
8. Open the **Actions** tab, choose **Deploy**, and click **Run workflow** on `main`. If you already pushed to `main` after the secrets existed, it may have run on its own.
9. When the workflow is green, open https://ofirro1.github.io/thursday-tennis/ on your phone.

On your phone, tap **Ofir**, then **Settings**, and enter the PIN. You can change the PIN there afterwards. The old one in the GitHub secret is only used the first time someone signs in. Later changes stay in the database.

Then send the same link to the other five. Each person taps their own name once. That phone remembers.

## Try it on your computer first

This does not share answers with the phones. It is only so you can click around.

```bash
npm test
npm start
```

Open http://127.0.0.1:4173

To choose the trial PIN yourself, start it as `ADMIN_PIN=###### npm start` with 6 to 8 numbers. If you do not, the trial PIN is written to `data/local-pin.txt` on that computer. Either way it is not the real PIN.

## Add it to the home screen

On the main page there is a short hint.

- iPhone: Share, then **Add to Home Screen**.
- Android: the three dots, then **Add to Home screen**.

## Notifications are not in this version

A Monday 6pm reminder and a Wednesday 8pm "you're playing / you're sitting out" message would not need a paid service. It would need:

- a small service worker (the bit of the site that can receive a push)
- a free key pair called VAPID, which you generate once on your computer and store as secrets
- each phone tapping Allow (on iPhone this only works after Add to Home Screen, and only on iOS 16.4 or newer)
- a free Cloudflare cron timer: Monday 08:00 UTC and Wednesday 10:00 UTC, which is 6pm Monday and 8pm Wednesday in Brisbane

That is enough extra code and setup that v1 leaves it out. The page itself is the reminder for now.

## If you forget the PIN

The app still works. Only Settings is locked.

1. In the Cloudflare dashboard, open **Storage & databases → D1 → thursday-tennis → Console**.
2. Run `delete from pin;`
3. Put a new PIN in the `ADMIN_PIN` GitHub secret.
4. Run **Deploy** again.

The next time you open Settings, the new PIN works. Changing the secret alone does not change a PIN that was already saved.

## If a name is wrong, or a week is rained out

Open the link, tap **Ofir**, tap **Settings**, enter the PIN.

- **Change a name.** Mick can become Mik. Phones keep the same person.
- **Cancel a week.** Rain, or Chris is away. That week is not counted.
- **Fix a past week.** After Thursday at 8pm you can set who played, who sat out, and who was out.

## What is public

Anyone with the link can mark in or out, the same as the group text. They cannot rename people, cancel a week, or change the past without the PIN.

The PIN is checked on Cloudflare. The website code does not contain it. The database is not in this repository.

The starting names are in `schema.sql` because the database has to begin with the six players. Weekly answers are not.

Search engines are asked not to list the page. The link is still public if someone has it.
