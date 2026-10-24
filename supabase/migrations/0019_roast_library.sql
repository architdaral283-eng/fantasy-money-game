-- Migration 0019: replace the roast corpus. Hard-roast register.
--
-- Written for four best friends who have taken money off each other since
-- August and insult each other for sport. It calls them idiots, mugs and
-- clowns, and questions their football knowledge, because that is the
-- actual register of the group. It stays on football, money and draft
-- decisions, which is where banter belongs.
--
-- Fixes from the old corpus:
--   1. Old bodies put a dollar sign before the brace. The $B$ dollar-quote
--      opener only ate it when a slot began the string, so mid-string slots
--      rendered as "$Harshal paid $₹500". Every body here uses {slot}.
--   2. Thin pools after the 0015 dedupe. ~145 lines, spread wide.
--   3. Tone. The old set was polite. Nobody wanted polite.
--
-- IDEMPOTENT: every row carries conditions->>'lib' = '0019'. condMatch() reads
-- only known keys, so the marker is inert. Rows are RETIRED, never deleted:
-- roast_events.template_ids references them.
--
-- SLOTS: {loser} {winner} {loser_club} {winner_club} {score} {margin} {amount}
--        {competition} {loser_pick} {winner_pick} {h2h} {loser_net} {winner_net}
--        {owed} {streak} {marquee} {manager} {rank}
--
-- SEVERITY 3 is gated behind margin>=3 / derby / upset by severityOk().

CREATE UNIQUE INDEX IF NOT EXISTS roast_templates_body_md5_uniq ON roast_templates (md5(body));
-- Retire everything older than this library. Later libraries (0020 draw lines)
-- are spared, so re-running this file can never wipe them.
UPDATE roast_templates SET retired = true WHERE coalesce(conditions->>'lib', '') NOT IN ('0019', '0020');

INSERT INTO roast_templates (body, target, scope, club_id, derby_id, conditions, severity, weight) VALUES

