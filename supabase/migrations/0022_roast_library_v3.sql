-- Migration 0022: the roast library Archit actually wanted.
--
-- 0012 was brutal about CLUBS and said nothing about the men who drafted them.
-- 0019 was sharp about the MEN and the ledger, but read like accountancy: by
-- October the group was getting arithmetic instead of abuse. This library fuses
-- the two. Every line humiliates the club on its real reputation, then turns on
-- the owner who chose it, then takes his money.
--
-- LENGTH IS DELIBERATE. These are long and medium, never one-liners. A roast
-- here is a sustained kicking: club -> owner -> direct second person -> money
-- -> something final. Short lines were tried and rejected.
--
-- REGISTER: four best friends who have taken money off each other since August
-- and insult each other for sport. Mugs, clowns, frauds, talking bollocks,
-- knowing nothing about football. It stays ON FOOTBALL: clubs, draft picks,
-- records, and what they say in the group. Nothing about anybody's life off
-- the pitch — this fires automatically, with no human deciding whether today
-- is a good day for that joke.
--
-- SEVERITY: the column is CHECK(1..3), so 3 is the ceiling. severityOk() has
-- been changed in the same commit so 3 no longer needs a 3+ margin, a derby or
-- an upset — that gate is why 45 of 0019's best lines almost never fired.
-- conditions.margin_min now carries that job where it is actually wanted.
--
-- SLOTS: {loser} {winner} {loser_club} {winner_club} {score} {margin} {amount}
--        {competition} {loser_pick} {winner_pick} {h2h} {loser_net} {winner_net}
--        {owed} {streak} {marquee} {manager} {rank}
--        draws only: {home_owner} {away_owner} {home_club} {away_club}
--
-- IDEMPOTENT: md5(body) is unique (0019). Re-running inserts nothing new.
-- Rows are RETIRED, never deleted: roast_events.template_ids references them.

-- Keep 0020's draw lines; retire everything else that is not this library.
UPDATE roast_templates SET retired = true
WHERE coalesce(conditions->>'lib', '') NOT IN ('0020', '0022');

INSERT INTO roast_templates (body, target, scope, club_id, derby_id, conditions, severity, weight) VALUES

