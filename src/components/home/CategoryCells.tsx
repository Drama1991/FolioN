import Link from "next/link";
import { gradientFor } from "@/lib/format/cover-gradient";
import { MEDIUM_ICON } from "@/lib/format/medium-icons";
import type { UiMedium } from "@/lib/format/verbs";

const LABELS: Record<UiMedium, string> = {
  movie: "电影", series: "剧集", book: "书籍", music: "音乐", podcast: "播客", game: "游戏",
};

interface Cell {
  medium: UiMedium;
  covers: { src?: string | null; uuid: string }[];
}

export function CategoryCells({ cells }: { cells: Cell[] }) {
  return (
    <div
      className="home-category-cells"
      style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length},1fr)`, gap: 8 }}
    >
      {cells.map((c) => (
        <CategoryCell key={c.medium} {...c} />
      ))}
    </div>
  );
}

// 三张封面错位叠加的几何参数；正中那张在最顶层
const TILE_LAYOUT = [
  { x: -18, y: 6, rotate: -6, z: 1 },
  { x: 20, y: 4, rotate: 5, z: 2 },
  { x: 1, y: -4, rotate: -1, z: 3 },
];

function CategoryCell({ medium, covers }: Cell) {
  // 真封面靠顶层槽位（z 高）填充，占位垫底——否则真封面不足 3 张时会被补位占位盖住，只露一条边
  const realCount = Math.min(covers.length, TILE_LAYOUT.length);
  const fillCount = TILE_LAYOUT.length - realCount;
  const tiles = TILE_LAYOUT.map((_, i) =>
    i < fillCount ? { src: null, uuid: `${medium}-fill-${i}` } : covers[i - fillCount],
  );

  return (
    <Link
      href={`/archive/${medium}`}
      className="cell-link"
      style={{
        position: "relative",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--r2)",
        padding: "10px 12px 12px",
        textDecoration: "none",
        color: "var(--text)",
        overflow: "hidden",
        background: "var(--bg)",
        minHeight: 138,
        display: "flex",
        flexDirection: "column",
      }}
    >

      <div style={{ position: "relative", flex: 1, minHeight: 78, marginBottom: 8 }}>
        {tiles.map((t, i) => {
          const l = TILE_LAYOUT[i];
          const isImg = !!t.src;
          const grad = gradientFor(t.uuid);
          return (
            <div
              key={i}
              aria-hidden
              className={isImg ? undefined : grad}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 44,
                height: 62,
                marginLeft: -22,
                marginTop: -31,
                transform: `translate(${l.x}px, ${l.y}px) rotate(${l.rotate}deg)`,
                borderRadius: 3,
                background: isImg ? `url(${t.src}) center/cover no-repeat` : undefined,
                boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
                border: "0.5px solid rgba(255,255,255,0.4)",
                zIndex: l.z,
              }}
            />
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <i className={`ti ${MEDIUM_ICON[medium]}`} style={{ fontSize: 14, color: "var(--text3)" }} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>{LABELS[medium]}</span>
      </div>
    </Link>
  );
}
