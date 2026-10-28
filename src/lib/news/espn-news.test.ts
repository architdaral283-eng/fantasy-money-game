import { describe, it, expect } from 'vitest';
import { parseNews, selectDigest, isFirstTeamFootball, newsPriority, clubOfHeadline, NEWS_LEAGUES, type NewsItem } from '@/lib/news/espn-news';
import { buildDigestText } from '@/lib/notify/format';

const NOW = Date.parse('2026-10-28T18:00:00Z');
const art = (o: Record<string, unknown> = {}) => ({
  id: 1, type: 'Story', headline: 'Napoli sign a midfielder', published: '2026-10-28T08:00:00Z',
  categories: [], ...o,
});
const team = (id: number) => ({ type: 'team', teamId: id });

describe('parsing ESPN news', () => {
  it('matches our clubs by ESPN team id, never by name', () => {
    const [n] = parseNews({ articles: [art({
      id: 77, headline: 'Fleetwood Town knock Arsenal out of the League Cup',
      categories: [team(3891), team(359)],   // Fleetwood (not ours), Arsenal (ours)
    })] }, NOW);
    expect(n.clubIds).toEqual(['arsenal']);
    expect(n.id).toBe('77');
  });

  it('keeps stories and headlines, drops video and match reports', () => {
    const got = parseNews({ articles: [
      art({ id: 1, type: 'Story' }), art({ id: 2, type: 'HeadlineNews' }),
      art({ id: 3, type: 'Media' }), art({ id: 4, type: 'Recap' }),
    ] }, NOW);
    expect(got.map((g) => g.id)).toEqual(['1', '2']);
  });

  it('only today: a day-old match report is not news at 23:00', () => {
    const old = art({ id: 9, published: '2026-10-26T20:00:00Z' });   // ~46h back  
    expect(parseNews({ articles: [old] }, NOW)).toHaveLength(0);
    expect(parseNews({ articles: [old] }, NOW, 24 * 30)).toHaveLength(1);
  });

  it('an article about nobody we own is general football, not dropped', () => {
    const [n] = parseNews({ articles: [art({ headline: 'Pulisic signs a new Milan contract', categories: [team(99999)] })] }, NOW);
    expect(n.clubIds).toEqual([]);
  });

  it('survives garbage', () => {
    expect(parseNews(null, NOW)).toEqual([]);
    expect(parseNews({ articles: 'no' }, NOW)).toEqual([]);
    expect(parseNews({ articles: [{}, { type: 'Story' }] }, NOW)).toEqual([]);
  });

  it('throws out the three shapes of filler a daily feed is made of', () => {
    // all three came out of the live feed and all three read as generic
    expect(newsPriority('Transfer rumors, news: Arsenal, Chelsea, City tracking Doué')).toBe(2);
    expect(newsPriority('Why Real Madrid\'s Mbappé lost the Ballon d\'Or')).toBe(2);
    expect(newsPriority('Yamal excited despite Ballon d\'Or miss: Good things take time')).toBe(2);
    expect(newsPriority('Arteta, Alonso, Iraola: three managers from one tiny club')).toBe(2);
    // and these are what the brief is for
    expect(newsPriority("Kompany 'stable', could be away for weeks after collapse")).toBe(0);
    expect(newsPriority('Napoli sack their head coach')).toBe(0);
    expect(newsPriority('Fleetwood Town knock Arsenal out of the League Cup')).toBe(0);
    expect(newsPriority('Mbappé ruled out for three weeks')).toBe(0);
    expect(newsPriority('Liverpool linked with Dortmund midfielder Nmecha')).toBe(1);
  });

  it('filler never reaches the brief at all', () => {
    const got = parseNews({ articles: [
      art({ id: 1, headline: 'Transfer rumors, news: City tracking Doué', categories: [team(382)] }),
      art({ id: 2, headline: 'Napoli sack their head coach', categories: [team(114)] }),
    ] }, NOW);
    expect(got.map((g) => g.id)).toEqual(['2']);
  });

  it('drops the under-18s, the women\'s team and the tabloid stuff', () => {
    // ESPN tags a youth story to the SENIOR club id, so team-id filtering
    // alone let "Rooney's son scores for the under-18s" through.
    expect(isFirstTeamFootball("Wayne Rooney's son Kai scores 4 goals for Man United under-18s")).toBe(false);
    expect(isFirstTeamFootball('Arsenal Women win the WSL')).toBe(false);
    expect(isFirstTeamFootball('Barcelona academy graduate signs pro deal')).toBe(false);
    expect(isFirstTeamFootball("Bruno Fernandes' home burgled during Man United loss")).toBe(false);
    // the things Archit actually wants
    expect(isFirstTeamFootball('Kompany stable, could be away for weeks after collapse')).toBe(true);
    expect(isFirstTeamFootball('Liverpool tracking Dortmund midfielder Nmecha')).toBe(true);
    expect(isFirstTeamFootball('Arsenal crash out of the League Cup to Fleetwood')).toBe(true);
  });

  it('filters the feed, not just the selection', () => {
    const got = parseNews({ articles: [
      art({ id: 1, headline: 'Man United under-18s win 4-0', categories: [team(360)] }),
      art({ id: 2, headline: 'Mbappé out for three weeks', categories: [team(86)] }),
    ] }, NOW);
    expect(got.map((g) => g.id)).toEqual(['2']);
  });

  it('an event outranks interest, and interest outranks nothing', () => {
    const mk2 = (id: string, club: string, headline: string, mins: number): NewsItem =>
      ({ id, headline, description: '', clubIds: [club], published: new Date(NOW - mins * 60000).toISOString() });
    const got = selectDigest([
      mk2('i', 'inter', 'Inter linked with a striker', 5),       // newest, but only interest
      mk2('e', 'bayern', 'Bayern sign Wirtz', 300),              // older, but done
    ], { maxOurs: 2 });
    expect(got.ours[0].headline).toBe('Bayern sign Wirtz');
  });

  it('asks every league the clubs actually play in', () => {
    expect([...NEWS_LEAGUES]).toEqual(['eng.1', 'esp.1', 'ger.1', 'ita.1', 'uefa.champions']);
  });
});

