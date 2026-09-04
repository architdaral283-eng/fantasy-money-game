-- Migration 0014: anon read for roast tables + ops tables (same pattern as 0004).
DROP POLICY IF EXISTS anon_read ON roast_templates;
CREATE POLICY anon_read ON roast_templates FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_read ON derbies;
CREATE POLICY anon_read ON derbies FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_read ON club_dossiers;
CREATE POLICY anon_read ON club_dossiers FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_read ON blocked_terms;
CREATE POLICY anon_read ON blocked_terms FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_read ON api_call_log;
CREATE POLICY anon_read ON api_call_log FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_read ON pending_approvals;
CREATE POLICY anon_read ON pending_approvals FOR SELECT TO anon USING (true);
