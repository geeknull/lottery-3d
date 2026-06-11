import lotteryConfig from '../core/lottery-config'
import { useLotteryVersion } from '../core/lottery-store'
import { toHistoryRows, exportHistoryCsv } from '../core/lottery-history'
import './lottery-history.scss'

interface Props {
  onClose: () => void
}

// 抽奖历史时间线：按时间倒序展示抽奖/作废/撤销，可导出带时间戳的完整流水
export default function LotteryHistory({ onClose }: Props) {
  useLotteryVersion()
  const rows = toHistoryRows(lotteryConfig.drawLog)

  return (
    <div className="lottery-history">
      <span className="close-btn" onClick={onClose}>✖</span>
      <h2 className="panel-title">🕑 抽奖历史</h2>

      {rows.length === 0 ? (
        <p className="history-empty">还没有任何抽奖记录。</p>
      ) : (
        <>
          <button className="export-btn" onClick={() => exportHistoryCsv(lotteryConfig.drawLog)}>
            导出完整流水 CSV
          </button>
          <ul className="history-list">
            {rows.map((row, i) => (
              <li className={'history-item type-' + row.type} key={i}>
                <span className="history-time">{row.time}</span>
                <span className="history-type">{row.typeLabel}</span>
                <span className="history-prize">{row.prizeName}</span>
                <span className="history-names">{row.names.join('、')}</span>
                {row.note && <span className="history-note">（{row.note}）</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