describe('whose story is it', () => {
  const it0 = (headline: string, clubIds: string[]): NewsItem =>
    ({ id: 'x', headline, description: '', clubIds, published: '2026-10-28T12:00:00Z' });

  it('uses the club NAMED in the headline, not the first one ESPN tagged', () => {
    // the real one: ESPN tagged seven clubs, Manchester United first, for a
    // story about Arsenal losing to Fleetwood. It printed the wrong owner.
    const n = it0("Is Fleetwood Town's defeat of Arsenal the biggest upset in League Cup history?", ['man-utd', 'arsenal']);
    expect(clubOfHeadline(n)).toBe('arsenal');
  });

  it('trusts a single tag when the headline names only a player', () => {
    expect(clubOfHeadline(it0('Mbappé ruled out for three weeks', ['real-madrid']))).toBe('real-madrid');
  });

  it('refuses to guess when several are tagged and none is named', () => {
    expect(clubOfHeadline(it0('Five giant-killings that shook the cup', ['man-utd', 'arsenal', 'inter']))).toBeNull();
  });

  it('a story naming two of ours goes to the first one named', () => {
    expect(clubOfHeadline(it0('Bayern beat Dortmund to the signature', ['dortmund', 'bayern']))).toBe('bayern');
  });
});

describe('choosing tonight\'s brief', () => {
  const mk = (id: string, clubIds: string[], headline: string, mins = 0, description = ''): NewsItem =>
    ({ id, headline, description, clubIds, published: new Date(NOW - mins * 60000).toISOString() });

  it('never repeats a headline sent on a previous night', () => {
    const items = [mk('a', ['arsenal'], 'Arsenal out of the cup'), mk('b', ['bayern'], 'Kane injured', 10)];
    const got = selectDigest(items, { seenIds: ['a'] });
    expect(got.ours.map((o) => o.id)).toEqual(['b']);
  });

  it('de-duplicates the same story syndicated into several league feeds', () => {
    const items = [
      mk('x', ['bayern'], 'Bayern beaten in Munich'),
      mk('y', ['bayern'], 'bayern   BEATEN in munich', 5), // same words, different id
    ];
    expect(selectDigest(items).ours).toHaveLength(1);
  });

  it('gives one slot per club so a busy week cannot take the whole brief', () => {
    const items = [
      mk('1', ['arsenal'], 'Arsenal one'), mk('2', ['arsenal'], 'Arsenal two', 5),
      mk('3', ['arsenal'], 'Arsenal three', 6), mk('4', ['napoli'], 'Napoli one', 7),
    ];
    const got = selectDigest(items);
    expect(got.ours.map((o) => o.headline)).toEqual(['Arsenal one', 'Napoli one']);
  });

  it('caps the list and reports every id shown', () => {
    const items = ['arsenal', 'bayern', 'napoli', 'roma', 'inter', 'juventus', 'barcelona']
      .map((c, i) => mk('c' + i, [c], 'club ' + i, i));
    const got = selectDigest(items, { maxOurs: 6 });
    expect(got.ours).toHaveLength(6);
    expect(got.ids).toHaveLength(6);
  });

  it('general football needs ESPN\'s summary or it does not run', () => {
    const got = selectDigest([
      mk('bare', [], 'How a tiny Basque club spawned the top managers'),
      mk('ctx', [], 'Kane wins the Ballon d\'Or', 5, 'After a remarkable year for Bayern and England, Harry Kane is named the world\'s best player.'),
      mk('c', ['roma'], 'Dybala out for a month', 6),
    ]);
    expect(got.ours.map((o) => o.headline)).toEqual(['Dybala out for a month']);
    expect(got.general.map((g) => g.id)).toEqual(['ctx']);   // the bare one is dropped
  });

  it('newest first', () => {
    const got = selectDigest([mk('old', ['inter'], 'older', 90), mk('new', ['roma'], 'newer', 1)]);
    expect(got.ours[0].headline).toBe('newer');
  });
});

