import { useEffect, useRef, useState } from 'react'
import lotteryConfig from '../core/lottery-config'
import STATUS from '../core/lottery-status'
import { isRehearsal } from '../core/rehearsal'
import { createBackupReminder, dismissBackupReminder, isBackupReminderDismissed } from '../core/backup-reminder'
import { downloadVerificationFile } from '../core/lottery-fairness'
import { toast } from './feedback'
import './lottery-backup-reminder.scss'

interface Props {
  controlConnected: boolean // 双屏时主屏在投影上，主持人点不到，不显示
}

// 某个奖项抽完、回到等待操作时，在角落提醒下载验证文件备份。不遮挡舞台，可忽略（决策 012 #6）。
export default function LotteryBackupReminder({ controlConnected }: Props) {
  const reminder = useRef(createBackupReminder(lotteryConfig.prizeList))
  const [prizeNames, setPrizeNames] = useState<string[]>([])

  useEffect(() => STATUS.subscribe(() => {
    // 演出结束（presenting）或回到 idle 时检查；动画进行中不弹。
    if (!STATUS.isWait()) return
    const fresh = reminder.current.check(lotteryConfig.prizeList)
    if (fresh.length === 0 || isBackupReminderDismissed(lotteryConfig.seed)) return
    const names = lotteryConfig.prizeList.filter(prize => fresh.includes(prize.id)).map(prize => prize.name)
    setPrizeNames(previous => [...previous, ...names.filter(name => !previous.includes(name))])
  }), [])

  if (prizeNames.length === 0 || isRehearsal() || controlConnected) return null

  async function handleDownload() {
    try {
      await downloadVerificationFile()
      setPrizeNames([])
    } catch {
      toast('验证文件生成失败，请稍后重试')
    }
  }

  function dismissForSession() {
    dismissBackupReminder(lotteryConfig.seed)
    setPrizeNames([])
  }

  return (
    <div className="lottery-backup-reminder" role="status">
      <p className="backup-text">
        <strong>{prizeNames.map(name => `「${name}」`).join('')}已抽完</strong>，建议下载验证文件备份。换机或浏览器数据丢失时，可以在公平性面板用它恢复进度。
      </p>
      <p className="backup-hint">文件含种子，活动结束前请自己保管，结束后再分享。</p>
      <div className="backup-actions">
        <button type="button" className="backup-download" onClick={handleDownload}>下载验证文件</button>
        <button type="button" onClick={() => setPrizeNames([])}>忽略</button>
        <button type="button" onClick={dismissForSession}>本场不再提醒</button>
      </div>
    </div>
  )
}
