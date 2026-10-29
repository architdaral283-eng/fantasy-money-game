# Brief: write the roast library for the Fantasy Football Money Game

You are writing the insult library for a private Telegram bot that runs a
real-money football game between four friends in Delhi. When a match is
settled and money changes hands, the bot automatically posts one line from
this library to the group. It fires with no human in the loop.

Your entire output is a list of roast templates as a single SQL file. Read
all of this before writing one.

---

## 1. The game

Four players. Each owns **four real football clubs**, one from each of the
four big European leagues. Sixteen clubs total. When two owned clubs play
each other, real money moves between the two owners.

| Player | Premier League | La Liga | Bundesliga | Serie A |
|---|---|---|---|---|
| **Archit** | Arsenal (1st) | Atlético Madrid (3rd) | Bayer Leverkusen (2nd) | Juventus (4th) |
| **Vedant** | Manchester United (3rd) | Real Madrid (1st) | RB Leipzig (4th) | Napoli (2nd) |
| **Harshal** | Manchester City (2nd) | Real Betis (4th) | Bayern Munich (1st) | AS Roma (3rd) |
| **Anmol** | Aston Villa (4th) | Barcelona (2nd) | Borussia Dortmund (3rd) | Inter (1st) |

The number is the **draft pick** — the order they chose that league's club.
A 1st pick was the best available; a 4th pick was what was left. This matters
enormously for abuse: losing with a 1st pick to somebody's 4th pick is
humiliating, and the library should know it.

Archit is the Commissioner. He runs the bot. He is not above abuse; if
anything he gets more of it.

### Money rules

- Win by 1–3 goals: winner **+₹500**, loser **−₹500**
- Win by 4 or more: winner **+₹1,000**, loser **−₹1,000**
- Draw: **₹0** — nothing moves
- A knockout tie is decided by who advances. **A penalty shootout is a win,
  not a draw.** Extra time counts.
- If one player owns both clubs in a fixture, nothing moves and no roast fires.

Nine competitions count: the four domestic leagues, the Champions League, and
the FA Cup, Copa del Rey, Coppa Italia and DFB-Pokal. Nothing else.

Season runs 21 August 2026 to 5 June 2027. Trophy prizes at the end are
separate and large (₹24,000 in total across all competitions).

---

## 2. What a roast is for

It fires **immediately after a result is recorded**, in the group, attached to
the money. It is the moment the loser finds out in public.

The group is four friends who have been slagging each other off for years.
The bot is the fifth voice in that chat, and it is the only one that is never
tired, never diplomatic and never lets anything go. It should be the most
vicious participant in the conversation.

**The single most common failure is being too polite.** This library has been
rewritten four times for exactly that reason. See §7.

---

## 3. Output format — follow exactly

One SQL file. Postgres. Example of the exact shape:

```sql
INSERT INTO roast_templates (body, target, scope, club_id, derby_id, conditions, severity, weight) VALUES
($B$Arsenal bottled it in a month ending in y. {loser} has built an entire personality on being early to that club, on the process, on the project, on next season, and tonight the project cost him {amount} and whatever credibility he had left in here. {loser_net} on the season. Frame the draft board, {loser}, it is the only thing you have ever got right and even that was an accident.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,13),
($B${score}. Manchester City are a marketing department with a stadium attached, and {loser} picked them because he saw them winning things on a phone. That is not football knowledge, that is shopping. {winner_club} turned up, did the bare minimum, and walked off with {amount} of his money while the away end sang about it.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0030"}',3,14);
```

**Non-negotiable mechanics:**

- Bodies are wrapped in `$B$ ... $B$` dollar quoting. The lines are full of
  apostrophes; normal SQL quoting will break. Never use `'` to quote a body.
- Use `'{"lib":"0030"}'` as the base conditions on every row so the batch can
  be identified and retired as a unit.
- There is a unique index on `md5(body)`. **Every body must be unique**, or it
  is silently dropped on insert.
