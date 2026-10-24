-- Migration 0020: lines for a draw.
--
-- The 0019 library has 144 lines and every one of them names a loser. A draw
-- has none, so condMatch() now only lets a draw pick lines marked
-- conditions.draw = true (and keeps those lines away from real results).
-- Without these rows a draw would post the score with no taunt at all, which
-- is still better than the old behaviour: calling the home owner the loser of
-- a game nobody lost.
--
-- SLOTS for draws: {home_owner} {away_owner} {home_club} {away_club} {score}
--                  {competition} {h2h}. {loser}/{winner}/{amount} mean nothing
--                  in a draw and are not used here.
--
-- margin_max 0 is belt and braces: code older than the draw gate ignores the
-- `draw` key, but it does honour margin_max, so these lines can never be
-- picked for a real result even by a stale deployment.
--
-- IDEMPOTENT: md5(body) is unique (0019), so re-running inserts nothing new.
-- 0019's retire step was widened to spare lib '0020' in the same change.

INSERT INTO roast_templates (body, target, scope, club_id, derby_id, conditions, severity, weight) VALUES
($B${score}. Ninety minutes of {home_owner} and {away_owner} shouting at a screen and not one rupee moves. Pathetic, both of you.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,13),
($B$A draw. {home_owner} and {away_owner} spent all week pretending they knew how this would go. Neither of them had a clue.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,13),
($B${home_club} {score} {away_club}. Two idiots, zero rupees, and both of them think they won the argument.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,14),
($B$Nobody pays, nobody wins, nobody learns anything. {home_owner} and {away_owner} in one scoreline.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,12),
($B${score} and the ledger does not move. The only thing either of you earned tonight is this message.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,12),
($B$All that chat before kickoff and the money stays exactly where it was. {home_owner}, {away_owner}: quiet for a week, both of you.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,12),
($B$A draw is football's way of saying neither of you picked well enough to deserve anything.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,11),
($B${home_club} and {away_club} share the points. {home_owner} and {away_owner} share the embarrassment.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,13),
($B$The {competition} gave you both ninety minutes to prove something and you both bottled it. {score}.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,12),
($B$Level. {h2h} overall, and tonight added absolutely nothing to the argument.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,11),
($B${home_owner} called it a certain win. {away_owner} called it a certain win. Both talking bollocks, as usual.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,14),
($B$Two men who swear they understand football watched {score} and still cannot explain it.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,12),
($B$No winner, no loser, no money. Just two grown men refreshing {score} like it owed them something.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,12),
($B${score}: {home_owner} and {away_owner} arguing for ninety minutes and agreeing on nothing.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,11),
($B$The table does not move. The group chat, however, remembers every word either of you said before kickoff.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,12),
($B$Draws pay nothing, which is exactly what {home_owner} and {away_owner} have added to this group all season.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,13),
($B${home_club} {score} {away_club}. Fitting. Neither owner deserved a win and neither club was stupid enough to give him one.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,13),
($B$Not a rupee changes hands, and {home_owner} and {away_owner} will still spend the night explaining why they were right.$B$,'BOTH','META',NULL,NULL,'{"lib":"0020","draw":true,"margin_max":0}',2,12),
($B$A derby, {score}, and nobody gets bragging rights. {home_owner} and {away_owner} will both claim them anyway. Both wrong.$B$,'BOTH','DERBY',NULL,NULL,'{"lib":"0020","draw":true,"is_derby":true,"margin_max":0}',2,15),
($B$Derby day ends level. The worst result there is: neither of you can shut the other one up.$B$,'BOTH','DERBY',NULL,NULL,'{"lib":"0020","draw":true,"is_derby":true,"margin_max":0}',2,15),
($B${home_club} v {away_club} was supposed to settle something. {score}. It settled nothing, like every conversation between these two.$B$,'BOTH','DERBY',NULL,NULL,'{"lib":"0020","draw":true,"is_derby":true,"margin_max":0}',2,14)
ON CONFLICT DO NOTHING;
