# TEAS Study Hub + Scrub In, by ItsDrDan

Free ATI TEAS 7 prep for future nurses: Reading, Math, Science and English.

- **index.html: TEAS Study Hub.** Section pages for every unit (Science now has 19, including Macromolecules & enzymes), with a 3-minute **Learn it** lesson per unit; **Flashcards** (400+); a Daily 5 (easy → hard); a week-by-week study plan that fits units to the hours chosen (about 40 minutes each), puts units missed on the Diagnostic first, keeps the most-tested units when time is short and says what it left out; a **Spanish glossary** (data/glossary.json); links to ItsDrDan YouTube videos on matching Learn-it pages; read-aloud on lessons and practice questions; a **progress report** with a practice-score chart, with the 62% and 75% program minimums drawn for reference (printable), plus a backup file to move progress between devices; a **test-day checklist**; a practice-to-target estimator (it does not convert practice accuracy into an ATI score); Central Valley nursing program requirements, each with its source page and the date it was read; topic search.
- **practice.html: Scrub In.** Diagnostic (Quick: one question per unit; Extended: two per unit; a screening tool that feeds the study plan), Quick Drill, **My Missed Questions** (spaced review at 1, 3 and 7 days; reviews 2 and 3 use a related question from the same unit; only a right answer on the review day moves a card forward), Reading Passages, Timed Set, Mini Practice Test, Full Practice Test (170 questions, real timing, TEAS scoring rules, saved and resumable if the page closes) and a Must-Know Sheet. All TEAS question types: multiple choice, select all that apply, fill in the blank, ordered response and **hot spot** (tap the diagram), plus the on-screen four-function calculator. Mistake-specific feedback on every question type: per-choice notes, fill-in slip catchers (`mx`), "you clicked" notes for hot spots and position notes for ordering. Pacing feedback after every timed set and test. Deep links: `practice.html?section=sc&unit=2`, `?mode=full`, `?mode=missed`.
- **Works offline / installs to a phone home screen** (manifest.webmanifest + sw.js).
- **Anonymous stats** go to the shared ItsDrDan Game Stats sheet through games/track.js (game "teas"): topic, right/wrong, the question's ID and a fingerprint of its wording, and for multiple choice which choice was picked. No names, emails or typed answers. `node tools/item-analysis.js` turns the per-question rows into a list of questions that may be mis-keyed, too hard, too easy, or have a wrong choice nobody picks.
- **data/:** the question bank (`bank.js`: questions, passages, diagrams, one per line), the Daily 5 pool, search index, and lessons/flashcards (learn.json).
- **assets/:** logos, mascot, icons, badges, app icons and the social preview image.

Every question and passage is original and written from ATI's public TEAS 7 content outline, with science background from free OpenStax textbooks. Most anatomy, biology and microbiology diagrams are adapted from OpenStax art (labels, arrows and layout changed); each one is credited where it appears. The feedback loop, ECG and muscle-tissue diagrams, and all charts, graphs, maps, labels and measuring-tool figures, are drawn by ItsDrDan. Molecule drawings in the Macromolecules & enzymes unit come from the ItsDrDan Carbohydrates, Lipids, Amino Acids, Nucleic Acids and Enzyme games.
ATI TEAS® is a registered trademark of Assessment Technologies Institute, LLC. This project is not affiliated with or endorsed by ATI.

## Checks (run before every push)

No dependencies; needs Node 18 or newer.

```bash
cd tools && npm test
```

That runs, in order:

- `node tools/build.js --check`: `data/daily.json`, `data/search.json`, the `HUB` counts in `index.html`, the offline art list in `sw.js` and the cache stamp on `data/bank.js` in `practice.html` are all generated from the bank (`data/bank.js`). After editing questions, run `node tools/build.js` and bump `CACHE` in `sw.js`.
- `node tools/validate.js`: ids (never rename or delete one: `tools/ids.json` lists every published ID, and new ones are recorded with `--accept-ids`), tags, answer keys, option counts, shuffle hazards ("all of the above", fixed letters), hot-spot regions, missing images, duplicates, lessons, flashcards, glossary, program sources and dates, links. `--report` prints coverage against the TEAS 7 blueprint.
- `node tools/test-engine.js`: runs Scrub In's real grading code on every item (keys grade right, near misses grade wrong), plus test sampling, the section clock, save and resume, the missed-question schedule and the calculator.
- `node tools/test-hub.js`: the hub's study-plan builder for every test date and weekly-hours choice.
- `node tools/test-sw.js`: the offline worker against a fake network (offline, slow, 404).

`node tools/check-links.js` opens every outside link (needs internet). GitHub Actions runs the first five on every push (`.github/workflows/check.yml`).

Facts checked against ATI's own pages on 2026-11-13: section lengths and timing, scored items per content area, the five question formats and all-or-nothing scoring, the calculator (every question, every section), the break after Math, and the TEAS 7 preparedness levels (0–40.0, 40.7–58.0, 58.7–79.3, 80.0–91.3, 92.0–100).

## Credits and license

Diagram art adapted from OpenStax is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), and the adapted figures remain under that license (free, noncommercial use with attribution; adaptations shared alike):
- OpenStax, *Anatomy and Physiology 2e*. Access for free at https://openstax.org/books/anatomy-and-physiology-2e/pages/1-introduction
- OpenStax, *Biology 2e*. Access for free at https://openstax.org/books/biology-2e/pages/1-introduction
- OpenStax, *Microbiology*. Access for free at https://openstax.org/books/microbiology/pages/1-introduction

Everything else (questions, passages, lessons, code, logos, mascot and the other artwork) © ItsDrDan. All rights reserved.