- Do not write `INSERT ... ON CONFLICT DO NOTHING` differently from the
  example; do not add an id column; do not wrap in a transaction block.

### Columns

| Column | Values | Meaning |
|---|---|---|
| `target` | `LOSER` `WINNER` `BOTH` `NEUTRAL` | Who it is aimed at. Most are `LOSER`. Draw lines are `BOTH`. |
| `scope` | `CLUB` `PLAYER` `MANAGER` `DERBY` `LEAGUE` `MARGIN` `META` | What the line is about. |
| `club_id` | one of the 16 ids, or `NULL` | Set it **only** for `scope='CLUB'`. The line then fires only when that club is involved. |
| `derby_id` | one of the 14 derby ids, or `NULL` | Set it **only** for `scope='DERBY'`. |
| `conditions` | JSONB | See below. |
| `severity` | `1`–`3` | 3 is the hardest. Most of yours should be 3. |
| `weight` | integer, use `10`–`15` | Relative likelihood. Your best lines get 14–15. |

### Club ids (use these exact strings)

`arsenal` `man-city` `man-utd` `aston-villa` · `real-madrid` `barcelona`
`atletico` `real-betis` · `bayern` `leverkusen` `dortmund` `rb-leipzig` ·
`inter` `napoli` `roma` `juventus`

### Derby ids

**True derbies:** `el-clasico` (Real Madrid–Barcelona), `madrid-derby`
(Real Madrid–Atlético), `manchester-derby` (City–United), `klassiker`
(Bayern–Dortmund), `derby-d-italia` (Inter–Juventus), `derby-del-sole`
(Napoli–Roma), `bavaria-rhine` (Bayern–Leverkusen), `north-south`
(Juventus–Napoli)

**Grudges:** `arsenal-utd`, `madrid-bayern`, `barca-inter`, `atleti-betis`,
`dortmund-leipzig`, `arsenal-city`

### Conditions

Optional extra keys inside the `conditions` JSON that restrict when a line can
fire. Use them to aim a line that only makes sense in a specific situation:

- `"margin_min": 3` — only when the winning margin is 3 or more
- `"margin_max": 0` — only on a draw (combine with `"draw": true`)
- `"is_derby": true` — only when the fixture is a listed derby
- `"is_upset": true` — only when the loser had the better draft pick in the
  same league, or was ahead on money before this result
- `"draw": true` — a draw line

A line with no extra conditions can fire on any result involving its club.
**Aim your hardest lines with conditions rather than leaving them unaimed** —
a line about a thrashing that fires on a 1–0 reads as nonsense.

---

## 4. Slots

Write these literally. The bot substitutes real values at send time.

| Slot | Renders as | Notes |
|---|---|---|
| `{loser}` `{winner}` | `Vedant` | First names. |
| `{loser_club}` `{winner_club}` | `Real Madrid` | Full club names. |
| `{score}` | `3–1` | **Winner's goals first**, always. Never write it as home-first. |
| `{margin}` | `2` | Bare number. |
| `{amount}` | `₹500` | What this result cost. |
| `{competition}` | `Premier League` | |
| `{loser_pick}` `{winner_pick}` | `4th` | Ordinal draft pick. |
| `{h2h}` | `Anmol leads 3–1` or `level at 2–2` | Already a sentence fragment. |
| `{loser_net}` `{winner_net}` | `−₹3,500` | Season net, with sign. |
| `{owed}` | `₹1,500` | What the loser owes the winner across the season. |
| `{streak}` | `fourth straight loss` | A phrase, not a number. Only meaningful when losses are stacking. |
| `{marquee}` | `Harry Kane` | The club's best player. |
| `{manager}` | `Vincent Kompany` | |
| `{rank}` | `third of four` | A word, never a digit. |
| **Draw lines only** | | |
| `{home_owner}` `{away_owner}` | `Harshal` | There is no loser in a draw. |
| `{home_club}` `{away_club}` | `Bayern Munich` | |

**There is no `{home_score}` slot.** For a draw, `{score}` still works.

