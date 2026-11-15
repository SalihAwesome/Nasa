# Proving Ground

Proving Ground ranks Earth sites as test grounds for the Moon and Mars, then checks its own estimates with a sensor pod built as a twin of MEDA, the weather station on NASA's Perseverance rover.

The app predicts, the pod measures, and the app compares.

## Ask Proving Ground

Open Ask Proving Ground and use **Connect OpenAI** to save your key on the
local server. You can also set `OPENAI_API_KEY` in `app/.env.local` and
restart `npm run dev` in `app`. Without a key, questions search the local
project documentation. Set `OPENAI_MODEL` in the same file to override the default
`gpt-5-mini` model. The assistant reads local project documentation and
website source files. It sends the question and relevant excerpts to OpenAI.
The local development and preview servers provide the assistant endpoint.

## Plan

Read [the software plan](docs/software-plan.md). It splits the software work into 31 units, each with a check. [The project brief](docs/project-brief.md) holds the idea and the scoring rules. [The mission plan](docs/mission-plan.md) holds the goals. [The verified facts](docs/verified-facts.md) hold what real API calls returned.
