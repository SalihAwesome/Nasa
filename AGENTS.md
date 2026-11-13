# Rules for AI agents in this repo

Read this file before you do any work. `CLAUDE.md` points here.

## What to read

1. `docs/software-plan.md` holds the units. Do one unit at a time.
2. `docs/verified-facts.md` holds every endpoint, parameter, file name, column name, and test value that a real call confirmed.
3. `docs/mission-plan.md` holds the goals and the "done when" line of each mission, and the pod's wiring and parts.
4. `docs/project-brief.md` holds the idea, the scoring rules, the four known sites, and the limits text. The mission plan is newer and wins where the two differ.

## Status tags

Every input in the plan carries one of four tags. Obey the tag.

| Tag | Meaning | What you do |
|---|---|---|
| VERIFIED | A real call returned this. `docs/verified-facts.md` records the call and its date. | Use it as written. |
| DEFAULT | The plan chose this value. It has no scientific source. | Use it as written. Keep `"status": "default"` beside it in the data file. Never present it as a measured or cited value. |
| UNVERIFIED | Nobody has confirmed this. | Confirm it with a real call or a real document first. Add the result to `docs/verified-facts.md`. If you cannot confirm it, stop and report. |
| NEEDS HUMAN | Only the team can supply this. | Leave the field `null` with a `reason`. Do not fill it. Build the rest of the unit, and name the missing input in the pull request. If the unit says to stop without it, stop and ask. |

## Rules

1. Never write a data value, a URL, a file name, a column name, a site name, or a citation from memory. Get it from `docs/verified-facts.md`, from a call you make in this session, or from the team's own words in `docs/mission-plan.md` and `docs/project-brief.md`, with that file named as the source.
2. If a real call disagrees with the plan, the real call wins. Update `docs/verified-facts.md` and say so in the pull request.
3. Every measured or fetched number shown in the app comes from a file under `app/public/data/` that the pipeline wrote from a fetched source. Every tolerance, weight, and threshold comes from a file under `shared/`. No number is typed into a component.
4. Simulated data lives only in `app/public/data/sim/`. Every simulated JSON file has `"simulated": true`. Every simulated CSV file starts with the line `# simulated=true`. The app shows the word "simulated" on any view that uses simulated data. A test fixture is either the saved raw response of a real call or a file marked as simulated, and the app never loads a fixture.
5. Missing data stays missing. Use `null` with a `reason`. Do not interpolate, estimate, or substitute a typical value. A different product, such as a monthly climatology, may appear beside a missing value only under its own name.
6. Run the unit's check and paste the real output in the pull request. If the check fails, report the failure. Do not weaken the check, skip it, or edit the expected value to match your output.
7. One unit is one branch and one pull request. Do not start a unit before its dependencies are merged.
8. Use only the stack in the plan. If you need another package, say why in the pull request.
9. Read a package's installed version and its real exports before you call it. Do not guess an API.
10. If the plan is unclear or two parts of it conflict, stop and ask. Do not pick a reading.
11. Load the skills that the unit names before you write code. If your tool cannot load a skill, say so in the pull request and continue. Do not imitate a skill from memory.
12. A line marked HUMAN TASK is work for a person. Do not attempt it, and do not report it as done.

## Review loop

Three people build the units, each with an agent of their own. Claude is the reviewer. It runs in one session on the repo owner's computer, and it reviews and merges every pull request. `docs/software-plan.md` says who owns which unit.

### If you wrote the pull request

1. Title it with the unit id, such as `U07: fetch one Mars day from MEDA`. The body holds the pasted check output, every NEEDS HUMAN input you left `null`, and every skill you could not load.
2. Do not merge your own pull request.
3. After you open it, read its comments every few minutes with `gh pr view <number> --comments`. If your tool cannot wait, tell your person to ask you again.
4. When a comment starts with `REVIEW` and says `changes needed`, fix every numbered issue on the same branch and push. Reply with one comment that lists each issue number and what you did. If you think an issue is wrong, say why in that reply and do not change the code for it.
5. The reviewer may rebase your branch or push a small fix to it. Run `git pull --rebase` before you change the branch again, and never force-push over the reviewer's commits.
6. Stop when the pull request merges, or when the reviewer writes `needs a person`.

### If you are Claude, the reviewer

1. Look at every open pull request that is not a draft. Review one when its newest commit has no `REVIEW` comment and its workflow has finished.
2. Check it against this list. Each item is a blocking issue when it fails.
   - The pull request holds one unit, and the units it depends on are merged.
   - The workflow passes. Check out the branch and run the unit's check yourself. Your output matches the pasted output.
   - Every new data value, URL, file name, column name, site name, and citation is in `docs/verified-facts.md`, or the pull request records the call that returned it.
   - The code obeys every status tag and rules 1 to 12.
   - No test was weakened, skipped, or edited to match the output.
   - The code has no bug that changes a result the unit's check or a "done when" line depends on.
3. Post one comment per review. Start it with `REVIEW <first 7 characters of the commit>: changes needed` or `REVIEW <first 7 characters of the commit>: pass`. Number the blocking issues. Give the file and line, what is wrong, and what would fix it. Put style notes under a separate heading, and never block on them.
4. Use comments only. Do not use GitHub's approve or request-changes review, because GitHub refuses both on a pull request from the reviewer's own account.
5. Fix a small issue yourself on the author's branch. A small issue is one of these:
   - A rebase onto main, or a merge conflict where both sides stay.
   - A stale line to delete, such as an answered item in "Not verified yet".
   - A change of about 10 lines that needs no choice item 6 sends to the repo owner, and changes no expected value in a test.

   Push with `git push --force-with-lease=<branch>:<commit you reviewed>`, so that a newer commit from the author stops the push. Say in your comment what you changed. Then wait for the workflow, run the check again, and review your own commit like any other. The author fixes every other issue.
6. When an issue has more than one reasonable fix, or the plan allows two readings, choose one yourself and give the reason in the review. Ask the repo owner to choose before you post the review in two cases only:
   - No option is clearly better than the others.
   - The choice touches something new that the team added or changed, such as a new feature, a new input, or an update to the plan.
7. On `pass`, squash-merge the pull request and delete its branch. First run `gh pr list --base <branch>`, and set the base of each pull request it lists to main. Otherwise GitHub closes them when the branch is deleted. If the merge conflicts, rebase it yourself by item 5.
8. After three `changes needed` comments on one pull request, write `REVIEW: needs a person`, name what is still open, and stop reviewing it until a person replies.
9. Never merge when the workflow fails, when the unit's check fails, or when a HUMAN TASK is reported as done. A HUMAN TASK that is still open, such as the test on the real board, does not block a merge when the unit's check passes without it. The team runs the hardware tests at the end.

## Commands

The workflow in `.github/workflows/ci.yml` runs these on every pull request.

- In `app/`, run `npm ci` once. Then `npm test` runs Vitest once and exits, and `npm run build` type-checks and writes `app/dist/`.
- In `pipeline/`, run `python -m pip install --group dev` once. It needs pip 25.1 or later. Then `python -m pytest` runs the tests.
- Mark a test that needs files under `data/raw/` with `@pytest.mark.raw_data("name")`. It skips with the missing file's name when the file is absent, as it always is in the workflow.