An unknown slot is printed raw, braces and all, straight into the group. Spell
them exactly.

---

## 5. How a line gets chosen

Worth understanding so your lines actually fire:

1. Every template whose bindings match the fixture is eligible — right club,
   right derby, conditions satisfied.
2. Anything used in the last 30 days is skipped (relaxing to 14 then 7 days if
   that leaves nothing).
3. The rest are scored by **specificity × weight**. A line bound to a specific
   club beats a generic one. One of the top five is picked at random, weighted.

So: **specific lines beat generic ones**, and a club with few lines will repeat
itself. Hence the coverage requirement below.

---

## 6. What to write

**Target: 100–120 templates.**

| Group | How many | Notes |
|---|---|---|
| `scope='CLUB'`, one `club_id` each | **5 per club = 80** | The backbone. Every one of the 16 clubs needs five. |
| `scope='DERBY'` | 14 | One per derby id. These should be the nastiest in the library. |
| `scope='MARGIN'`, `"margin_min": 4` | 6 | For thrashings. |
| `scope='META'`, `"is_upset": true` | 6 | 4th pick beats 1st pick; bottom beats top. |
| `scope='META'`, streak lines | 5 | Use `{streak}` and `{loser_net}`. |
| `scope='META'`, `"draw": true, "margin_max": 0`, `target='BOTH'` | 8 | Nobody lost, nobody paid, both are mocked. |

---

## 7. House style — read this twice

This library has been written four times. Here is what was learned, the hard
way, from the owner's own feedback each round.

### Length is the point

**Median around 270 characters. Long and medium. Never one-liners.**

A previous rewrite produced short, punchy lines. They were shown to the owner
and explicitly rejected: *"now you have made the roasts more short — previous
was better, long medium and brutal."* A roast needs room to build: set up the
club's reputation, turn it on the man who chose it, then land the money.

### The structure that works

The current library's winning shape, in one breath:

> **club's reputation → the man who drafted it → direct second person → the
> money → something final.**

Look at the Arsenal example in §3. It mocks Arsenal's bottling, then Archit's
personality for choosing them, then addresses him directly, then names the
cost, then closes with a line he cannot answer.

### Register

Two earlier libraries failed in opposite directions:

- **Library A** was savage about the clubs and said nothing about the men. Fun
  for a week, then hollow — it was insulting a football club, not a friend.
- **Library B** was sharp about the men and the money but read like
  accountancy. Accurate, cold, no teeth.

**You must do both in the same line.** The club's shame is the setup; the man
who picked it is the target.

### Be genuinely brutal

The owner escalated this request four separate times — *"it is not brutal
enough"*, *"more brutal"*, *"more brutal and hardcore"*, *"more brutal and
personal"*. Do not hedge, do not soften, do not write anything that reads like
a commentator. These four insult each other for sport, and the bot is expected
to be worse than any of them.

Mock: the club's history, its fans, its trophies or lack of them, its spending,
its manager, its collapses, its reputation. Then mock the man for choosing it,
for defending it in the group, for his record, for his balance, for his draft
logic, for what he says in the chat.

### The hard limit: football only

**Nothing about anyone's real life.** No family, no appearance, no job, no
money beyond the game's own ledger, no relationships, no health, nothing
about anyone's background or identity. No slurs of any kind.

This is not squeamishness, it is a design constraint: these fire
**automatically**, with no human deciding whether today is a good day for that
joke. A line about football is always safe to fire. A line about someone's
life is not. The owner asked for off-pitch material and that boundary was
held — this is the one rule that does not bend.

Everything inside football is fair game and should be used without mercy.

### Other rules

- **British English**, written the way these four actually talk. Dry, direct,
  conversational. Not American sportswriting, not Twitter-brained.
- **No emojis. No hashtags. No markdown.** Plain prose only.
- Do not invent results, scores or statistics — use the slots, which carry the
  real numbers. A line that states a fact not in a slot will eventually be
  wrong and the group will notice.