-- ===================== ARSENAL =====================
($B${margin}-nil to {winner_club}, and {loser} did not win a single argument on the way down. Arsenal are the most emotionally fragile football club in England, a side that has turned February into a medical condition, and {loser} drafted them with his eyes open and told this group it was a steal. It was not a steal. It is a {amount} standing order to men who picked better, and he will be in here before midnight explaining the xG to three people who watched the same match and understood it.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0022"}',3,14),
($B$Arsenal bottled it in a month ending in y. {loser} has built an entire personality on being early to that club, on the process, on the project, on next season, and tonight the project cost him {amount} and whatever credibility he had left in here. {loser_net} on the season. Frame the draft board, {loser}, it is the only thing you have ever got right and even that was an accident.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0022"}',3,13),
($B${marquee} touched the ball eleven times and three of them were kick-offs, which is still more involvement than {loser} has had in a winning result this month. {score}. Arsenal do this every year, to everyone, forever, and the one man in this group who refuses to learn it just paid {amount} for the lesson again.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0022"}',3,12),
($B$The process is going well. Four years of it, a trophy cabinet you could store in a glovebox, and {loser} still arrives in this group every week with a tactical opinion nobody asked for. {winner_club} did not need to be good tonight, they needed to turn up, and that was enough to take {amount} off a man who thinks watching highlights counts as analysis.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0022"}',3,13),
($B${loser} used a first-round pick on Arsenal. In the year of our lord. After everything. Every single person in this group watched him do it and said nothing, because some mistakes a man has to make himself, and tonight the mistake sent an invoice for {amount}.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0022"}',3,14),

-- ===================== MANCHESTER CITY =====================
($B$No history before 2008, no manager worth the name, no idea after ninety minutes, and no argument left. {loser} owns the most expensive squad assembled by any club on earth and he is sitting there {loser_net}, which takes a genuine talent. Guardiola walked out and took the only football brain in the building with him. {loser} still says structure like he knows what the word means. You do not. You never have. {amount}.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0022"}',3,15),
($B${score}. Manchester City are a marketing department with a stadium attached, and {loser} picked them because he saw them winning things on a phone. That is not football knowledge, that is shopping. {winner_club} turned up, did the bare minimum, and walked off with {amount} of his money while the away end sang about it.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0022"}',3,14),
($B$Empty seats, bought trophies, borrowed anthem. {loser} drafted the one club in world football that has to pipe in its own atmosphere and has spent the season telling the rest of us about sustainable models. {amount}, mate. Sustain that.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0022"}',3,13),
($B$All that money, all those players, and they cannot beat {winner_club} on a Tuesday. {loser} is {rank} of four in a league of four, he owns a squad worth more than the other fifteen clubs in this draft combined, and he is still writing paragraphs in here about fine margins. The margin was {margin}. {amount}.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0022"}',3,14),
($B$Pep left and the whole thing fell over, which everyone except {loser} saw coming from about four thousand miles away. He drafted a manager, not a club, and the manager is gone. What is left is {loser_club}, {score}, and {amount} out of his pocket into {winner}'s.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0022"}',3,13),

-- ===================== MANCHESTER UNITED =====================
($B$Net spend of a nation state, output of a midtable side. A new era every eighteen months, a new manager every twelve, a new excuse from {loser} every single week. He looked at all of that — the whole smoking wreck of it — and said yes, that is my pick, that is a big club. It is not a big club, it is a museum with a wage bill, and it just cost him {amount}.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0022"}',3,15),
($B$Manchester United again. {loser} will still call them a big club while he is transferring {amount} to a man who drafted better. The league title cabinet has not moved since he was in school. The only thing United lead is the conversation about how they used to be good, and the only thing {loser} leads is the conversation about why none of this is his fault.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0022"}',3,15),
($B${score}. {marquee} ran about a lot, which is what United buy now instead of footballers, and it still was not enough to save {loser} {amount}. He is {loser_net} on the season and he will tell you the squad needs one more window. It has needed one more window for a decade. You are the window, {loser}.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0022"}',3,14),
($B$A club that sells the ground, the stars and the dignity and calls it a rebuild. {loser} bought into it at the draft and has been paying the instalments all season. {winner_club} beat them without needing a plan. {amount}, and he will be back in here within the hour explaining that it is a process.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0022"}',3,13),
($B$The badge is heavier than the squad. United have been living off things that happened before most of this group could read, and the one man who drafted them is dead last with {loser_net}. That is not bad luck, {loser}. That is a decision you made in August and have been defending ever since.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0022"}',3,14),

-- ===================== ASTON VILLA =====================
($B$Delusions of size, performances of size small. One good season as an entire personality, and {loser} has been dining out on it since August while his side forgets how to score. {score}. {amount} to {winner}. Villa have reverted to exactly what they are and so, frankly, has their owner.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0022"}',3,14),
($B$Aston Villa. A club whose greatest achievement happened before anyone in this group was born, drafted by a man who still arrives in here with opinions about centre forwards while his own have not scored since the season started. {amount}, {loser}. Buy a striker, or at least buy a clue.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0022"}',3,14),
($B${margin} goals, and Villa looked exactly like what they are: a mid-table side with a big-club complex and an owner to match. {loser} will talk about Emery, about the project, about Europe. He is {loser_net} and {rank} of four. Nobody is listening, {loser}. Nobody has been listening for weeks.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0022"}',3,13),
($B${winner_club} did not have to play well to take {amount} off {loser} tonight. They had to play {loser_club}, which is the footballing equivalent of a bye. He picked them on purpose. In a draft. With other clubs available.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0022"}',3,13),

-- ===================== REAL MADRID =====================
($B$Fourteen of them, or fifteen, nobody can be bothered to count, and {loser} has exactly none of it. He spent a first-round pick on Real Madrid, the single most obvious pick available to a man who has never watched a full league game, and he is {loser_net} and {rank} of four. The badge carries weight. He does not. {amount}.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0022"}',3,15),
($B$Winning badly and calling it destiny only works in Europe, {loser}. This was {competition}, there was no anthem, nobody was frightened, and {winner_club} took {amount} off you in front of everyone. Where was {marquee}? Was he on the pitch, or is that just what the wages look like from row Z?$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0022"}',3,14),
($B${score}. The most decorated club in the history of the sport, drafted by the least decorated man in this league. {loser} has two wins. Two. He will explain that Madrid always start slowly, that they peak in spring, that you judge them in May. You will be {loser_net} in May as well, mate.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0022"}',3,15),
($B$Galácticos, white shirts, the lot, and {loser} still cannot get out of last place in a four-man league. Taking Real Madrid at the first pick is not football knowledge, it is reading the biggest name on the board and pointing at it. Tonight the biggest name on the board lost, and he paid {amount} for the privilege of owning it.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0022"}',3,14),

-- ===================== BARCELONA =====================
($B$Pulled another lever and it landed on {loser}. {amount}, payable immediately, unlike the debt. Barcelona have spent a decade selling the future to pay for the past and {loser} drafted them anyway, then spent the season in here lecturing the rest of us about identity and philosophy. Your philosophy lost {score}, and the ledger does not care how pretty it was.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0022"}',3,14),
($B$Sold the stadium, kept the problems. {loser_club} are a financial instrument that occasionally plays football, and {loser} picked them because he liked the shirt. {score}, {amount} to {winner}, and a man who cannot explain a single thing that happened tonight is about to try for twenty minutes.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0022"}',3,13),
($B$All that possession and nothing at the end of it, which is also a fair description of {loser}'s contributions to this group. {margin} goals. {amount}. {h2h}. He will say they were the better side. They were not the better side, they were the side that lost, and you are the man who pays.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0022"}',3,13),
($B$La Masia produced {marquee} and {loser} produced {loser_net}. One of those is a youth academy and the other is a man who has never once been right about a football match in this chat. {amount} to {winner}, who did not need a philosophy, just a result.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0022"}',3,14),

-- ===================== ATLETICO MADRID =====================
($B$Parked the bus. The bus got towed. {amount} to {winner}, and {loser} is already typing about how unfair the towing was. Ninety minutes of suffering, zero minutes of football, and a man who drafted that on purpose and calls it pragmatism. It is not pragmatism, {loser}, it is boredom with a crest on it.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0022"}',3,14),
($B$Simeone has been doing the same thing for fifteen years and it still does not work in the games that matter. {loser} drafted that, watched it fail again tonight at {score}, and will now explain to this group that it was a tactical plan. The plan was to lose narrowly and it was executed perfectly. {amount}.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0022"}',3,14),
($B$Eleven men behind the ball and {loser} still conceded {margin}. There is no defence for that, literally or otherwise. {winner_club} have the points, {winner} has {amount}, and {loser} has a theory nobody in here is going to read.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0022"}',3,13),
($B$A club whose entire identity is losing to Real Madrid in important matches, drafted by a man whose entire identity is losing to everybody in this one. {score}. {loser_net}. {amount}. Perfect fit, honestly.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0022"}',3,13),

-- ===================== REAL BETIS =====================
($B$No ambition, no points, no money: the holy trinity of {loser_club}, and now of {loser} too. He drafted a club that exists to be a nice afternoon out and has spent the season pretending it was a value pick. {amount}, {loser}. There is no value. There is a mid-table Spanish side and a man in Delhi who thought he was clever.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0022"}',3,14),
($B$Betis. Actual Real Betis. A fourth-round pick that {loser} defended for twenty minutes in the group chat as a sleeper, and tonight the sleeper slept through {score}. {amount} to {winner}, who drafted an actual football club.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0022"}',3,13),
($B$Existing to embarrass bigger clubs, embarrassed by one instead. {winner} sends regards and keeps the {amount}. {loser} will tell you Betis are a proper club with proper fans, and he is right, and they are also {score} down and nowhere, which is the bit that costs money.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0022"}',3,13),

-- ===================== BAYERN MUNICH =====================
($B$Farmers league champions, harvested in {competition}. Bayern buy every rival's best player, win the same trophy every single year, and still fold the moment they meet somebody who is not German. {loser} drafted the most boring guaranteed thing in football and somehow still lost with it, which takes a level of incompetence this group has not seen before. {amount}.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0022"}',3,15),
($B$Losing with Bayern Munich. Think about that, {loser}. One club has won that league so often they have stopped celebrating it, and you have managed to turn it into a {amount} bill. {score}. {loser_net}. Nobody drafted worse than you and nobody talks more than you.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0022"}',3,15),
($B${marquee} on a hundred grand a week, a squad bought from every other club in Germany, and {winner_club} beat them anyway. {loser} will say it was a bad night. It was a bad draft, a bad season and a bad opinion, and it has cost him {amount} to find that out in public.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0022"}',3,14),
($B$Bayern win the Bundesliga the way the sun comes up, and {loser} has still found a way to be {loser_net} holding them. The club is not the problem. The club has never been the problem. {amount} to {winner}.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0022"}',3,14),

-- ===================== BAYER LEVERKUSEN =====================
($B$Neverkusen. It is in the name, {loser}. It has been in the name for thirty years, every football person alive knows what that name means, and you picked it anyway and told this group it was a smart contrarian call. It was not contrarian, it was ignorant, and it has cost you {amount} and left you {loser_net}.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0022"}',3,15),
($B$One good season and {loser} bought the sequel. The sequel is direct to video. {score} tonight, {amount} out of his account, and a man who still describes {loser_club} as a project side when they are in fact a side that finishes second and then sells everybody.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0022"}',3,14),
($B$Leverkusen exist to make other clubs feel better about themselves, and tonight they did it for {winner_club} and for {winner}'s wallet. {amount}. {loser} drafted a club famous for bottling and is currently {rank} of four, which is the most on-brand thing that has happened all season.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0022"}',3,14),

-- ===================== BORUSSIA DORTMUND =====================
($B$Bayern's feeder club delivered on schedule. Dortmund's entire function in German football is to develop players for the team that beats them, they have been farmed for a decade, every single person alive knows this, and {loser} looked straight at it and called it value at the draft. It is not value. It is a direct debit, and tonight's instalment is {amount}.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0022"}',3,15),
($B$Selling club, selling performance, everything must go including the {amount}. {loser} will be in here within the hour explaining {manager}'s shape to three men who watched the same match and understood it better than he did while it was happening. {score}. {loser_net}. Sit down.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0022"}',3,14),
($B$The yellow wall is magnificent and the team in front of it is a shop window. {loser} drafted the shop window. {winner_club} came in, took what they wanted, and left him with {score} and a {amount} bill. He has been wrong about this club since August and he is not finished being wrong about it.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0022"}',3,14),

-- ===================== RB LEIPZIG =====================
($B$A club invented in 2009 by an energy drink company, with no fans, no history and a name they had to design around a rule book, just took {amount} off {loser} — or would have, if he had not already lost to it. He drafted a marketing exercise. In a draft. With real football clubs on the board. {score}, {loser_net}, and still the loudest man in this chat.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0022"}',3,15),
($B$No fans, no history, no problem beating {loser_club}. {score}. {loser} spent a pick on a soft drink with a stadium and has spent every week since explaining the recruitment model to people who did not ask. The model produced {loser_net}. {amount} to {winner}.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0022"}',3,14),
($B$Leipzig are what happens when a spreadsheet is given a kit, and {loser} fell for it completely. Tonight the spreadsheet lost {score} and the man holding it is {amount} lighter and {rank} of four. Data-driven, apparently.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0022"}',3,13),

-- ===================== INTER =====================
($B$Bottling finals is the tradition at {loser_club} and tonight they bottled something smaller, earlier and cheaper, which is somehow worse. {amount}. {loser} drafted a club that specialises in losing the biggest game available and he has applied the same philosophy to this league with total commitment: {loser_net}, {rank} of four.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0022"}',3,14),
($B$A retirement league with retirement defending, and {loser} picked the side that pays the pensions. {score}. {winner_club} accept the contribution, {winner} accepts the {amount}, and the rest of us accept that {loser} is going to talk about this for a week.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0022"}',3,13),
($B$Inter spend money they do not have on players nobody else wants and {loser} called that a dynasty at the draft. Tonight the dynasty lost {score} and the emperor paid {amount}. {h2h}. It has never been close and he keeps insisting that it is.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0022"}',3,14),

-- ===================== NAPOLI =====================
($B$One title a generation, and {loser} drafted them in the wrong one. Napoli spend forty years being a lovely idea and about eighteen months being a football team, and he has managed to own them for the forty. {score}, {amount}, {loser_net}. Maradona nostalgia is older than everyone in this chat and the defending is older still.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0022"}',3,15),
($B$Sells everyone who plays well, then wonders why nobody plays well. {loser} funded that cycle at the draft and is funding it again tonight at {amount} a go. He will mention the scudetto. It was one season, mate, and you were not even watching at the time.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0022"}',3,14),
($B$The manager walked out and {loser} still thinks the problem was tactical. The problem is the club, the problem is the pick, and increasingly the problem is the man holding it: {rank} of four, {loser_net}, and {amount} lighter after {score}.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0022"}',3,14),

-- ===================== ROMA =====================
($B$Perpetual almost. Almost defended, almost scored, fully paid {amount}. Roma have turned nearly into a business model and {loser} bought shares at the draft, and he has spent every week since telling this group about the atmosphere. The atmosphere is not a result, {loser}. {score} is a result. {loser_net} is a result.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0022"}',3,14),
($B$Totti nostalgia cannot defend a counter-attack and {score} cannot be appealed to history. {loser_club} are a club that finishes sixth with enormous passion and {loser} drafted that energy for himself. {amount} to {winner}, who drafted a team instead.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0022"}',3,14),
($B$Every year Roma are about to turn a corner and every year the corner turns out to be a wall. {loser} walked into it at the draft and has been walking into it ever since. {margin} goals. {amount}. {h2h}, and he still calls it close.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0022"}',3,13),

-- ===================== JUVENTUS =====================
($B$The asterisk turned up, {winner_club} turned up, and {loser} turned up to pay. {amount}. Juventus have spent two decades being either stripped of things or knocked out of them, and {loser} drafted that heritage and calls himself a student of the game. You are not a student of the game. You are {loser_net} and {rank} of four.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0022"}',3,15),
($B$Not even in Europe properly and still losing to clubs preparing for it. {score}. {loser} will talk about the shirt, the history, the Old Lady. The Old Lady has not won anything that frightened anybody in years, and neither has he: {amount} gone, and the ledger remembers all of it.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0022"}',3,14),
($B$A club that wins ugly, except for the part where they lost. {score}, {amount}, and {loser} explaining the defensive structure of a side that just conceded {margin}. Nobody in this group has ever asked him a tactical question and he has answered thousands of them.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0022"}',3,13),

-- ===================== DERBIES =====================
-- Bound by derby_id, so these only fire for the real fixture.
($B$El Clásico, the biggest club game on earth, and {loser_club} turned up with that. Somewhere an investor is asking for a refund and somewhere else {loser} is typing a paragraph about momentum. Ninety minutes of the best fixture in football and he got {score} and a {amount} bill out of it.$B$,'LOSER','DERBY',NULL,'el-clasico','{"lib":"0022","is_derby":true}',3,16),
($B$Der Klassiker. Bayern against Dortmund is a rivalry the way a bank is a rival to a wallet, and {winner} made the withdrawal: {amount}. {loser_club} played like the undercard and got paid like it too, which is to say nothing, plus an invoice.$B$,'LOSER','DERBY',NULL,'klassiker','{"lib":"0022","is_derby":true}',3,16),
($B$Manchester derby and {loser} owns half the city and none of the points. Same city, same night, apparently a different sport: {winner_club} played football and {loser_club} attended. {amount} across town, and he will be quiet in here for about forty minutes before he is not.$B$,'LOSER','DERBY',NULL,'manchester-derby','{"lib":"0022","is_derby":true}',3,16),
($B$Derby d'Italia. {loser} brought history to a football match and history did not show up. {score}. {amount}. He will tell you what this fixture means. It means he is {loser_net} and the other three of us watched it happen.$B$,'LOSER','DERBY',NULL,'derby-d-italia','{"lib":"0022","is_derby":true}',3,16),
($B$Madrid derby. Losing to {winner_club} is a tradition at {loser_club}, one they observe with real commitment, and some traditions cost {amount}. {loser} knew the history when he drafted them and chose to believe this season was different. It is never different.$B$,'LOSER','DERBY',NULL,'madrid-derby','{"lib":"0022","is_derby":true}',3,16),
($B$Derby del Sole and {loser} has nothing to say for once. {score}, {amount}, {h2h}. Two clubs who define themselves by hating each other, and the one that cares most just lost again in front of the entire group.$B$,'LOSER','DERBY',NULL,'derby-del-sole','{"lib":"0022","is_derby":true}',3,15),
($B$Bavaria against the Rhine, the serial winners against the serial nearly-men, and it went exactly as everyone who has ever watched German football expected. {loser} did not expect it, because {loser} does not watch German football, he just drafted in it. {amount}.$B$,'LOSER','DERBY',NULL,'bavaria-rhine','{"lib":"0022","is_derby":true}',3,15),
($B$North against South, and the south is {loser_net} and bottom of a four-man league. {score}. This fixture has decided Italian titles. Tonight it decided that {loser} owes {winner} {amount} and that he should probably stop talking about Serie A.$B$,'LOSER','DERBY',NULL,'north-south','{"lib":"0022","is_derby":true}',3,15),
($B$A derby. Of all the ways to lose {amount}, {loser} picked the one he will hear about every single day until the reverse fixture, from three men who will not let it go and should not. {score}. Screenshot it.$B$,'LOSER','META',NULL,NULL,'{"lib":"0022","is_derby":true}',3,15),

-- ===================== THRASHINGS (margin 4+) =====================
($B${margin} goals. Not unlucky, not xG, not the referee, not a bad night: just worse at football, in public, for money. {loser} has {amount} less and a week of this coming. There is no explanation that helps him here and he is going to attempt one anyway.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0022","margin_min":4}',3,18),
($B${score}. {loser_club} did not turn up and {loser} will spend tomorrow telling us about the fixture list, the injuries and the officials. Four or more goals is not a narrative, it is a verdict. {amount}, {loser_net}, and the ledger keeps this one forever.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0022","margin_min":4}',3,18),
($B$Conceding {margin} is not a result, it is a confession. {loser} drafted {loser_club} and told this group he knew what he was doing. He did not know what he was doing. He has never known what he was doing. {amount} to {winner}.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0022","margin_min":4}',3,17),
($B${margin}-goal defeat, {amount} gone, {loser_net} on the season, {rank} of four. At what point does {loser} stop calling it variance and start calling it a pattern? Tonight would be a good time. He will not.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0022","margin_min":4}',3,17),

-- ===================== THE MAN HIMSELF =====================
($B${loser} is {rank} of four. There are four of us. He has the loudest opinions, some of the biggest clubs, and the worst record in the entire league, and the only thing he has led all season is the discussion about why none of it is his fault. {amount}. {loser_net}. Read that back slowly.$B$,'LOSER','META',NULL,NULL,'{"lib":"0022"}',3,16),
($B$That is {streak} for {loser}. He has now been publicly, confidently wrong about football more times this season than he has been right, and not once has he entertained the possibility that the problem is the man picking the teams. {amount}.$B$,'LOSER','META',NULL,NULL,'{"lib":"0022","is_streak":true}',3,17),
($B${loser} owes {winner} {owed} across all their meetings. That is not a rivalry, that is a standing order with commentary. {h2h}. He will call it close. It has never been close. {amount} tonight, and he is still talking.$B$,'LOSER','META',NULL,NULL,'{"lib":"0022"}',3,15),
($B$A {winner_pick}-round pick just took {amount} off a {loser_pick}-round pick. Say that out loud, {loser}. The draft board is on the wall and it is a receipt, not a trophy, and tonight it has your name on the wrong side of it again.$B$,'LOSER','META',NULL,NULL,'{"lib":"0022","opponent_draft_pick_worse_by":2}',3,16),
($B$Sixteen clubs between four men and {loser} has managed to assemble the only portfolio that loses on every continent at once. {loser_net}. {amount}. At this point the draft was not a mistake, it was a statement of character.$B$,'LOSER','META',NULL,NULL,'{"lib":"0022"}',3,15),
($B${loser} has {amount} fewer reasons to speak in here tonight. He will speak anyway. He always does. {score}, {loser_net}, {rank} of four, and an opinion about the other three teams loaded and ready.$B$,'LOSER','META',NULL,NULL,'{"lib":"0022"}',3,14),
($B$No VAR, no appeal, no refund, no excuse. {loser} pays {winner} {amount}, the table sorts itself out, and the permanent record of this league gets one more line with his name on it. Append-only, mate. Forever.$B$,'LOSER','META',NULL,NULL,'{"lib":"0022"}',3,14),
($B${winner} is {winner_net} and did not have to do a thing except own the right club. {loser} did research. He told us he did research. He said the word analytics. {amount}.$B$,'BOTH','META',NULL,NULL,'{"lib":"0022"}',3,15),
($B${loser_net} on the season and still the first man in here to comment on everyone else's team. The confidence of someone who has never once been right, backed by the record of someone who never will be. {amount}.$B$,'LOSER','META',NULL,NULL,'{"lib":"0022"}',3,16),
($B$Upset of the week, except nobody is surprised any more. {loser} was meant to be better than this on paper, and paper is the only place he has ever been better. {score}, {amount}, {loser_net}.$B$,'LOSER','META',NULL,NULL,'{"lib":"0022","is_upset":true}',3,16)

ON CONFLICT DO NOTHING;

-- ===================== DOSSIER REFRESH =====================
-- club_dossiers was seeded in January 2026 and never touched again, so the
-- {manager} slot has been naming men who left months ago. Verified against the
-- 2026-27 league pages on 26 Oct 2026.
--
-- NOT updated: man-utd. Amorim was sacked in January 2026 and is now at Milan;
-- Carrick was only ever interim and who holds the job for 2026-27 could not be
-- confirmed. Left as-is deliberately rather than guessed at. No line in this
-- library uses {manager} for Manchester United.
UPDATE club_dossiers SET manager = 'Enzo Maresca',            reviewed_at = '2026-10-26' WHERE club_id = 'man-city';
UPDATE club_dossiers SET manager = 'José Mourinho',           reviewed_at = '2026-10-26' WHERE club_id = 'real-madrid';
UPDATE club_dossiers SET manager = 'Massimiliano Allegri',    reviewed_at = '2026-10-26' WHERE club_id = 'napoli';
UPDATE club_dossiers SET manager = 'Luciano Spalletti',       reviewed_at = '2026-10-26' WHERE club_id = 'juventus';
UPDATE club_dossiers SET manager = 'Carles Martínez Novell',  reviewed_at = '2026-10-26' WHERE club_id = 'leverkusen';
UPDATE club_dossiers SET manager = 'Martín Demichelis',       reviewed_at = '2026-10-26' WHERE club_id = 'rb-leipzig';

-- Marquee players re-checked the same day and all still correct: Saka,
-- Bruno Fernandes, Watkins, Mbappé, Yamal, Julián Álvarez, Isco, Kane, Wirtz,
-- Guirassy, Openda, Lautaro, McTominay, Dybala, Yıldız.
