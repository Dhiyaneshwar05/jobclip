# Screenshot & Demo Checklist

Use this list to grab the visual assets referenced in [../README.md](../README.md). Drop files into `docs/images/` with the exact filenames below so the README renders without edits.

## Screenshots (PNG, ideally 1440×900 display @ 2×)

- [ ] `popup-linkedin.png` — jobclip popup open on a LinkedIn job posting with fields pre-filled (company, role, location, salary).
- [ ] `popup-greenhouse.png` — popup on a Greenhouse posting to show the second supported ATS.
- [ ] `options-resumes.png` — Options page with 2–3 resume variants registered.
- [ ] `dashboard.png` — Dashboard showing all five charts populated with real data.
- [ ] `sheet-row.png` — *(optional)* A screenshot of the underlying Google Sheet row that was created, to prove the data round-trip.

## Demo video / GIF

- [ ] `demo.gif` — 15–30 s screen recording of the full loop: open a job page → click the toolbar icon → pick resume + status → save → switch to the Google Sheet → see the new row. Keep under 5 MB for GitHub inline rendering.

### Tooling suggestions

- macOS screen recording: `Shift+Cmd+5` → record selected portion → export → convert to GIF with `ffmpeg -i demo.mov -vf "fps=15,scale=900:-1:flags=lanczos" -loop 0 demo.gif` or Gifski.
- Screenshot annotation: CleanShot X or Shottr for callouts.

## After capturing

```bash
git add docs/images docs/demo.gif
git commit -m "docs: add demo screenshots and recording"
git push
```