describe('the brief itself', () => {
  it('is headed, then club, owner, headline', () => {
    const t = buildDigestText('Wed 28 Oct', [
      { club: 'Arsenal', owner: 'Archit', headline: 'Fleetwood Town knock Arsenal out of the League Cup' },
      { club: 'Bayern Munich', owner: 'Harshal', headline: 'Kompany could be away for weeks after collapse' },
    ]);
    expect(t.startsWith('DAILY NEWS BRIEF · Tonight · Wed 28 Oct')).toBe(true);
    expect(t).toContain('Arsenal · Archit');
    expect(t).toContain('Bayern Munich · Harshal');
    expect(t).not.toContain('YOUR SIXTEEN');
    expect(t).not.toContain('Next:');
  });

  it('general football carries its context line', () => {
    const t = buildDigestText('Wed 28 Oct', [], [
      { headline: "Kane's long road to Ballon d'Or glory", context: 'After a remarkable year for Bayern Munich and England, Harry Kane is the world’s best player.' },
    ]);
    expect(t).toContain('ELSEWHERE');
    expect(t).toContain("Kane's long road");
    expect(t).toContain('world’s best player');
  });

  it('says so plainly on a dead news day', () => {
    expect(buildDigestText('Wed 28 Oct', [], [])).toContain('Nothing happened to any of your sixteen today');
  });

  it('escapes a headline that would otherwise break HTML parse mode', () => {
    const t = buildDigestText('Wed 28 Oct', [{ club: 'Inter', owner: 'Anmol', headline: 'Inter & <Lautaro> stay' }]);
    expect(t).toContain('Inter &amp; &lt;Lautaro&gt; stay');
  });
});
