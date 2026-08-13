// データ増分ログ（design.md EXT-8：テーブル別行数差分＋業務メッセージ）
import type { EventLogEntry } from "../types";

interface EventLogPanelProps {
  entries: EventLogEntry[];
}

function EventLogPanel({ entries }: EventLogPanelProps) {
  const reversed = [...entries].reverse();

  return (
    <div className="event-log">
      <h2>データ増分ログ</h2>
      {reversed.length === 0 ? (
        <p className="event-log__empty">まだ操作はありません。</p>
      ) : (
        <ul className="event-log__list">
          {reversed.map((entry, index) => (
            <li key={`${entries.length - 1 - index}`} className="event-log__entry">
              <span className="event-log__day">D+{entry.day}</span>
              <span className="event-log__message">{entry.message}</span>
              {entry.tableDeltas.length > 0 && (
                <span className="event-log__deltas">{entry.tableDeltas.join(" / ")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EventLogPanel;
