import { describe, it, expect } from 'vitest';
import { parseNews, selectDigest, NEWS_LEAGUES, type NewsItem } from '@/lib/news/espn-news';
import { buildDigestText } from '@/lib/notify/format';

const NOW = Date.parse('2026-10-28T18:00:00Z');
const art = (o: Record<string, unknown> = {}) => ({
  id: 1, type: 'Story', headline: 'Something happened', published: '2026-10-28T08:00:00Z',
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

  it('drops anything older than the window', () => {
    const old = art({ id: 9, published: '2026-10-20T08:00:00Z' });
    expect(parseNews({ articles: [old] }, NOW)).toHaveLength(0);
    expect(parseNews({ articles: [old] }, NOW, 24 * 30)).toHaveLength(1);
  });

  it('an article about nobody we own is general football, not dropped', () => {
    const [n] = parseNews({ articles: [art({ headline: 'Ballon d\'Or shortlist announced', categories: [team(99999)] })] }, NOW);
    expect(n.clubIds).toEqual([]);
  });

  it('survives garbage', () => {
    expect(parseNews(null, NOW)).toEqual([]);
    expect(parseNews({ articles: 'no' }, NOW)).toEqual([]);
    expect(parseNews({ articles: [{}, { type: 'Story' }] }, NOW)).toEqual([]);
  });

  it('asks every league the clubs actually play in', () => {
    expect([...NEWS_LEAGUES]).toEqual(['eng.1', 'esp.1', 'ger.1', 'ita.1', 'uefa.champions']);
  });
});

describe('choosing tonight\'s brief', () => {
  const mk = (id: string, clubIds: string[], headline: string, mins = 0): NewsItem =>
    ({ id, headline, clubIds, published: new Date(NOW - mins * 60000).toISOString() });

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

  it('caps both sections and reports every id shown', () => {
    const items = [
      ...['arsenal', 'bayern', 'napoli', 'roma', 'inter', 'juventus', 'barcelona']
        .map((c, i) => mk('c' + i, [c], 'club ' + i, i)),
      ...[0, 1, 2].map((i) => mk('g' + i, [], 'general ' + i, 20 + i)),
    ];
    const got = selectDigest(items, { maxOurs: 6, maxGeneral: 2 });
    expect(got.ours).toHaveLength(6);
    expect(got.general).toHaveLength(2);
    expect(got.ids).toHaveLength(8);
  });

  it('newest first', () => {
    const got = selectDigest([mk('old', ['inter'], 'older', 90), mk('new', ['roma'], 'newer', 1)]);
    expect(got.ours[0].headline).toBe('newer');
  });
});

describe('the brief itself', () => {
  const next = {
    home: 'Bayern Munich', away: 'Borussia Dortmund', ownerA: 'Harshal', ownerB: 'Anmol',
    compId: 'bundesliga', timeIST: '23:00', dateIST: 'Sat 31 Oct',
  };

  it('puts the club and the owner on the same line', () => {
    const t = buildDigestText('Wed 28 Oct', [
      { club: 'Arsenal', owner: 'Archit', headline: 'Fleetwood Town knock Arsenal out of the League Cup' },
    ], ['Ballon d\'Or shortlist announced'], next, 1500);
    expect(t.startsWith('TONIGHT · Wed 28 Oct')).toBe(true);
    expect(t).toContain('Arsenal · Archit');
    expect(t).toContain('Fleetwood Town knock Arsenal out');
    expect(t).toContain('ELSEWHERE');
    expect(t).toContain('Next: Bayern Munich v Borussia Dortmund, Sat 31 Oct 23:00 IST');
    expect(t).toContain('Harshal v Anmol · Bundesliga');
    expect(t).toContain('₹1,500 in play over the next seven days.');
  });

  it('says so plainly on a dead news day', () => {
    const t = buildDigestText('Wed 28 Oct', [], [], next, 0);
    expect(t).toContain('Nothing happened to any of your sixteen today');
    expect(t).not.toContain('in play over the next seven days');
  });

  it('handles an empty calendar', () => {
    expect(buildDigestText('Wed 28 Oct', [], [], null, 0)).toContain('Nothing counted on the calendar.');
  });

  it('escapes a headline that would otherwise break HTML parse mode', () => {
    const t = buildDigestText('Wed 28 Oct', [{ club: 'Inter', owner: 'Anmol', headline: 'Inter & <Lautaro> stay' }], [], null, 0);
    expect(t).toContain('Inter &amp; &lt;Lautaro&gt; stay');
  });
});
