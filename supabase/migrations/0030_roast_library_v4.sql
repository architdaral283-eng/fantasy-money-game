-- Migration 0030: roast library v4.
--
-- Written outside this project and pasted in. The brief it was written from is
-- docs/roast-library-brief.md — read that before changing anything here.
--
-- ORDER MATTERS. The new lines go in FIRST, then a guard checks they actually
-- landed, and only then is the old library stood down. 0022 did it the other
-- way round: it retired the live library before inserting its replacement, so
-- a syntax error in the middle of the INSERT would have left the bot with
-- nothing to say and no error anybody would notice until the next result.
--
-- NOTHING IS EVER DELETED. roast_events.template_ids references template rows
-- by id, so a hard DELETE would orphan the history of every roast ever fired
-- and break the audit trail the ledger relies on. Retiring sets retired=true,
-- the selector ignores those rows, and one UPDATE brings any library back.
--
-- IDEMPOTENT: two unique indexes (0015) cover body+club_id and body alone, so
-- ON CONFLICT DO NOTHING makes a re-run insert nothing and change nothing.
--
-- SLOTS: {loser} {winner} {loser_club} {winner_club} {score} {margin} {amount}
--        {competition} {loser_pick} {winner_pick} {h2h} {loser_net} {winner_net}
--        {owed} {streak} {marquee} {manager} {rank}
--        draws only: {home_owner} {away_owner} {home_club} {away_club}
--
-- Bodies are dollar-quoted with $B$ because they are full of apostrophes.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PASTE THE GENERATED LIBRARY BETWEEN THESE TWO MARKERS                   ║
-- ║                                                                          ║
-- ║  It must be one statement in this exact shape:                           ║
-- ║                                                                          ║
-- ║    INSERT INTO roast_templates                                           ║
-- ║      (body, target, scope, club_id, derby_id, conditions, severity, weight)
-- ║    VALUES                                                                ║
-- ║      ($B$...$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,14),    ║
-- ║      ($B$...$B$,'BOTH','META',NULL,NULL,'{"lib":"0030","draw":true,      ║
-- ║                                           "margin_max":0}',2,13)         ║
-- ║    ON CONFLICT DO NOTHING;                                               ║
-- ║                                                                          ║
-- ║  Every row needs "lib":"0030" in its conditions. That tag is the only    ║
-- ║  thing the guard below and the rollback at the bottom work from.         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- >>> BEGIN PASTED LIBRARY >>>

-- REPLACE, do not append. The live library is retired first; the two
-- inserts below un-retire every line that survived into this version, so
-- only lines present in THIS file end up live. Each partial unique index
-- needs its own conflict target, which is why this cannot be one clause:
-- club rows are unique on (body, club_id), derby rows on (body) alone.
-- Nothing is ever deleted — roast_events references these rows by id.
UPDATE roast_templates SET retired = true WHERE conditions->>'lib' = '0030';

INSERT INTO roast_templates (body, target, scope, club_id, derby_id, conditions, severity, weight) VALUES

-- ARSENAL (11)
($B${score} and Arsenal bottled it again. {loser} you thick madarchod first-round picked this soft club and still looked shocked. Saka carried while the rest hid like cowards. {amount} gone. You’re {loser_net} because you keep believing the process, you stubborn behenchod. Own the L, you gandu.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,15),
($B$Arsenal folded like cheap shit again. {loser} you madarchod spent a first-round pick on serial bottlers and still talks process. Saka runs alone while the expensive passengers vanish. {amount} lighter. {loser_net}. Classic Emirates ownership, you chutiya.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,14),
($B${margin}-nil and Arsenal did what they always do. {loser} you stubborn behenchod first-picked this fragile side. Saka deserves better than this soft shower and better than you. {amount}. {loser_net}. Process this, you gandu.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,14),
($B$Arsenal turned up, looked promising, then choked. {loser} you thick madarchod still defend this project. Twenty years of the same story and you paid top price. {amount} gone. {loser_net}. Own the bottle, you chutiya.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,13),
($B${score}. Arsenal’s February disease hit early. {loser} you madarchod first-round picked the most emotionally fragile club in England. Saka cannot carry your entire balance sheet. {amount}. {loser_net}. Frame the draft board, you behenchod.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,15),
($B$Another Arsenal collapse and {loser} is still explaining. You thick chutiya burned a first-round pick on bottlers. Saka runs, everyone else hides. {amount} gone. {loser_net}. The process just billed you again, you gandu.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,14),
($B$Arsenal bottled it on schedule. {loser} you stubborn madarchod still talk hierarchy after this. First-round pick on a side that folds for fun. {amount}. {loser_net}. Own the L, you behenchod.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,13),
($B${score} and the process failed again. {loser} you thick gandu first-picked Arsenal like it was clever. Saka carried dead wood while you paid {amount}. {loser_net}. Classic Emirates retard behaviour.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,14),
($B$Arsenal looked half-decent then folded. {loser} you madarchod still sell the project in this chat. First-round pick wasted. {amount} gone. {loser_net}. Sit down, you chutiya.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,13),
($B$Serial chokers did it again. {loser} you stubborn behenchod paid top price for this soft club. Saka alone, rest missing. {amount}. {loser_net}. Own the bottle, you gandu.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,14),
($B${score}. Arsenal’s identity is almost and never. {loser} you thick madarchod first-round picked it anyway. {amount} lighter. {loser_net}. Process this, you behenchod.$B$,'LOSER','CLUB','arsenal',NULL,'{"lib":"0030"}',3,15),

