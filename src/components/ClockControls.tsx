// 時計操作（design.md §5：Day表示・次の日へ進む・リセット。自動再生は無し、design.md DEV-2）
interface ClockControlsProps {
  day: number;
  onAdvanceDay: () => void;
  onReset: () => void;
}

function ClockControls({ day, onAdvanceDay, onReset }: ClockControlsProps) {
  return (
    <div className="clock-controls">
      <span className="clock-controls__day">D+{day}</span>
      <button type="button" onClick={onAdvanceDay}>
        次の日へ進む
      </button>
      <button type="button" className="clock-controls__reset" onClick={onReset}>
        リセット
      </button>
    </div>
  );
}

export default ClockControls;
