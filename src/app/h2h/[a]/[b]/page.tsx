import { playerName } from '@/lib/pages/data';

export default async function H2HPair({ params }: { params: Promise<{ a: string; b: string }> }) {
  const { a, b } = await params;
  return (
    <>
      <h2>{playerName(a)} v {playerName(b)}</h2>
      <p>Eight league fixtures, plus cup and UCL meetings. Nothing played yet.</p>
      <table className="record">
        <thead><tr><th>Competition</th><th>Fixture</th><th>Score</th><th>₹</th></tr></thead>
        <tbody><tr><td colSpan={4}>Nothing played yet.</td></tr></tbody>
      </table>
    </>
  );
}