-- ===================== ARSENAL — archit, EPL pick 1 =====================
($B${loser} used the first pick in England on {loser_club}. One decision, and it told everyone in this group exactly how much football he watches. {amount}, you mug.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0019"}',2,13),
($B${margin} goals. {loser_club} were absolute bollocks and {loser} will still be in here at midnight explaining the xG. Nobody asked. {amount}.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$Arsenal bottled it. Again. {loser} has built an entire personality around a club that cannot get through February, and it costs him {amount} a time.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0019"}',2,13),
($B${manager} has had every window he asked for and produced this. {loser} watched it, paid {amount} for it, and will defend it tomorrow. Clown behaviour.$B$,'LOSER','MANAGER','arsenal',NULL,'{"lib":"0019"}',2,12),
($B$Mentality monsters at {score}. The only monster here is {loser_net}, and {loser} fed it himself.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0019","is_upset":true}',3,13),
($B${marquee} was anonymous and {loser} will blame the referee, the fixture list and the pitch. Everything except the fact he picked this lot first. {h2h}.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0019"}',2,12),
($B$Second is not a trophy, {loser}. Neither is {loser_net}.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0019"}',2,12),

-- ===================== MANCHESTER CITY — harshal, EPL pick 2 =====================
($B$A billion quid of squad and {loser_club} still turned up like a pub team. {loser} pays {amount} and deserves every rupee of it.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0019"}',2,13),
($B${margin} goals. {loser} picked the most expensive team on earth and they were bollocks. That is not bad luck, that is a man with no idea what he is watching.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$You can hear individual seats being empty. {loser} paid {amount} for a worse experience than the people who did not show up.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0019"}',2,12),
($B$115 charges and the only one that landed was {winner} taking {amount} off this idiot.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0019"}',3,13),
($B${manager} will do a press conference about transitions. {loser} will repeat it in here word for word like he worked it out himself. He did not. {amount}.$B$,'LOSER','MANAGER','man-city',NULL,'{"lib":"0019"}',2,12),
($B$No history, no atmosphere, no result, no money. {loser} went four for four tonight. {h2h}.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0019"}',2,12),
($B${marquee} earns more per week than this entire league is worth and could not be arsed. Neither could {loser}, who is {loser_net}.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0019"}',2,11),

-- ===================== MANCHESTER UNITED — vedant, EPL pick 3 =====================
($B${loser_club}. Year nine of the rebuild, and {loser} drafted them on purpose, with his own hands, while sober. {amount}.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0019"}',2,14),
($B${margin} goals. The roof leaks, the midfield leaks, and {loser}'s wallet leaks. Three for three at Old Trafford.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$Eight managers, two billion spent, and {loser} looked at that and thought yes, that is my third pick. The man has never watched a full match in his life.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0019"}',2,13),
($B${marquee} cost more than most squads and did less than most mascots. {loser} is {loser_net} and still talking about the badge.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0019"}',2,12),
($B$Glory glory {score}. Sing that one, {loser}. {amount} to {winner}.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0019"}',2,12),
($B${manager} is the latest mug to find out, and {loser} is the only one of them actually losing money. {h2h}.$B$,'LOSER','MANAGER','man-utd',NULL,'{"lib":"0019"}',2,12),

-- ===================== ASTON VILLA — anmol, EPL pick 4 =====================
($B$Last pick in England, playing like last pick in England. {loser} owes {winner} {amount} and owes the rest of us an apology for the draft.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0019"}',2,13),
($B$Villa Park emptied before the {margin}th went in. {loser} could not leave, he had already paid {amount} and has nothing else to do.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$One decent season four years ago and {loser} has not shut up since. {h2h}. Shut up.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0019"}',2,13),
($B${manager} has done more with less. Tonight he did bugger all with less, and {loser} paid {amount} to watch it happen.$B$,'LOSER','MANAGER','aston-villa',NULL,'{"lib":"0019"}',2,12),
($B${loser} is {loser_net} on a season he described in August as a banker. Define banker.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0019"}',2,12),
($B$Beaten by a bigger club with a smaller excuse. {amount}. Take the loss, {loser}, you have had the practice.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0019"}',2,11),

-- ===================== REAL MADRID — vedant, La Liga pick 1 =====================
($B$Fifteen European Cups and {loser} found a way to lose {amount} with them. That is not football, that is a talent.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0019"}',2,13),
($B${margin} goals past {loser_club}. The Bernabeu is a museum and tonight the exhibits were the back four. {loser} is {loser_net}.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B${loser} took the first pick in Spain because it required no thought whatsoever, and he is still losing. That is the bit that should worry him.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0019"}',2,14),
($B${marquee} did a lap of honour after a defeat. {loser} will do the same in this chat. Both of you, sit down. {amount}.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0019"}',2,12),
($B$No remontada, no comeback, no clue. {score}, and {h2h}.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0019"}',2,12),
($B${manager} has the biggest budget in football and the tactical range of a traffic cone. {loser} funds the viewing at {amount} a go.$B$,'LOSER','MANAGER','real-madrid',NULL,'{"lib":"0019"}',2,12),

-- ===================== BARCELONA — anmol, La Liga pick 2 =====================
($B${loser_club} have more debt than {loser} has opinions, and tonight he added {amount} to the only ledger that bills him.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0019"}',2,13),
($B${margin} goals. They pulled every economic lever in the building and out came absolute bollocks. {loser} paid {amount} for the show.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$Seventy percent possession and nothing to show for it, which is also {loser}'s contribution to every football conversation in this group.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0019"}',2,13),
($B$Mes que un club, menys que un cervell. {loser} is {loser_net}.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0019"}',2,12),
($B${manager} trusts the kids because the adults are unaffordable. {loser} trusts his own judgement for similar reasons. {amount}.$B$,'LOSER','MANAGER','barcelona',NULL,'{"lib":"0019"}',2,12),
($B${marquee} is the future, {loser_club} are the past, and {loser} is {amount} lighter in the present. {h2h}.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0019"}',2,11),

-- ===================== ATLETICO MADRID — archit, La Liga pick 3 =====================
($B$Parked the bus and lost anyway. {loser} paid {amount} for the parking and the bus was bollocks.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0019"}',2,13),
($B${margin} goals against a {manager} side. Somewhere a tactics board is on fire and {loser} struck the match with {amount}.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$Nine men behind the ball and still {score}. {loser} drafted a wall that falls over if you breathe on it. Idiot.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0019"}',2,13),
($B$Grit, spirit, passion, and {loser} handing {winner} {amount} at the end of all of it. Lovely stuff.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0019"}',2,12),
($B${manager} screamed at a linesman for twelve minutes and at his forwards for none. {loser} is {loser_net} and screams at nobody, which is worse.$B$,'LOSER','MANAGER','atletico',NULL,'{"lib":"0019"}',2,12),
($B${marquee} ran in a straight line for ninety minutes and ended where he started. So has {loser}'s season. {h2h}.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0019"}',2,11),

-- ===================== REAL BETIS — harshal, La Liga pick 4 =====================
($B${loser_club} went last in Spain for a reason and {loser} has just paid {amount} to be reminded what it was.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0019"}',2,13),
($B${margin} goals. Lovely stadium, lovely anthem, absolutely bollocks football. {loser} is {loser_net}.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$Viva el Betis manque pierda. He is losing. He has been losing. He will keep losing. {loser}, {amount}.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0019"}',2,13),
($B$A fourth pick losing to {winner_club} is not an upset, it is the weather. {h2h}.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0019"}',2,12),
($B${manager} is working miracles on that budget, and {loser} still found a way to lose money on him. Takes a special kind of mug.$B$,'LOSER','MANAGER','real-betis',NULL,'{"lib":"0019"}',2,12),
($B${marquee} is thirty-six and was the quickest thing on the pitch. That is {loser}'s squad. That is his judgement. {amount}.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0019"}',2,12),

-- ===================== BAYERN MUNICH — harshal, Bundesliga pick 1 =====================
($B$Eleven titles on the bounce and {loser} still found the one night it mattered to be bollocks. {amount}. Genuinely impressive incompetence.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0019"}',2,13),
($B${margin} goals. They buy the best player at every rival just so nobody else can have him, then turn up like this. {loser} picked them first. Clown.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$A club that wins everything, owned by a man who wins nothing. {loser_net}. Work out which variable is the problem, {loser}.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0019"}',3,14),
($B${manager} is gone by March and {loser} will still be defending him in here like he has inside information. He has never been to Germany. {amount}.$B$,'LOSER','MANAGER','bayern',NULL,'{"lib":"0019"}',2,12),
($B${marquee} earns more than this entire league and hid for ninety minutes. {loser} hid for {amount}. {h2h}.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0019"}',2,12),
($B$Easiest first pick in the draft and he is still losing money with it. That takes effort, {loser}.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0019"}',2,13),

-- ===================== BAYER LEVERKUSEN — archit, Bundesliga pick 2 =====================
($B$Neverkusen. The nickname exists for nights exactly like this and {loser} drafted them anyway. Read a book. {amount}.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0019"}',2,14),
($B${margin} goals. One good season and {loser} has dined out on it for two years. Kitchen is shut. {loser_net}.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$Second place is the family business and {loser} bought in at the very top of the market. Mug.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0019"}',2,13),
($B$Not even the second best team in their own country, and {loser} spent a second pick on them. {h2h}.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0019"}',2,13),
($B${manager} has one plan. It is the same plan every week. It was bollocks again tonight and {loser} paid {amount} to watch it be bollocks.$B$,'LOSER','MANAGER','leverkusen',NULL,'{"lib":"0019"}',2,12),
($B$Everyone's clever pick until they play an actual team. {loser} thought he was being clever. {amount} says otherwise.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0019"}',2,12),

-- ===================== BORUSSIA DORTMUND — anmol, Bundesliga pick 3 =====================
($B$A selling club that just sold {loser} {amount} of false hope. He bought it at full price, like always.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0019"}',2,13),
($B${margin} goals in front of the Yellow Wall. Eighty thousand people watched {loser} lose money and not one of them gave a toss.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$Great atmosphere, bollocks defence. {loser} is {loser_net} and has started leading with the atmosphere. That is how you know.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0019"}',2,13),
($B$Every good player they produce leaves for a proper club. {loser} kept the ones nobody wanted and the bill. {amount}.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0019"}',2,12),
($B$2013 was twelve years ago. Let it go, {loser}. {h2h}.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0019"}',2,13),
($B${manager} is the fourth mug to try this and the fourth to find out. {amount} to {winner}.$B$,'LOSER','MANAGER','dortmund',NULL,'{"lib":"0019"}',2,11),

-- ===================== RB LEIPZIG — vedant, Bundesliga pick 4 =====================
($B$A club invented by an energy drink, drafted last, playing last, owned by a man who thinks he knows football. {amount}, {loser}.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0019"}',2,14),
($B${margin} goals and even the marketing department has gone quiet. {loser} is {loser_net} and somehow still loud.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$No history, no fans, no points, no money. {loser} completed the set tonight for {amount}. Collect them all.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0019"}',3,13),
($B${loser} has been justifying this pick since August. Still justifying it. {h2h}. Give it up.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0019"}',2,13),
($B$Gives you wings. Took {loser} {amount}. Net negative, like the man himself.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0019"}',2,12),
($B${manager} is a stepping stone for a manager who is a stepping stone. {loser} is the puddle underneath.$B$,'LOSER','MANAGER','rb-leipzig',NULL,'{"lib":"0019"}',2,12),

-- ===================== INTER — anmol, Serie A pick 1 =====================
($B$First pick in Italy, {score} on the night, {amount} gone. {loser} drafted with enormous confidence and zero knowledge.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0019"}',2,13),
($B${margin} goals. The oldest squad in Europe moved like it and {loser} is aging at exactly the same rate. {loser_net}.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$Finals specialists, league phase amateurs, and {loser} only ever watches the finals, which explains the pick. {h2h}.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0019"}',2,13),
($B${manager} set up not to lose and lost. {loser} set up not to pay and is paying {amount}. Pair of them.$B$,'LOSER','MANAGER','inter',NULL,'{"lib":"0019"}',2,12),
($B${marquee} had one chance and struck it like a man owed money. He is. By {loser}.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0019"}',2,12),
($B$A first pick and a last-place performance. {loser} should be embarrassed, and would be, if he understood what he had watched.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0019"}',2,12),

-- ===================== NAPOLI — vedant, Serie A pick 2 =====================
($B$One scudetto in forty years and {loser} drafted them like it is a going concern. {amount}. Absolute mug.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0019"}',2,13),
($B${margin} goals. Naples is on fire and for once it is not a celebration. {loser} brought the petrol and {amount}.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$Sold their best player, replaced him with nobody, and {loser} still took them second. The man does not read, does not watch, does not learn. {loser_net}.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0019"}',2,14),
($B${marquee} wants out and played like he was already through security. {loser} paid {amount} for the departure lounge.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0019"}',2,12),
($B${manager} is fighting the president, the fans and the fourth official. Everyone except his defenders, who need it most. {h2h}.$B$,'LOSER','MANAGER','napoli',NULL,'{"lib":"0019"}',2,12),
($B$Vesuvius goes off less often than this lot collapse, and {loser} still picked them. {amount}.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0019"}',2,12),

-- ===================== AS ROMA — harshal, Serie A pick 3 =====================
($B$Not won the league since 2001 and {loser} drafted them with a completely straight face. {amount}. Hopeless.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0019"}',2,13),
($B${margin} goals. The Curva have seen some things, but they did not pay {amount} for the privilege like this idiot did.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$Romantic, chaotic, bollocks. {score}, and {loser} is {loser_net}.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0019"}',2,13),
($B${manager} will give a passionate speech about identity. The identity is losing, and {loser} sponsors it at {amount} a time.$B$,'LOSER','MANAGER','roma',NULL,'{"lib":"0019"}',2,12),
($B$Third pick in Italy and third best club in Rome on this evidence. {h2h}.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0019"}',2,12),
($B${marquee} is the entire plan and the plan went missing at {margin} down. So did {loser}'s judgement, in August.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0019"}',2,12),

-- ===================== JUVENTUS — archit, Serie A pick 4 =====================
($B$Thirty-six titles, two of them taken off them, and {loser} still lost {amount} tonight. The asterisk is doing heavy lifting and so is he.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0019"}',2,13),
($B${margin} goals. Irrelevant in Europe since {loser} last had an original football opinion. {loser_net}.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$Fino alla fine. The end came in the first half and cost {amount}.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0019"}',2,13),
($B$Last pick in Italy and it shows every single week. {loser} keeps defending the draft like anyone has forgotten it. {h2h}.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0019"}',2,13),
($B$The Old Lady looked every one of her years, and so did {loser} when the number came through. {amount}.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0019"}',2,12),
($B${manager} has them playing like it is 2011 and not in the way that wins anything. {amount} to {winner}.$B$,'LOSER','MANAGER','juventus',NULL,'{"lib":"0019"}',2,11),

-- ===================== THRASHINGS =====================
($B${margin} goals. {loser} did not lose a football match, he was processed. {amount} to {winner} and not a word of complaint allowed.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0019","margin_min":4}',3,15),
($B${score}. At some point {loser_club} stopped defending and started watching, which is also what {loser} does and calls analysis.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$A {margin}-goal margin is not a result, it is a diagnosis, and the patient is {loser} at {loser_net}.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0019","margin_min":3}',3,14),
($B$Four or more and the rate doubles. {loser} has paid {amount} for the worst ninety minutes of his week and he chose this club himself.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0019","margin_min":4}',3,15),
($B${winner_club} could have had more and stopped out of pity. {loser} does not get pity, he gets a bill for {amount}.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0019","margin_min":4}',3,14),
($B${loser} will tell you the scoreline flattered them. The scoreline was {score}. He cannot read a scoreline. {h2h}.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0019","margin_min":3}',3,13),
($B$One goal in it and {loser} will spend a week explaining how it was nearly a draw. Nearly is not a currency. {amount} is.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0019","margin_max":1}',2,13),
($B$Lost by one. Still lost. Still paying. Still wrong about everything. {h2h}.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0019","margin_max":1}',2,12),
($B$Decided on penalties, which is a coin flip {loser} has now lost with his own money on it. {amount}. Unlucky, mug.$B$,'LOSER','MARGIN',NULL,NULL,'{"lib":"0019","shootout":true}',2,14),

-- ===================== DRAFT PICK HUMILIATION =====================
($B${loser} took {loser_club} at {loser_pick}. {winner} took {winner_club} at {winner_pick}. The worse pick just took {amount} off the better one. Draft board on the wall, {loser}, have a look.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","opponent_draft_pick_worse_by":1}',2,15),
($B$A {winner_pick}-round pick just mugged a {loser_pick}-round pick. {loser} has to live with that until the reverse fixture and so do the rest of us, because he will not stop talking about it.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","opponent_draft_pick_worse_by":2}',3,15),
($B$The draft is not a trophy, {loser}. It is a receipt. {winner} went {winner_pick} and just took {amount} off you.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","opponent_draft_pick_worse_by":2}',3,14),
($B${loser} picked first and is {loser_net}. The draft was the single best moment of his season and it was in August.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","loser_pick":[1]}',3,14),
($B$Last pick, first blood. {winner} did not even want {winner_club} and they have just earned him {amount} off a man who did his research.$B$,'WINNER','META',NULL,NULL,'{"lib":"0019","opponent_draft_pick_worse_by":3}',3,15),
($B${loser_pick} pick, {loser_net} season, and still the loudest football opinion in this group. Correlation is not causation but it is close.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","loser_pick":[1,2]}',2,13),

-- ===================== STREAKS =====================
($B$That is {streak} for {loser}. Not variance. Not luck. Just a man who does not know what he is looking at. {amount}.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_streak":true}',3,15),
($B${streak} and he is still in here telling everyone else how football works. Sit down, {loser}.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_streak":true}',3,15),
($B$At {streak} this stops being a game and becomes a standing order to {winner}. {loser_net}.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_streak":true}',3,14),
($B${streak}. {loser} has stopped looking forward to fixtures and started dreading his phone.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_streak":true}',3,14),
($B$Ranked {rank} of four, {streak}, {loser_net}. That is not a slump, lads, that is just the level.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_streak":true}',3,14),

-- ===================== UPSETS =====================
($B$On paper {loser_club} win that comfortably. {loser} reads a lot of paper and very little football. {amount}.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_upset":true}',3,14),
($B${winner} was not supposed to win and took {amount}. {loser} was supposed to win and paid. Only one of them understood the fixture.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_upset":true}',3,14),
($B$The favourite lost and {loser} will call it a one-off. {h2h}. It is not a one-off, it is a personality.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_upset":true}',3,13),
($B$Biggest upset of the season and the only man surprised is the one who paid {amount} for it. Everyone else saw it coming.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_upset":true}',3,14),

-- ===================== LEAD CHANGES =====================
($B$The table has moved. {winner} is up, {loser} is {loser_net}, and the only thing that changed hands was {amount} and whatever credibility he had left.$B$,'BOTH','META',NULL,NULL,'{"lib":"0019","is_lead_change":true}',3,15),
($B$New man on top. {loser} held that spot for precisely as long as his own clubs allowed, which was not long.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_lead_change":true}',3,14),
($B${amount} and the lead gone in one night. {loser} has lost the money and the right to an opinion until further notice.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_lead_change":true}',3,14),

-- ===================== DERBIES =====================
($B$A derby. Of all the ways to lose {amount}, {loser} picked the one he will hear about every single day until the reverse fixture.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_derby":true}',3,15),
($B$Derby day, {score}, {amount}. {loser} does not get to say the league table matters more. Not this week. Not with that face.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_derby":true}',3,15),
($B$Lose a derby and the money is the small part. {h2h}, and all three of us watched it.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019","is_derby":true}',3,14),

-- ===================== BY COMPETITION =====================
($B$The {competition} does not care who you drafted. {loser_club} found out and {loser} paid {amount} for the education.$B$,'LOSER','LEAGUE',NULL,NULL,'{"lib":"0019"}',2,10),
($B$Another {competition} night, another {amount} out of {loser}. The ledger does not do sympathy and neither do we.$B$,'LOSER','LEAGUE',NULL,NULL,'{"lib":"0019"}',2,10),
($B$In the {competition}, {score} is not unlucky, it is just what he deserved. {loser_net}.$B$,'LOSER','LEAGUE',NULL,NULL,'{"lib":"0019"}',2,10),
($B$European nights are for big clubs. {loser_club} turned up, which was the first mistake, and {loser} backed them, which was the bigger one.$B$,'LOSER','LEAGUE',NULL,NULL,'{"lib":"0019","competitions":["UEFA Champions League"]}',2,12),
($B$The anthem played and {loser_club} heard a warning. {loser} heard {amount} walking out the door.$B$,'LOSER','LEAGUE',NULL,NULL,'{"lib":"0019","competitions":["UEFA Champions League"]}',2,12),

-- ===================== META =====================
($B${loser} owes {winner} {owed} across all their meetings. That is not a rivalry, that is a repayment plan with commentary.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019"}',2,14),
($B$The ledger is append-only, {loser}. This one is in there forever, at {amount}, with your name on it.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019"}',2,12),
($B${loser} is ranked {rank} of four. There are four of us. Think about that.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019"}',2,14),
($B$Sixteen clubs between four men and {loser} managed to pick the ones that lose on the same night. Every time.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019"}',2,13),
($B${loser_net} on the season and still the first to comment on everyone else's team. The confidence of a man who has never been right.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019"}',2,14),
($B${h2h}. It is not close. {loser} keeps calling it close. It is not close.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019"}',2,13),
($B${loser} has {amount} fewer reasons to speak in here tonight. He will speak anyway. He always does.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019"}',2,14),
($B$No VAR, no appeal, no refund, no excuse. {loser} pays {winner} {amount} and the table sorts itself out.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019"}',2,12),
($B${winner} is {winner_net} and did not have to do a thing except own the right club. {loser} did research. Look how that went.$B$,'BOTH','META',NULL,NULL,'{"lib":"0019"}',2,13),
($B$Zero-sum means somebody always feels like this. Tonight it is {loser}, for {amount}, and nobody is surprised.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019"}',2,12),
($B$Every result is permanent and this one has {loser}'s name on the wrong side of it. Forever. Screenshot it.$B$,'LOSER','META',NULL,NULL,'{"lib":"0019"}',2,12)

ON CONFLICT DO NOTHING;