-- MAN CITY (11)
($B${score} and the plastic franchise looked ordinary. {loser} you thick madarchod high-picked this spreadsheet club and still defend it. Haaland scores on rails, the rest are branding. {amount} gone. {loser_net}. Own the plastic L, you gandu.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0030"}',3,15),
($B$City forgot the script tonight. {loser} you madarchod spent a high pick on oil money and still looked shocked. Haaland cannot carry an empty identity alone. {amount}. {loser_net}. Plastic to the core, you behenchod.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0030"}',3,14),
($B${margin} goals and City still looked like a corporate away day. {loser} you stubborn chutiya high-picked a balance sheet. {amount} lighter. {loser_net}. Structure this, you gandu.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0030"}',3,14),
($B$No soul, no history, just money — and still {loser} lost. You thick madarchod own the most expensive squad and sit {loser_net}. Haaland scores, everyone else clocks in. {amount}. Own the plastic failure, you behenchod.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0030"}',3,15),
($B$City turned up when the money talked and disappeared when it didn’t. {loser} you madarchod high-picked this franchise. {amount} gone. {loser_net}. Peak tourist ownership, you gandu.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0030"}',3,13),
($B${score}. The oil project looked ordinary. {loser} you stubborn behenchod still call this a proper club. Haaland on rails, rest missing. {amount}. {loser_net}. Own the L, you chutiya.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0030"}',3,14),
($B$Plastic club, plastic result. {loser} you thick madarchod burned a high pick on a spreadsheet. {amount} lighter. {loser_net}. Confusing spending with competence is peak mong behaviour.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0030"}',3,14),
($B$City’s branding failed tonight. {loser} you madarchod high-picked the franchise and still paid. Haaland cannot paper over an empty soul. {amount}. {loser_net}. Sit down, you gandu.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0030"}',3,13),
($B${score} and the sovereign wealth kit looked lost. {loser} you stubborn chutiya still defend this project. {amount} gone. {loser_net}. Plastic through and through, you behenchod.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0030"}',3,14),
($B$No history before 2008 and still {loser} lost money. You thick madarchod high-picked a marketing department. {amount}. {loser_net}. Own the plastic L, you gandu.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0030"}',3,15),
($B$City did the corporate minimum and still cost you. {loser} you madarchod high-picked this empty club. Haaland scores, rest brand. {amount} lighter. {loser_net}. Structure this, you chutiya.$B$,'LOSER','CLUB','man-city',NULL,'{"lib":"0030"}',3,13),

-- MAN UTD (11)
($B${score} and the content farm just got rinsed. {loser} you thick madarchod third-round picked this dead club and still looked shocked. Bruno waved his arms like a drama-school cunt while the midfield vanished. {amount} gone. You’re {loser_net} because you keep treating a corpse like a project, you stubborn behenchod. Own the L, you gandu.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0030"}',3,15),
($B$United looked busy and achieved fuck all. {loser} you madarchod third-picked this museum of decline. Bruno performs outrage, midfield files for divorce. {amount}. {loser_net}. Own the corpse, you chutiya.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0030"}',3,14),
($B${margin} goals conceded and the fallen empire folded. {loser} you stubborn behenchod still treat this content farm seriously. Bruno waving, rest missing. {amount} lighter. {loser_net}. Keep the receipts, you gandu.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0030"}',3,14),
($B$Fifteen years of expensive mediocrity and still {loser} pays. You thick madarchod third-round picked a dead club. Bruno the drama student, midfield gone. {amount}. {loser_net}. Own the decline, you behenchod.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0030"}',3,15),
($B$United turned up, looked expensive, left with nothing. {loser} you madarchod third-picked this circus. Bruno arms waving, result missing. {amount} gone. {loser_net}. Classic tourist ownership, you gandu.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0030"}',3,13),
($B${score}. Content farm got exposed again. {loser} you stubborn chutiya still defend this corpse. Bruno complains, everyone else clocks out. {amount}. {loser_net}. Own the L, you madarchod.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0030"}',3,14),
($B$Post-Fergie special: expensive failure. {loser} you thick madarchod third-round picked it. Bruno theatrics, midfield divorce. {amount} lighter. {loser_net}. Keep every receipt, you behenchod.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0030"}',3,14),
($B$United sold shirts and lost the game. {loser} you madarchod treated this content farm like a project. Bruno waving like a cunt. {amount}. {loser_net}. Own the dead club, you gandu.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0030"}',3,13),
($B${score} and the museum of decline collected another L. {loser} you stubborn behenchod third-picked this. Bruno performs, rest vanish. {amount} gone. {loser_net}. Sit down, you chutiya.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0030"}',3,14),
($B$Fallen empire got rinsed. {loser} you thick madarchod still talk hierarchy with this side. Bruno arms, no midfield. {amount}. {loser_net}. Own the corpse, you gandu.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0030"}',3,15),
($B$United looked busy and lost. {loser} you madarchod third-round picked a dead club. Bruno the drama cunt, result missing. {amount} lighter. {loser_net}. Classic, you behenchod.$B$,'LOSER','CLUB','man-utd',NULL,'{"lib":"0030"}',3,13),

-- ASTON VILLA (11)
($B${score} and Villa’s ceiling showed. {loser} you thick madarchod fourth-picked a solid mid-table side and still lost money. Watkins worked, Emery organised, quality gap remained. {amount} gone. {loser_net}. Even low picks expose chutiyas, you gandu.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0030"}',3,14),
($B$Villa did the honest work and still came up short. {loser} you madarchod fourth-round picked limited quality. Watkins carries, rest ordinary. {amount}. {loser_net}. Own the low-pick L, you behenchod.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0030"}',3,13),
($B${margin}-nil and the nice side got exposed. {loser} you stubborn chutiya fourth-picked Villa thinking value was automatic. {amount} lighter. {loser_net}. Even scraps hurt when ownership is shit, you gandu.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0030"}',3,14),
($B$Solid, limited, and still cost you. {loser} you thick madarchod fourth-picked Aston Villa. Watkins honest, ceiling clear. {amount}. {loser_net}. Own the ordinary L, you behenchod.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0030"}',3,13),
($B${score}. Villa’s limit was on full display. {loser} you madarchod took them late and still paid. Emery maximises, Watkins runs, gap remains. {amount} gone. {loser_net}. Low picks aren’t idiot-proof, you gandu.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0030"}',3,14),
($B$Honest side, clear ceiling, still a loss. {loser} you stubborn behenchod fourth-picked them. {amount}. {loser_net}. You found a way to make a safe pick expensive, you chutiya.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0030"}',3,13),
($B$Villa worked hard and lost. {loser} you thick madarchod expected more from a fourth pick. Watkins alone isn’t enough. {amount} lighter. {loser_net}. Own it, you gandu.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0030"}',3,14),
($B${score} and the mid-table story hit its limit. {loser} you madarchod fourth-round picked ordinary. {amount}. {loser_net}. Even low risk exposes retards, you behenchod.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0030"}',3,13),
($B$Well-drilled and not good enough. {loser} you stubborn chutiya still lost money with Villa. Watkins carries the line. {amount} gone. {loser_net}. Own the ceiling, you gandu.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0030"}',3,14),
($B$Villa’s honest effort wasn’t enough. {loser} you thick madarchod fourth-picked them and paid. {amount}. {loser_net}. Low picks still need a brain, you behenchod.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0030"}',3,13),
($B${score}. Solid side, clear limit, real bill. {loser} you madarchod made a fourth pick expensive. {amount} lighter. {loser_net}. Own the ordinary L, you gandu.$B$,'LOSER','CLUB','aston-villa',NULL,'{"lib":"0030"}',3,14),

-- REAL MADRID (11)
($B${score} and Madrid collected as usual. {loser} you thick madarchod first-picked the most obvious club and still lost money. Mbappé finishes, you pay. {amount} gone. {loser_net}. Tourist ownership at its purest, you gandu.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0030"}',3,15),
($B$Madrid scheduled the result and still took your money. {loser} you madarchod first-round picked the default option and fucked it up. Mbappé inevitable, you {loser_net}. Own the passive L, you behenchod.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0030"}',3,14),
($B${margin} goals and Madrid barely broke sweat. {loser} you stubborn chutiya first-picked inevitability and still paid. {amount}. {loser_net}. Overthinking the easiest pick in the draft, you gandu.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0030"}',3,14),
($B$Real just collected another invoice. {loser} you thick madarchod first-picked the most compulsory club in La Liga and still lost. Mbappé does the work, you do the paying. {amount} lighter. {loser_net}. Classic tourist, you behenchod.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0030"}',3,15),
($B$Madrid turned up and took what was theirs. {loser} you madarchod somehow turned a first-round lock into a bill. {amount}. {loser_net}. Passive ownership of the most aggressive club, you gandu.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0030"}',3,13),
($B${score}. Default option still cost you. {loser} you stubborn behenchod first-picked Madrid and lost money. Mbappé finishes, you pay. {loser_net}. Own the tourist L, you chutiya.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0030"}',3,14),
($B$Inevitability arrived and still took your cash. {loser} you thick madarchod first-round picked the obvious and fucked it. {amount} gone. {loser_net}. Even the easiest pick exposes retards, you gandu.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0030"}',3,14),
($B$Madrid don’t do surprises. {loser} you madarchod still managed to lose with them. First pick wasted the only way possible. {amount}. {loser_net}. Own it, you behenchod.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0030"}',3,13),
($B${score} and the Galácticos collected. {loser} you stubborn chutiya first-picked default and paid. Mbappé inevitable. {amount} lighter. {loser_net}. Tourist behaviour, you gandu.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0030"}',3,14),
($B$Scheduled result, real invoice. {loser} you thick madarchod first-picked Madrid and still bled. {amount}. {loser_net}. Overthought the simplest job, you behenchod.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0030"}',3,15),
($B$Madrid took the points and the money. {loser} you madarchod first-round picked the lock and lost. {amount} gone. {loser_net}. Own the passive L, you gandu.$B$,'LOSER','CLUB','real-madrid',NULL,'{"lib":"0030"}',3,13),

-- BARCELONA (11)
($B${score} and Barça’s chaos cost you. {loser} you thick madarchod second-picked talent plus debt and still paid. Yamal shines, structure creaks. {amount} gone. {loser_net}. Romance is expensive, you gandu.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0030"}',3,15),
($B$Barcelona looked talented and fragile. {loser} you madarchod second-round picked the badge and ignored the books. Yamal cannot defend. {amount}. {loser_net}. Own the financial hangover, you behenchod.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0030"}',3,14),
($B${margin} goals and the project looked incomplete. {loser} you stubborn chutiya second-picked La Masia hope. {amount} lighter. {loser_net}. Badge doesn’t pay bills, you gandu.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0030"}',3,14),
($B$Talent plus chaos, bill attached. {loser} you thick madarchod second-picked Barça and paid. Yamal brilliant, rest held together with hope. {amount}. {loser_net}. Own the mess, you behenchod.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0030"}',3,15),
($B$Barça produced the moment and the collapse. {loser} you madarchod second-round picked romance. {amount} gone. {loser_net}. You bought the dream and got the invoice, you gandu.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0030"}',3,13),
($B${score}. Financial disaster with good kids. {loser} you stubborn behenchod second-picked them. Yamal carries hope, structure fails. {amount}. {loser_net}. Own the chaos, you chutiya.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0030"}',3,14),
($B$Yamal did the impossible, the rest made the possible look hard. {loser} you thick madarchod second-picked this. {amount} lighter. {loser_net}. Romance cost real money, you gandu.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0030"}',3,14),
($B$Barça’s eternal cycle claimed another victim. {loser} you madarchod second-round picked talent and turmoil. {amount}. {loser_net}. Own the incomplete project, you behenchod.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0030"}',3,13),
($B${score} and the badge sold you a lie. {loser} you stubborn chutiya second-picked Barça. {amount} gone. {loser_net}. La Masia can’t save bad ownership, you gandu.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0030"}',3,14),
($B$Fragile and talented, still a loss. {loser} you thick madarchod paid for the chaos. Yamal shines, rest creak. {amount}. {loser_net}. Own the hangover, you behenchod.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0030"}',3,15),
($B$Barça looked special and soft. {loser} you madarchod second-picked the mess. {amount} lighter. {loser_net}. Badge doesn’t organise defence, you gandu.$B$,'LOSER','CLUB','barcelona',NULL,'{"lib":"0030"}',3,13),

-- ATLETICO (11)
($B${score} and Simeone’s block wasn’t enough. {loser} you thick madarchod third-picked organised suffering and still lost. Álvarez isolated, grind failed. {amount} gone. {loser_net}. Grit isn’t quality, you gandu.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0030"}',3,14),
($B$Atleti parked the bus and still paid. {loser} you madarchod third-round picked the block. Álvarez worked, rest limited. {amount}. {loser_net}. Own the anti-football L, you behenchod.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0030"}',3,13),
($B${margin}-nil and the grind hit its ceiling. {loser} you stubborn chutiya third-picked Simeone’s method. {amount} lighter. {loser_net}. Intensity has limits, you gandu.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0030"}',3,14),
($B$Organised suffering, real bill. {loser} you thick madarchod third-picked Atleti and paid. Álvarez alone isn’t enough. {amount}. {loser_net}. Own the limited side, you behenchod.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0030"}',3,13),
($B${score}. Simeone’s war was lost. {loser} you madarchod third-round picked grit over quality. {amount} gone. {loser_net}. Block doesn’t always hold, you gandu.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0030"}',3,14),
($B$Atleti made it ugly and still lost. {loser} you stubborn behenchod third-picked the method. {amount}. {loser_net}. Grit failed, you chutiya.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0030"}',3,13),
($B$Hard, organised, short. {loser} you thick madarchod third-picked pure Simeone and paid. Álvarez worked, ceiling hit. {amount} lighter. {loser_net}. Own it, you gandu.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0030"}',3,14),
($B${score} and the block broke. {loser} you madarchod third-round picked attrition. {amount}. {loser_net}. Intensity isn’t enough, you behenchod.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0030"}',3,13),
($B$Simeone’s side did the Simeone things and lost. {loser} you stubborn chutiya still paid. {amount} gone. {loser_net}. Own the grind L, you gandu.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0030"}',3,14),
($B$Organised limitation cost you. {loser} you thick madarchod third-picked Atleti. Álvarez isolated. {amount}. {loser_net}. Grit has a ceiling, you behenchod.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0030"}',3,15),
($B${score}. War lost, money lost. {loser} you madarchod third-round picked suffering. {amount} lighter. {loser_net}. Own the anti-football bill, you gandu.$B$,'LOSER','CLUB','atletico',NULL,'{"lib":"0030"}',3,13),

-- REAL BETIS (11)
($B${score} and the nice side got exposed. {loser} you thick madarchod fourth-picked pleasant mid-table and still lost. Isco created, finishing failed. {amount} gone. {loser_net}. Even nice picks hurt, you gandu.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0030"}',3,14),
($B$Betis did the tidy things and lost. {loser} you madarchod fourth-round picked limited quality. Isco spark, rest ordinary. {amount}. {loser_net}. Own the friendly L, you behenchod.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0030"}',3,13),
($B${margin}-nil and the likeable side folded. {loser} you stubborn chutiya fourth-picked Betis. {amount} lighter. {loser_net}. Low picks aren’t safe when ownership is shit, you gandu.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0030"}',3,14),
($B$Pleasant football, real bill. {loser} you thick madarchod fourth-picked them and paid. Isco alone isn’t enough. {amount}. {loser_net}. Own the ordinary L, you behenchod.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0030"}',3,13),
($B${score}. Nice side, clear limit. {loser} you madarchod took them late and still paid. Pellegrini maximises, ceiling visible. {amount} gone. {loser_net}. Own it, you gandu.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0030"}',3,14),
($B$Betis worked hard and came up short. {loser} you stubborn behenchod fourth-picked limited. {amount}. {loser_net}. Even scraps expose chutiyas, you madarchod.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0030"}',3,13),
($B$Likeable and limited. {loser} you thick chutiya fourth-picked Betis and lost money. Isco creates, rest fail. {amount} lighter. {loser_net}. Own the friendly failure, you gandu.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0030"}',3,14),
($B${score} and the ceiling hit. {loser} you madarchod fourth-round picked ordinary. {amount}. {loser_net}. Low risk still hurt, you behenchod.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0030"}',3,13),
($B$Tidy, toothless, expensive. {loser} you stubborn gandu fourth-picked them. {amount} gone. {loser_net}. Own the nice L, you chutiya.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0030"}',3,14),
($B$Betis’s limit was clear. {loser} you thick madarchod still paid. Isco deserves better. {amount}. {loser_net}. Own the ordinary bill, you behenchod.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0030"}',3,13),
($B${score}. Pleasant side, real cost. {loser} you madarchod made a fourth pick expensive. {amount} lighter. {loser_net}. Own it, you gandu.$B$,'LOSER','CLUB','real-betis',NULL,'{"lib":"0030"}',3,14),

-- BAYERN (11)
($B${score} and the machine collected. {loser} you thick madarchod first-picked the most compulsory club in Germany and still lost money. Kane finishes, you pay. {amount} gone. {loser_net}. Even the safest pick exposes retards, you gandu.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0030"}',3,15),
($B$Bayern did the Bayern things. {loser} you madarchod first-round picked the default champions and fucked it up. Kane inevitable, you {loser_net}. Own the passive L, you behenchod.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0030"}',3,14),
($B${margin} goals and the machine barely broke stride. {loser} you stubborn chutiya first-picked hierarchy and still paid. {amount}. {loser_net}. Overthought the easiest German pick, you gandu.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0030"}',3,14),
($B$Bavarian machine took the points and the money. {loser} you thick madarchod first-picked the lock and still bled. Kane does the damage. {amount} lighter. {loser_net}. Classic, you behenchod.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0030"}',3,15),
($B$Bayern turned up and took what was theirs. {loser} you madarchod somehow turned a first-round lock into a bill. {amount}. {loser_net}. Passive ownership of the machine, you gandu.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0030"}',3,13),
($B${score}. Default German option still cost you. {loser} you stubborn behenchod first-picked Bayern and lost. Kane finishes. {loser_net}. Own the tourist L, you chutiya.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0030"}',3,14),
($B$Hierarchy asserted itself and still took your cash. {loser} you thick madarchod first-round picked the obvious and fucked it. {amount} gone. {loser_net}. Even compulsory picks expose mongs, you gandu.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0030"}',3,14),
($B$Bayern don’t do surprises. {loser} you madarchod still managed to lose with them. First pick wasted. {amount}. {loser_net}. Own it, you behenchod.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0030"}',3,13),
($B${score} and the machine collected as usual. {loser} you stubborn chutiya first-picked default and paid. Kane inevitable. {amount} lighter. {loser_net}. Tourist behaviour, you gandu.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0030"}',3,14),
($B$Scheduled dominance, real invoice. {loser} you thick madarchod first-picked Bayern and still bled. {amount}. {loser_net}. Overthought the simplest job, you behenchod.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0030"}',3,15),
($B$Bayern took the points and the money. {loser} you madarchod first-round picked the lock and lost. {amount} gone. {loser_net}. Own the passive L, you gandu.$B$,'LOSER','CLUB','bayern',NULL,'{"lib":"0030"}',3,13),

-- LEVERKUSEN (11)
($B${score} and the peak is over. {loser} you thick madarchod second-picked Leverkusen’s highlight reel and paid for the regression. Wirtz creates, rest fluctuate. {amount} gone. {loser_net}. Own the comedown, you gandu.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0030"}',3,14),
($B$Werkself looked ordinary. {loser} you madarchod second-round picked the afterglow and lost. Wirtz special, collective not. {amount}. {loser_net}. Own the regression, you behenchod.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0030"}',3,13),
($B${margin}-nil and the invincible season is finished. {loser} you stubborn chutiya second-picked the high and got the correction. {amount} lighter. {loser_net}. Peak over, you gandu.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0030"}',3,14),
($B$Talented and inconsistent. {loser} you thick madarchod second-picked Leverkusen and paid. Wirtz needs better support. {amount}. {loser_net}. Own the variance, you behenchod.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0030"}',3,13),
($B${score}. Moment has passed. {loser} you madarchod second-round picked the story and got reality. Wirtz carries creativity. {amount} gone. {loser_net}. Own the afterglow bill, you gandu.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0030"}',3,14),
($B$Leverkusen produced moments and lost. {loser} you stubborn behenchod second-picked the upside. {amount}. {loser_net}. Regression hurts, you chutiya.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0030"}',3,13),
($B$Highlight reel over. {loser} you thick madarchod second-picked the peak and paid. Wirtz alone isn’t enough. {amount} lighter. {loser_net}. Own the comedown, you gandu.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0030"}',3,14),
($B${score} and the consistency question was answered. {loser} you madarchod second-round picked them. {amount}. {loser_net}. Own the ordinary night, you behenchod.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0030"}',3,13),
($B$Talented side, incomplete project. {loser} you stubborn chutiya second-picked Leverkusen and lost. {amount} gone. {loser_net}. Own the variance, you gandu.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0030"}',3,14),
($B$Peak prices for post-peak football. {loser} you thick madarchod paid the residual. Wirtz creates, rest fail. {amount}. {loser_net}. Own the regression, you behenchod.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0030"}',3,15),
($B${score}. Afterglow bill arrived. {loser} you madarchod second-picked the high and got the correction. {amount} lighter. {loser_net}. Own it, you gandu.$B$,'LOSER','CLUB','leverkusen',NULL,'{"lib":"0030"}',3,13),

-- DORTMUND (11)
($B${score} and the almost club did the almost thing. {loser} you thick madarchod third-picked near misses and paid. Guirassy scores, big moments slip. {amount} gone. {loser_net}. Own the heartbreak, you gandu.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0030"}',3,14),
($B$Yellow Wall made noise, result missing. {loser} you madarchod third-round picked the bridesmaid. Guirassy works, defence leaks. {amount}. {loser_net}. Own the almost L, you behenchod.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0030"}',3,13),
($B${margin}-nil and Dortmund’s soft centre showed. {loser} you stubborn chutiya third-picked excitement and unreliability. {amount} lighter. {loser_net}. Almost again, you gandu.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0030"}',3,14),
($B$Hope and disappointment cycle continues. {loser} you thick madarchod third-picked the almost club. Guirassy alone isn’t enough. {amount}. {loser_net}. Own the heartbreak bill, you behenchod.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0030"}',3,13),
($B${score}. Lively and lost. {loser} you madarchod third-round picked near misses. Guirassy cannot defend. {amount} gone. {loser_net}. Own the almost, you gandu.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0030"}',3,14),
($B$Dortmund produced moments and conceded the game. {loser} you stubborn behenchod third-picked them. {amount}. {loser_net}. Classic almost-club ownership, you chutiya.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0030"}',3,13),
($B$Exciting, unreliable, expensive. {loser} you thick madarchod third-picked the Yellow Wall. Guirassy works, decisive moments missing. {amount} lighter. {loser_net}. Own the heartbreak, you gandu.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0030"}',3,14),
($B${score} and the bridesmaid finished second again. {loser} you madarchod third-round picked almost. {amount}. {loser_net}. Own the near miss, you behenchod.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0030"}',3,13),
($B$Noise made, points lost. {loser} you stubborn chutiya third-picked Dortmund. {amount} gone. {loser_net}. Almost club did the almost thing, you gandu.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0030"}',3,14),
($B$Guirassy scored, big moments slipped. {loser} you thick madarchod third-picked the cycle. {amount}. {loser_net}. Own the disappointment, you behenchod.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0030"}',3,15),
($B${score}. Almost again. {loser} you madarchod third-round picked near misses and paid. {amount} lighter. {loser_net}. Own the heartbreak L, you gandu.$B$,'LOSER','CLUB','dortmund',NULL,'{"lib":"0030"}',3,13),

-- RB LEIPZIG (11)
($B${score} and the franchise looked empty. {loser} you thick madarchod fourth-picked Red Bull and still lost. Openda works, soul missing. {amount} gone. {loser_net}. Own the artificial L, you gandu.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0030"}',3,14),
($B$Corporate side hit its ceiling. {loser} you madarchod fourth-round picked the energy drink project. Openda alone isn’t enough. {amount}. {loser_net}. Own the model failure, you behenchod.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0030"}',3,13),
($B${margin}-nil and the system failed. {loser} you stubborn chutiya fourth-picked efficient and empty. {amount} lighter. {loser_net}. Artificial club, real bill, you gandu.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0030"}',3,14),
($B$No history, still cost you. {loser} you thick madarchod fourth-picked the franchise. Openda works, collective ordinary. {amount}. {loser_net}. Own the corporate L, you behenchod.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0030"}',3,13),
($B${score}. System side, clear limit. {loser} you madarchod took them late and paid. Demichelis organises, ceiling visible. {amount} gone. {loser_net}. Own the model bill, you gandu.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0030"}',3,14),
($B$Efficient and empty. {loser} you stubborn behenchod fourth-picked Leipzig. {amount}. {loser_net}. Even artificial picks expose chutiyas, you madarchod.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0030"}',3,13),
($B$Red Bull model has limits. {loser} you thick chutiya fourth-picked them and lost money. Openda needs better supply. {amount} lighter. {loser_net}. Own the franchise failure, you gandu.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0030"}',3,14),
($B${score} and the project looked ordinary. {loser} you madarchod fourth-round picked structure without soul. {amount}. {loser_net}. Own the corporate L, you behenchod.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0030"}',3,13),
($B$System failed when it mattered. {loser} you stubborn gandu fourth-picked Leipzig. {amount} gone. {loser_net}. Artificial football still needs a result, you chutiya.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0030"}',3,14),
($B$Openda worked, rest ordinary. {loser} you thick madarchod fourth-picked the model and paid. {amount}. {loser_net}. Own the empty L, you behenchod.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0030"}',3,13),
($B${score}. Franchise ceiling hit. {loser} you madarchod made a fourth pick expensive. {amount} lighter. {loser_net}. Own the artificial bill, you gandu.$B$,'LOSER','CLUB','rb-leipzig',NULL,'{"lib":"0030"}',3,14),

-- INTER (11)
($B${score} and the Italian machine collected. {loser} you thick madarchod first-picked the form side in Serie A and still lost money. Lautaro finishes, you pay. {amount} gone. {loser_net}. Even the strongest Italian pick exposes retards, you gandu.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0030"}',3,15),
($B$Inter did the professional things. {loser} you madarchod first-round picked the current standard and fucked it up. Lautaro inevitable, you {loser_net}. Own the passive L, you behenchod.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0030"}',3,14),
($B${margin} goals and Inter barely looked troubled. {loser} you stubborn chutiya first-picked hierarchy and still paid. {amount}. {loser_net}. Overthought the strongest Italian option, you gandu.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0030"}',3,14),
($B$Nerazzurri took the points and the money. {loser} you thick madarchod first-picked the lock and still bled. Lautaro does the damage. {amount} lighter. {loser_net}. Classic, you behenchod.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0030"}',3,15),
($B$Inter turned up and took what was theirs. {loser} you madarchod somehow turned a first-round lock into a bill. {amount}. {loser_net}. Passive ownership of the form side, you gandu.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0030"}',3,13),
($B${score}. Default Italian option still cost you. {loser} you stubborn behenchod first-picked Inter and lost. Lautaro finishes. {loser_net}. Own the tourist L, you chutiya.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0030"}',3,14),
($B$Form side asserted itself and still took your cash. {loser} you thick madarchod first-round picked the obvious and fucked it. {amount} gone. {loser_net}. Even compulsory picks expose mongs, you gandu.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0030"}',3,14),
($B$Inter don’t do surprises. {loser} you madarchod still managed to lose with them. First pick wasted. {amount}. {loser_net}. Own it, you behenchod.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0030"}',3,13),
($B${score} and the machine collected as usual. {loser} you stubborn chutiya first-picked default and paid. Lautaro inevitable. {amount} lighter. {loser_net}. Tourist behaviour, you gandu.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0030"}',3,14),
($B$Professional result, real invoice. {loser} you thick madarchod first-picked Inter and still bled. {amount}. {loser_net}. Overthought the simplest job, you behenchod.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0030"}',3,15),
($B$Inter took the points and the money. {loser} you madarchod first-round picked the lock and lost. {amount} gone. {loser_net}. Own the passive L, you gandu.$B$,'LOSER','CLUB','inter',NULL,'{"lib":"0030"}',3,13),

-- NAPOLI (11)
($B${score} and the Scudetto fumes faded. {loser} you thick madarchod second-picked the hangover and paid. McTominay works, magic missing. {amount} gone. {loser_net}. Own the comedown, you gandu.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0030"}',3,14),
($B$Napoli looked organised and ordinary. {loser} you madarchod second-round picked glory prices for post-peak football. McTominay steel, spark gone. {amount}. {loser_net}. Own the regression, you behenchod.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0030"}',3,13),
($B${margin}-nil and the peak is over. {loser} you stubborn chutiya second-picked the title hangover. {amount} lighter. {loser_net}. Glory faded, you gandu.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0030"}',3,14),
($B$Solid and no longer special. {loser} you thick madarchod second-picked Napoli after the high. McTominay useful, collective ordinary. {amount}. {loser_net}. Own the comedown bill, you behenchod.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0030"}',3,13),
($B${score}. Scudetto side became ordinary. {loser} you madarchod second-round picked the story and got reality. {amount} gone. {loser_net}. Own the afterglow, you gandu.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0030"}',3,14),
($B$Napoli produced effort and limited edge. {loser} you stubborn behenchod second-picked peak prices. {amount}. {loser_net}. Regression hurts, you chutiya.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0030"}',3,13),
($B$Magic faded, bill arrived. {loser} you thick madarchod second-picked the hangover. McTominay works, spark missing. {amount} lighter. {loser_net}. Own the comedown, you gandu.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0030"}',3,14),
($B${score} and the intensity never returned. {loser} you madarchod second-round picked them. {amount}. {loser_net}. Own the ordinary night, you behenchod.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0030"}',3,13),
($B$Post-peak football, peak prices. {loser} you stubborn chutiya second-picked Napoli and lost. {amount} gone. {loser_net}. Own the regression, you gandu.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0030"}',3,14),
($B$McTominay fought, rest ordinary. {loser} you thick madarchod paid glory prices. {amount}. {loser_net}. Own the faded L, you behenchod.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0030"}',3,15),
($B${score}. Hangover bill collected. {loser} you madarchod second-picked the high and got the correction. {amount} lighter. {loser_net}. Own it, you gandu.$B$,'LOSER','CLUB','napoli',NULL,'{"lib":"0030"}',3,13),

-- ROMA (11)
($B${score} and Roma did the Roma thing. {loser} you thick madarchod third-picked chaos and paid. Dybala creates, defence leaks. {amount} gone. {loser_net}. Own the drama L, you gandu.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0030"}',3,14),
($B$Giallorossi looked dangerous and open. {loser} you madarchod third-round picked pure Roma. Dybala magic, structure missing. {amount}. {loser_net}. Own the chaos, you behenchod.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0030"}',3,13),
($B${margin}-nil and the soft underbelly showed. {loser} you stubborn chutiya third-picked intensity and unreliability. {amount} lighter. {loser_net}. Classic Roma, you gandu.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0030"}',3,14),
($B$Moments produced, decisive ones conceded. {loser} you thick madarchod third-picked the drama club. Dybala alone isn’t enough. {amount}. {loser_net}. Own the self-sabotage, you behenchod.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0030"}',3,13),
($B${score}. Lively and lost. {loser} you madarchod third-round picked chaos. Dybala cannot defend. {amount} gone. {loser_net}. Own the Roma L, you gandu.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0030"}',3,14),
($B$Roma produced noise and the bill. {loser} you stubborn behenchod third-picked them. {amount}. {loser_net}. Chaos has a cost, you chutiya.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0030"}',3,13),
($B$Exciting, unreliable, expensive. {loser} you thick madarchod third-picked pure Roma. Dybala works, defence doesn’t. {amount} lighter. {loser_net}. Own the drama, you gandu.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0030"}',3,14),
($B${score} and the cycle continued. {loser} you madarchod third-round picked hope and self-sabotage. {amount}. {loser_net}. Own the chaos bill, you behenchod.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0030"}',3,13),
($B$Noise made, points lost. {loser} you stubborn chutiya third-picked Roma. {amount} gone. {loser_net}. Classic Giallorossi ownership, you gandu.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0030"}',3,14),
($B$Dybala created, rest leaked. {loser} you thick madarchod third-picked the drama. {amount}. {loser_net}. Own the self-sabotage L, you behenchod.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0030"}',3,15),
($B${score}. Chaos again. {loser} you madarchod third-round picked pure Roma and paid. {amount} lighter. {loser_net}. Own the drama L, you gandu.$B$,'LOSER','CLUB','roma',NULL,'{"lib":"0030"}',3,13),

-- JUVENTUS (11)
($B${score} and the fallen giant stayed fallen. {loser} you thick madarchod fourth-picked nostalgia and paid. Yıldız shows promise, aura doesn’t score. {amount} gone. {loser_net}. Own the decline, you gandu.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0030"}',3,14),
($B$Old Lady looked old. {loser} you madarchod fourth-round picked residual aura. Yıldız works, present ordinary. {amount}. {loser_net}. Own the faded L, you behenchod.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0030"}',3,13),
($B${margin}-nil and the transition tax arrived. {loser} you stubborn chutiya fourth-picked the name. {amount} lighter. {loser_net}. Aura doesn’t win games, you gandu.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0030"}',3,14),
($B$Reputation versus reality. {loser} you thick madarchod fourth-picked Juventus and paid the gap. Yıldız alone isn’t enough. {amount}. {loser_net}. Own the decline bill, you behenchod.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0030"}',3,13),
($B${score}. Mid-table in everything except the badge. {loser} you madarchod fourth-round picked nostalgia. {amount} gone. {loser_net}. Own the faded giant, you gandu.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0030"}',3,14),
($B$Juventus produced moments and lost the game. {loser} you stubborn behenchod fourth-picked the name. {amount}. {loser_net}. Aura has limits, you chutiya.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0030"}',3,13),
($B$Fallen giant, real bill. {loser} you thick madarchod fourth-picked residual glory. Yıldız shows the future, present ordinary. {amount} lighter. {loser_net}. Own the decline, you gandu.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0030"}',3,14),
($B${score} and the project looked incomplete. {loser} you madarchod fourth-round picked the Old Lady. {amount}. {loser_net}. Own the nostalgia L, you behenchod.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0030"}',3,13),
($B$Name sold, football didn’t. {loser} you stubborn chutiya fourth-picked Juventus. {amount} gone. {loser_net}. Aura doesn’t organise, you gandu.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0030"}',3,14),
($B$Yıldız showed promise, rest ordinary. {loser} you thick madarchod paid for the name. {amount}. {loser_net}. Own the faded L, you behenchod.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0030"}',3,15),
($B${score}. Decline continues. {loser} you madarchod fourth-round picked nostalgia and paid. {amount} lighter. {loser_net}. Own the fallen giant bill, you gandu.$B$,'LOSER','CLUB','juventus',NULL,'{"lib":"0030"}',3,13)
ON CONFLICT (body, club_id) WHERE club_id IS NOT NULL DO UPDATE SET retired = false, severity = EXCLUDED.severity, weight = EXCLUDED.weight, conditions = EXCLUDED.conditions;

INSERT INTO roast_templates (body, target, scope, club_id, derby_id, conditions, severity, weight) VALUES

-- el-clasico (4)
($B$El Clásico and one of you just paid {amount}. {loser} you thick madarchod owned one half of the biggest game in Spain and still lost. History doesn’t care about your draft. {loser_net}. Own the Clásico L, you gandu.$B$,'LOSER','DERBY',NULL,'el-clasico','{"lib":"0030","is_derby":true}',3,15),
($B${score} in El Clásico and the history books added another invoice. {loser} you madarchod treated the biggest Spanish night like a normal game. {amount} gone. {loser_net}. Own the ancient L, you behenchod.$B$,'LOSER','DERBY',NULL,'el-clasico','{"lib":"0030","is_derby":true}',3,14),
($B$Madrid vs Barça and somebody had to pay. It was you, {loser} you stubborn chutiya. {amount} lighter. Big-game ownership still requires a result. {loser_net}. Own the Clásico, you gandu.$B$,'LOSER','DERBY',NULL,'el-clasico','{"lib":"0030","is_derby":true}',3,14),
($B$El Clásico delivered the usual spite and an invoice. {loser} you thick madarchod funded the other half of Spanish history. {amount}. {loser_net}. Own the big-night L, you behenchod.$B$,'LOSER','DERBY',NULL,'el-clasico','{"lib":"0030","is_derby":true}',3,13),

-- madrid-derby (4)
($B$Madrid Derby and one side of the capital just paid. {loser} you thick madarchod owned half the city and still lost. {amount} gone. {loser_net}. Own the capital L, you gandu.$B$,'LOSER','DERBY',NULL,'madrid-derby','{"lib":"0030","is_derby":true}',3,15),
($B${score} in the Madrid Derby. {loser} you madarchod funded the other half of the city. Simeone or Mbappé — somebody still lost. {amount}. {loser_net}. Own the local hate, you behenchod.$B$,'LOSER','DERBY',NULL,'madrid-derby','{"lib":"0030","is_derby":true}',3,14),
($B$Capital hatred moved real money. {loser} you stubborn chutiya paid {amount} in the Madrid Derby. {loser_net}. Own the city L, you gandu.$B$,'LOSER','DERBY',NULL,'madrid-derby','{"lib":"0030","is_derby":true}',3,14),
($B$Madrid Derby doesn’t do mercy. {loser} you thick madarchod just found out. {amount} lighter. {loser_net}. Own the capital bill, you behenchod.$B$,'LOSER','DERBY',NULL,'madrid-derby','{"lib":"0030","is_derby":true}',3,13),

-- manchester-derby (4)
($B$Manchester Derby and one half of the city just paid. {loser} you thick madarchod funded the other shade. Bruno or Haaland — somebody still lost. {amount} gone. {loser_net}. Own the local L, you gandu.$B$,'LOSER','DERBY',NULL,'manchester-derby','{"lib":"0030","is_derby":true}',3,15),
($B${score} in the Manchester Derby. {loser} you madarchod just paid the other half of the city. {amount}. {loser_net}. Own the blue-red hate, you behenchod.$B$,'LOSER','DERBY',NULL,'manchester-derby','{"lib":"0030","is_derby":true}',3,14),
($B$Local hatred moved {amount}. {loser} you stubborn chutiya owned the wrong half of Manchester. {loser_net}. Own the derby L, you gandu.$B$,'LOSER','DERBY',NULL,'manchester-derby','{"lib":"0030","is_derby":true}',3,14),
($B$Manchester is split and you paid. {loser} you thick madarchod just funded the other side. {amount} lighter. {loser_net}. Own the local bill, you behenchod.$B$,'LOSER','DERBY',NULL,'manchester-derby','{"lib":"0030","is_derby":true}',3,13),

-- klassiker (4)
($B$Der Klassiker and the hierarchy stayed intact. {loser} you thick madarchod owned the almost side and paid. Kane or Guirassy — the script held. {amount} gone. {loser_net}. Own the German order, you gandu.$B$,'LOSER','DERBY',NULL,'klassiker','{"lib":"0030","is_derby":true}',3,15),
($B${score} in Der Klassiker. {loser} you madarchod just paid the machine. Almost club did the almost thing. {amount}. {loser_net}. Own the hierarchy L, you behenchod.$B$,'LOSER','DERBY',NULL,'klassiker','{"lib":"0030","is_derby":true}',3,14),
($B$Bayern vs Dortmund delivered the usual result and an invoice. {loser} you stubborn chutiya paid {amount}. {loser_net}. Own the Klassiker, you gandu.$B$,'LOSER','DERBY',NULL,'klassiker','{"lib":"0030","is_derby":true}',3,14),
($B$Machine vs almost-men. {loser} you thick madarchod were the almost-men. {amount} lighter. {loser_net}. Own the German bill, you behenchod.$B$,'LOSER','DERBY',NULL,'klassiker','{"lib":"0030","is_derby":true}',3,13),

-- derby-d-italia (4)
($B$Derby d’Italia and old Italian hate moved money. {loser} you thick madarchod funded the other half of the grudge. {amount} gone. {loser_net}. Own the Italian L, you gandu.$B$,'LOSER','DERBY',NULL,'derby-d-italia','{"lib":"0030","is_derby":true}',3,15),
($B${score} in the Derby d’Italia. {loser} you madarchod just paid a century of resentment. {amount}. {loser_net}. Own the old war, you behenchod.$B$,'LOSER','DERBY',NULL,'derby-d-italia','{"lib":"0030","is_derby":true}',3,14),
($B$Inter vs Juve delivered spite and an invoice. {loser} you stubborn chutiya paid {amount}. {loser_net}. Own the Derby d’Italia, you gandu.$B$,'LOSER','DERBY',NULL,'derby-d-italia','{"lib":"0030","is_derby":true}',3,14),
($B$Century-old hatred, real bill. {loser} you thick madarchod just funded the other side. {amount} lighter. {loser_net}. Own the Italian grudge, you behenchod.$B$,'LOSER','DERBY',NULL,'derby-d-italia','{"lib":"0030","is_derby":true}',3,13),

-- derby-del-sole (4)
($B$Derby del Sole and southern pride cost real money. {loser} you thick madarchod paid {amount} on the biggest southern night. {loser_net}. Own the southern L, you gandu.$B$,'LOSER','DERBY',NULL,'derby-del-sole','{"lib":"0030","is_derby":true}',3,15),
($B${score} in the Derby del Sole. {loser} you madarchod just got burned by southern fire. {amount}. {loser_net}. Own the pride bill, you behenchod.$B$,'LOSER','DERBY',NULL,'derby-del-sole','{"lib":"0030","is_derby":true}',3,14),
($B$Southern hate moved {amount}. {loser} you stubborn chutiya owned the wrong half of the south. {loser_net}. Own the Derby del Sole, you gandu.$B$,'LOSER','DERBY',NULL,'derby-del-sole','{"lib":"0030","is_derby":true}',3,14),
($B$Napoli vs Roma and somebody paid. It was you, {loser} you thick madarchod. {amount} lighter. {loser_net}. Own the southern bill, you behenchod.$B$,'LOSER','DERBY',NULL,'derby-del-sole','{"lib":"0030","is_derby":true}',3,13),

-- bavaria-rhine (4)
($B$Bavaria vs Rhine and the hierarchy held. {loser} you thick madarchod paid the machine. {amount} gone. {loser_net}. Know your place, you gandu.$B$,'LOSER','DERBY',NULL,'bavaria-rhine','{"lib":"0030","is_derby":true}',3,15),
($B${score} in Bayern vs Leverkusen. {loser} you madarchod just funded the big club. {amount}. {loser_net}. Own the German order, you behenchod.$B$,'LOSER','DERBY',NULL,'bavaria-rhine','{"lib":"0030","is_derby":true}',3,14),
($B$Machine reminded the upstarts. {loser} you stubborn chutiya paid {amount}. {loser_net}. Own the hierarchy L, you gandu.$B$,'LOSER','DERBY',NULL,'bavaria-rhine','{"lib":"0030","is_derby":true}',3,14),
($B$Bavarian order asserted itself. {loser} you thick madarchod were on the wrong side. {amount} lighter. {loser_net}. Own the Rhine bill, you behenchod.$B$,'LOSER','DERBY',NULL,'bavaria-rhine','{"lib":"0030","is_derby":true}',3,13),

-- north-south (4)
($B$North vs South and the peninsula moved money. {loser} you thick madarchod paid the other end of Italy. {amount} gone. {loser_net}. Own the regional L, you gandu.$B$,'LOSER','DERBY',NULL,'north-south','{"lib":"0030","is_derby":true}',3,15),
($B${score} in the North-South grudge. {loser} you madarchod just funded the other half of the country. {amount}. {loser_net}. Own the geography, you behenchod.$B$,'LOSER','DERBY',NULL,'north-south','{"lib":"0030","is_derby":true}',3,14),
($B$Italian regional hate cost {amount}. {loser} you stubborn chutiya owned the wrong end. {loser_net}. Own the North-South L, you gandu.$B$,'LOSER','DERBY',NULL,'north-south','{"lib":"0030","is_derby":true}',3,14),
($B$Peninsula divided, money moved. {loser} you thick madarchod paid. {amount} lighter. {loser_net}. Own the regional bill, you behenchod.$B$,'LOSER','DERBY',NULL,'north-south','{"lib":"0030","is_derby":true}',3,13),

-- arsenal-utd (4)
($B$Arsenal vs United grudge and somebody paid. {loser} you thick madarchod funded the other half of the old hate. {amount} gone. {loser_net}. Own the historic L, you gandu.$B$,'LOSER','DERBY',NULL,'arsenal-utd','{"lib":"0030","is_derby":true}',3,15),
($B${score} in the Arsenal-United pain. {loser} you madarchod just paid decades of mutual dislike. {amount}. {loser_net}. Own the grudge, you behenchod.$B$,'LOSER','DERBY',NULL,'arsenal-utd','{"lib":"0030","is_derby":true}',3,14),
($B$Process vs nostalgia and money moved. {loser} you stubborn chutiya paid {amount}. {loser_net}. Own the old English hate, you gandu.$B$,'LOSER','DERBY',NULL,'arsenal-utd','{"lib":"0030","is_derby":true}',3,14),
($B$Long grudge, real bill. {loser} you thick madarchod funded the other side. {amount} lighter. {loser_net}. Own the Arsenal-United L, you behenchod.$B$,'LOSER','DERBY',NULL,'arsenal-utd','{"lib":"0030","is_derby":true}',3,13),

-- madrid-bayern (4)
($B$Madrid vs Bayern and European royalty threw hands. {loser} you thick madarchod paid {amount} on a heavyweight night. {loser_net}. Own the continental L, you gandu.$B$,'LOSER','DERBY',NULL,'madrid-bayern','{"lib":"0030","is_derby":true}',3,15),
($B${score} in Madrid-Bayern. {loser} you madarchod just funded the other superpower. {amount}. {loser_net}. Own the big-game bill, you behenchod.$B$,'LOSER','DERBY',NULL,'madrid-bayern','{"lib":"0030","is_derby":true}',3,14),
($B$Two giants, one invoice. {loser} you stubborn chutiya paid {amount}. {loser_net}. Own the European grudge, you gandu.$B$,'LOSER','DERBY',NULL,'madrid-bayern','{"lib":"0030","is_derby":true}',3,14),
($B$Heavyweight night, real cost. {loser} you thick madarchod were on the wrong side. {amount} lighter. {loser_net}. Own the Madrid-Bayern L, you behenchod.$B$,'LOSER','DERBY',NULL,'madrid-bayern','{"lib":"0030","is_derby":true}',3,13),

-- barca-inter (4)
($B$Barça vs Inter and continental spite moved money. {loser} you thick madarchod paid {amount}. {loser_net}. Own the European L, you gandu.$B$,'LOSER','DERBY',NULL,'barca-inter','{"lib":"0030","is_derby":true}',3,15),
($B${score} in Barça-Inter. {loser} you madarchod just funded the other half of the grudge. {amount}. {loser_net}. Own the continental bill, you behenchod.$B$,'LOSER','DERBY',NULL,'barca-inter','{"lib":"0030","is_derby":true}',3,14),
($B$European baggage, real invoice. {loser} you stubborn chutiya paid {amount}. {loser_net}. Own the Barça-Inter L, you gandu.$B$,'LOSER','DERBY',NULL,'barca-inter','{"lib":"0030","is_derby":true}',3,14),
($B$Talent vs structure and money moved. {loser} you thick madarchod were on the wrong side. {amount} lighter. {loser_net}. Own the grudge, you behenchod.$B$,'LOSER','DERBY',NULL,'barca-inter','{"lib":"0030","is_derby":true}',3,13),

-- atleti-betis (4)
($B$Atleti vs Betis and the smaller Spanish grudge still hurt. {loser} you thick madarchod paid {amount}. {loser_net}. Even modest hate costs, you gandu.$B$,'LOSER','DERBY',NULL,'atleti-betis','{"lib":"0030","is_derby":true}',3,14),
($B${score} in Atleti-Betis. {loser} you madarchod just funded the other side of a quiet grudge. {amount}. {loser_net}. Own the modest L, you behenchod.$B$,'LOSER','DERBY',NULL,'atleti-betis','{"lib":"0030","is_derby":true}',3,13),
($B$Grit vs niceness and money moved. {loser} you stubborn chutiya paid {amount}. {loser_net}. Own the small Spanish bill, you gandu.$B$,'LOSER','DERBY',NULL,'atleti-betis','{"lib":"0030","is_derby":true}',3,13),
($B$Lower on the food chain, still expensive. {loser} you thick madarchod paid. {amount} lighter. {loser_net}. Own the Atleti-Betis L, you behenchod.$B$,'LOSER','DERBY',NULL,'atleti-betis','{"lib":"0030","is_derby":true}',3,12),

-- dortmund-leipzig (4)
($B$Dortmund vs Leipzig and ideology cost real money. {loser} you thick madarchod paid the other side of the modern German divide. {amount} gone. {loser_net}. Own the franchise vs tradition L, you gandu.$B$,'LOSER','DERBY',NULL,'dortmund-leipzig','{"lib":"0030","is_derby":true}',3,15),
($B${score} in Dortmund-Leipzig. {loser} you madarchod just funded the energy drink or the Yellow Wall. {amount}. {loser_net}. Own the modern grudge, you behenchod.$B$,'LOSER','DERBY',NULL,'dortmund-leipzig','{"lib":"0030","is_derby":true}',3,14),
($B$Traditional vs Red Bull and money moved. {loser} you stubborn chutiya paid {amount}. {loser_net}. Own the German fault line, you gandu.$B$,'LOSER','DERBY',NULL,'dortmund-leipzig','{"lib":"0030","is_derby":true}',3,14),
($B$Ideology, noise, invoice. {loser} you thick madarchod were on the wrong side. {amount} lighter. {loser_net}. Own the Dortmund-Leipzig L, you behenchod.$B$,'LOSER','DERBY',NULL,'dortmund-leipzig','{"lib":"0030","is_derby":true}',3,13),

-- arsenal-city (4)
($B$Arsenal vs City and the modern title grudge cost real money. {loser} you thick madarchod paid {amount}. Process vs oil. {loser_net}. Own the modern L, you gandu.$B$,'LOSER','DERBY',NULL,'arsenal-city','{"lib":"0030","is_derby":true}',3,15),
($B${score} in Arsenal-City. {loser} you madarchod just funded the other half of the recent hate. {amount}. {loser_net}. Own the title grudge, you behenchod.$B$,'LOSER','DERBY',NULL,'arsenal-city','{"lib":"0030","is_derby":true}',3,14),
($B$Process vs plastic and money moved. {loser} you stubborn chutiya paid {amount}. {loser_net}. Own the modern Premier League hate, you gandu.$B$,'LOSER','DERBY',NULL,'arsenal-city','{"lib":"0030","is_derby":true}',3,14),
($B$Recent history, real bill. {loser} you thick madarchod funded the other side. {amount} lighter. {loser_net}. Own the Arsenal-City L, you behenchod.$B$,'LOSER','DERBY',NULL,'arsenal-city','{"lib":"0030","is_derby":true}',3,13)
ON CONFLICT (body) WHERE club_id IS NULL DO UPDATE SET retired = false, severity = EXCLUDED.severity, weight = EXCLUDED.weight, conditions = EXCLUDED.conditions;

-- <<< END PASTED LIBRARY <<<


-- ── Guard, then retire ──────────────────────────────────────────────────────
-- Refuses to stand down a working library for a broken replacement. If the
-- paste above is missing, truncated, or tagged with the wrong lib, this
-- raises and the whole migration rolls back with the old library untouched.
DO $guard$
DECLARE
  total  int;
  clubs  int;
  draws  int;
  derbys int;
BEGIN
  SELECT count(*)                  INTO total  FROM roast_templates WHERE conditions->>'lib' = '0030';
  SELECT count(DISTINCT club_id)   INTO clubs  FROM roast_templates WHERE conditions->>'lib' = '0030' AND club_id IS NOT NULL;
  SELECT count(DISTINCT derby_id)  INTO derbys FROM roast_templates WHERE conditions->>'lib' = '0030' AND derby_id IS NOT NULL;
  SELECT count(*)                  INTO draws  FROM roast_templates WHERE conditions->>'lib' = '0030' AND conditions->>'draw' = 'true';

  IF total = 0 THEN
    RAISE EXCEPTION 'Nothing was pasted: no rows tagged lib=0030. Old library left live.';
  END IF;
  IF total < 60 THEN
    RAISE EXCEPTION 'Only % rows tagged lib=0030 — expected 100+. Paste looks truncated; old library left live.', total;
  END IF;
  IF clubs < 16 THEN
    RAISE EXCEPTION 'lib=0030 covers only % of the 16 clubs. A club with no lines never gets roasted; old library left live.', clubs;
  END IF;

  RAISE NOTICE 'lib=0030: % rows, % clubs, % derbies, % draw lines.', total, clubs, derbys, draws;

  -- 0020 is the draw-taunt library. A draw has no loser, so those lines use
  -- {home_owner}/{away_owner} and nothing else can stand in for them. Keep
  -- them live unless the new library brought its own.
  IF draws >= 4 THEN
    UPDATE roast_templates SET retired = true
    WHERE coalesce(conditions->>'lib', '') <> '0030' AND NOT retired;
  ELSE
    RAISE NOTICE 'lib=0030 has only % draw lines, so 0020 draw taunts stay live.', draws;
    UPDATE roast_templates SET retired = true
    WHERE coalesce(conditions->>'lib', '') NOT IN ('0030', '0020') AND NOT retired;
  END IF;
END
$guard$;


-- ── What is live now ────────────────────────────────────────────────────────
SELECT coalesce(conditions->>'lib', '(untagged)') AS lib,
       count(*)                                    AS lines,
       count(*) FILTER (WHERE NOT retired)         AS live,
       count(DISTINCT club_id)                     AS clubs,
       count(DISTINCT derby_id)                    AS derbies
FROM roast_templates
GROUP BY 1
ORDER BY live DESC, lib;


-- ── Rollback ────────────────────────────────────────────────────────────────
-- If v4 reads badly in the group, this puts v3 back instantly. Nothing was
-- deleted, so it is a single statement and loses nothing:
--
--   UPDATE roast_templates SET retired = (conditions->>'lib' = '0030')
--   WHERE coalesce(conditions->>'lib','') IN ('0020','0022','0030');
--
-- To drop only the new library and keep whatever else is live:
--
--   UPDATE roast_templates SET retired = true WHERE conditions->>'lib' = '0030';
