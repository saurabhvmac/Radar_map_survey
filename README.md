# Your Big Year – Career Readiness Survey (Netlify version)

Public Entry and Exit survey links with no sign-in, radar-chart results, and a password-protected admin dashboard (Survey builder, Results, Settings).

- `/entry`: Entry Survey (name, email, questions)
- `/exit`: Exit Survey, a few weeks later (email, same questions, then Entry vs Exit comparison)
- `/admin`: admin dashboard

## How it runs on Netlify

- `public/`: the pages (plain HTML/CSS/JS, no build step).
- `netlify/functions/api.mjs`: one Netlify Function that answers every `/api/*` request.
- Data is saved in **Netlify Blobs**, Netlify's built-in storage. There's nothing to set up, and it's included on the free plan.
- `netlify.toml`: the `/entry`, `/exit` and `/admin` links, plus security headers.

## Deploy (GitHub, recommended)

1. Create a free GitHub account if you don't have one, then a new repository (e.g. `yby-career-survey`).
2. Upload the contents of this folder to it: on the repository page, click "uploading an existing file" and drag everything in, including the `netlify` and `public` folders and `netlify.toml`.
3. Sign in at app.netlify.com, then choose **Add new project → Import an existing project → GitHub** and pick the repository.
4. Leave the build settings as they are. Netlify reads them from `netlify.toml`. Click **Deploy**.
5. Go to **Project configuration → Environment variables** and add:
   - `ADMIN_PASSWORD`: the admin dashboard password
   - `APP_SECRET`: any long random text (e.g. 40+ mixed characters)
6. Go to **Deploys → Trigger deploy → Deploy project** so the new variables take effect.
7. Open `https://<your-site>.netlify.app/entry`. Your links are:
   - `https://<your-site>.netlify.app/entry`
   - `https://<your-site>.netlify.app/exit`
   - `https://<your-site>.netlify.app/admin`

Optional: rename the site under **Project configuration → Change project name**, or connect your own domain under **Domain management**.

Any later change pushed to GitHub redeploys automatically. Saved answers are kept between deploys.

## Deploy without GitHub (Netlify CLI)

Netlify's drag-and-drop upload only handles static files, so it won't include the survey API. Use the command line instead (needs Node.js 18+):

```bash
npm install
npx netlify-cli login
npx netlify-cli deploy --prod     # first time: choose "Create & configure a new project"
```

Then add the two environment variables (step 5 above) and redeploy with the same `deploy --prod` command.

## Try it on your computer first (optional)

```bash
npm install
npm run local        # http://localhost:8888/entry, /exit, /admin (password: admin)
```

Local data lives in memory and is cleared when you stop it.

## Using it

- **Survey builder:** add, rename, reorder and delete competencies and questions (Confidence Scale 1–5, short text, long text, multiple choice). Preview Entry and Exit, then **Publish**. Students only ever see the published version.
- **Settings:** copy the three links, switch the Exit Survey on when you send the Exit link, and edit the intro text.
- **Results:** cohort averages and radar, each student's answers and chart, CSV export, delete a student.

Only Confidence Scale questions are scored. A competency's score is the average of its scale answers, and scored questions always appear in both surveys so Entry and Exit compare fairly.

## Good to know

- **No sign-in means trust by email:** the Exit Survey is matched to the Entry Survey by email. Anyone who knows a student's email could submit that student's Exit Survey first. Each email can submit each survey once, and you can delete any submission in Results.
- **Scale:** this setup comfortably handles hundreds of students per cohort. For thousands, move storage to a database such as Netlify DB/Postgres. Only `netlify/lib/app.mjs` would change.
- **Admin access:** one shared password. Change it any time in the environment variables (then redeploy).
- **Backups:** export the CSV from Results regularly.
