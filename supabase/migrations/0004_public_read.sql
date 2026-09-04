-- Migration 0004: public read access (interim).
-- The league site is currently viewable by anyone with the link; all four
-- players read everything. Writes still go through the service-role API only.
-- Tighten to magic-link auth (authenticated-only SELECT) when login lands (§10).
-- NOTE: Postgres has no CREATE POLICY IF NOT EXISTS, so DROP first (re-runnable).

DROP POLICY IF EXISTS anon_read ON players;
CREATE POLICY anon_read ON players FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read ON clubs;
CREATE POLICY anon_read ON clubs FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read ON competitions;
CREATE POLICY anon_read ON competitions FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read ON competition_rounds;
CREATE POLICY anon_read ON competition_rounds FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read ON fixtures;
CREATE POLICY anon_read ON fixtures FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read ON results;
CREATE POLICY anon_read ON results FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read ON ties;
CREATE POLICY anon_read ON ties FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read ON trophies;
CREATE POLICY anon_read ON trophies FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read ON ledger_entries;
CREATE POLICY anon_read ON ledger_entries FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read ON wld_records;
CREATE POLICY anon_read ON wld_records FOR SELECT TO anon USING (true);
