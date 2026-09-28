// 日次推移のミニ折れ線グラフ（design.md ダッシュボード機能。Issue #60でKpiDashboard.tsxと共有する形に切り出した）
interface SparklineProps {
  values: (number | null)[];
}

/** スクリーンリーダー向けに開始値→最新値を読み上げられる程度の丸めをする（表示用の書式・単位は呼び出し側の値列に譲る） */
function roundForLabel(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function Sparkline({ values }: SparklineProps) {
  const points = values
    .map((v, i) => (v != null ? { x: i, y: v } : null))
    .filter((p): p is { x: number; y: number } => p != null);
  if (points.length < 2) return <span className="dashboard__spark-empty">推移データ不足</span>;

  const w = 84;
  const h = 22;
  const minX = points[0].x;
  const maxX = points[points.length - 1].x;
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const xOf = (x: number) => (maxX === minX ? 0 : ((x - minX) / (maxX - minX)) * w);
  const yOf = (y: number) => (maxY === minY ? h / 2 : h - ((y - minY) / (maxY - minY)) * h);
  const path = points.map((p) => `${xOf(p.x)},${yOf(p.y)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  // aria-hiddenにすると値が存在する行だけ読み上げ情報が消えるため、role="img"のaria-labelで代替する
  const trendLabel = `推移（${points.length}日分）：${roundForLabel(first.y)} から ${roundForLabel(last.y)}`;

  return (
    <svg className="dashboard__spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={trendLabel}>
      <polyline points={path} className="dashboard__spark-line" />
      <circle cx={xOf(last.x)} cy={yOf(last.y)} r={2} className="dashboard__spark-dot" />
    </svg>
  );
}

export default Sparkline;