- Do not hardcode anyone's position or balance. Vedant is bottom today and
  might be top in March. Use `{loser_net}`, `{rank}`, `{owed}`, `{h2h}`.
- Vary the openings. If forty lines start with `{score}`, it reads like a
  template, which kills it.
- Every line must make sense **in isolation**, because only one is ever shown.

---

## 8. Current club dossiers

`{marquee}` and `{manager}` are substituted from this table. Use them, but
write so the line still works if a player is sold or a manager is sacked —
e.g. mock the manager's situation generally rather than naming a specific
match he lost.

| Club | `{marquee}` | `{manager}` |
|---|---|---|
| Arsenal | Bukayo Saka | Mikel Arteta |
| Manchester City | Erling Haaland | Enzo Maresca |
| Manchester United | Bruno Fernandes | *(uncertain — avoid `{manager}` for United)* |
| Aston Villa | Ollie Watkins | Unai Emery |
| Real Madrid | Kylian Mbappé | José Mourinho |
| Barcelona | Lamine Yamal | Hansi Flick |
| Atlético Madrid | Julián Álvarez | Diego Simeone |
| Real Betis | Isco | Manuel Pellegrini |
| Bayern Munich | Harry Kane | Vincent Kompany |
| Bayer Leverkusen | Florian Wirtz | Carles Martínez Novell |
| Borussia Dortmund | Serhou Guirassy | Niko Kovač |
| RB Leipzig | Loïs Openda | Martín Demichelis |
| Inter | Lautaro Martínez | Cristian Chivu |
| Napoli | Scott McTominay | Massimiliano Allegri |
| AS Roma | Paulo Dybala | Gian Piero Gasperini |
| Juventus | Kenan Yıldız | Luciano Spalletti |

---

## 9. Worked examples from the live library

These are currently in production and are the standard to match or beat.

**CLUB, Arsenal, severity 3:**
> `{margin}`-nil to `{winner_club}`, and `{loser}` did not win a single
> argument on the way down. Arsenal are the most emotionally fragile football
> club in England, a side that has turned February into a medical condition,
> and `{loser}` drafted them with his eyes open and told this group it was a
> steal. It was not a steal. It is a `{amount}` standing order to men who
> picked better, and he will be in here before midnight explaining the xG to
> three people who watched the same match and understood it.

**CLUB, Manchester City, severity 3:**
> No history before 2008, no manager worth the name, no idea after ninety
> minutes, and no argument left. `{loser}` owns the most expensive squad
> assembled by any club on earth and he is sitting there `{loser_net}`, which
> takes a genuine talent. Guardiola walked out and took the only football
> brain in the building with him. `{loser}` still says structure like he knows
> what the word means. You do not. You never have. `{amount}`.

**CLUB, Arsenal, severity 3 — the draft angle:**
> `{loser}` used a first-round pick on Arsenal. In the year of our lord. After
> everything. Every single person in this group watched him do it and said
> nothing, because some mistakes a man has to make himself, and tonight the
> mistake sent an invoice for `{amount}`.

**META, draw, target BOTH — note these are allowed to be short:**
> `{home_club}` `{score}` `{away_club}`. Two idiots, zero rupees, and both of
> them think they won the argument.

---

## 10. Before you hand it over

- [ ] 100–120 rows, every `body` unique
- [ ] Exactly 5 CLUB lines for each of the 16 clubs, correct `club_id`
- [ ] All 14 derby ids used
- [ ] Every body wrapped in `$B$ ... $B$`
- [ ] `'{"lib":"0030"}'` on every row, plus aiming conditions where needed
- [ ] `club_id` set only on CLUB rows; `derby_id` only on DERBY rows
- [ ] Draw lines are `target='BOTH'` and use `{home_owner}` / `{away_owner}`,
      never `{loser}`
- [ ] No slot outside the §4 table; all spelled exactly
- [ ] Median length around 270 characters; nothing that reads as a one-liner
- [ ] Nothing about anyone's life outside football
- [ ] Valid SQL: trailing `;`, no stray commas

Output the SQL file and nothing else.
