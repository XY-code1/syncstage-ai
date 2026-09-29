import { useState } from 'react'
import type { DemoScenario } from '../types'
import { JUDGE_CASES, useSession } from '../store/session'
import { Button, Sheet } from './ui'
import { cn } from '../lib/cn'

const SCENARIO_OPTIONS: Array<{ value: DemoScenario; label: string; note: string }> = [
  { value: 'normal', label: '正常流程', note: '按真实节奏跑完 Agent，返回匹配结果' },
  { value: 'slow', label: '载入较慢', note: '模拟弱网，用于展示加载状态' },
  { value: 'error', label: '网络异常', note: 'Agent 中途失败，用于展示错误状态与重试入口' },
]

export function DemoConsole() {
  const { scenario, changeScenario, resetAll, judgeMode, toggleJudgeMode, demoCase, changeDemoCase, dataMode } = useSession()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className={cn(
          'fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r-full border border-l-0 px-1.5 py-3 text-[10px] leading-tight backdrop-blur transition',
          judgeMode
            ? 'border-brand-500/50 bg-brand-800/85 text-brand-100'
            : 'border-white/12 bg-stage-800/80 text-white/55 hover:text-white',
        )}
        aria-label='打开演示控制台'
      >
        <span className='block [writing-mode:vertical-rl]'>{judgeMode ? '评委' : '演示'}</span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title='演示控制台'
        description='用于评审现场切换案例与状态。所有数据均为虚构内容，未接入真实 QQ 音乐账号。'
      >
        <div className='max-h-[64vh] overflow-y-auto pr-1'>
          <p className='mb-2 text-[12px] font-medium text-white/85'>评委演示模式</p>
          <button
            type='button'
            onClick={() => toggleJudgeMode()}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition',
              judgeMode ? 'border-brand-500/50 bg-brand-500/12' : 'border-white/10 bg-white/[0.03]',
            )}
          >
            <span>
              <span className={cn('block text-[13px]', judgeMode ? 'text-brand-100' : 'text-white/85')}>
                {judgeMode ? '已开启：显示技术日志' : '已关闭：只显示自然语言进度'}
              </span>
              <span className='mt-0.5 block text-[11px] text-white/45'>
                开启后可以看到 Agent 的工具名、输入输出摘要、耗时与 fallback 状态
              </span>
            </span>
            <span className={cn('h-4 w-4 shrink-0 rounded-full border', judgeMode ? 'border-brand-400 bg-brand-500' : 'border-white/25')} />
          </button>

          <p className='mb-2 mt-5 text-[12px] font-medium text-white/85'>演示案例</p>
          <div className='flex flex-col gap-2'>
            {JUDGE_CASES.map((option) => {
              const active = option.value === demoCase
              return (
                <button
                  key={option.value}
                  type='button'
                  onClick={() => changeDemoCase(option.value)}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition',
                    active ? 'border-brand-500/50 bg-brand-500/12' : 'border-white/10 bg-white/[0.03] hover:border-white/20',
                  )}
                >
                  <span>
                    <span className={cn('block text-[13px]', active ? 'text-brand-100' : 'text-white/85')}>{option.label}</span>
                    <span className='mt-0.5 block text-[11px] text-white/45'>{option.note}</span>
                  </span>
                  <span className={cn('h-4 w-4 shrink-0 rounded-full border', active ? 'border-brand-400 bg-brand-500' : 'border-white/25')} />
                </button>
              )
            })}
          </div>

          <p className='mb-2 mt-5 text-[12px] font-medium text-white/85'>页面状态</p>
          <div className='flex flex-col gap-2'>
            {SCENARIO_OPTIONS.map((option) => {
              const active = option.value === scenario
              return (
                <button
                  key={option.value}
                  type='button'
                  onClick={() => changeScenario(option.value)}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition',
                    active ? 'border-brand-500/50 bg-brand-500/12' : 'border-white/10 bg-white/[0.03] hover:border-white/20',
                  )}
                >
                  <span>
                    <span className={cn('block text-[13px]', active ? 'text-brand-100' : 'text-white/85')}>{option.label}</span>
                    <span className='mt-0.5 block text-[11px] text-white/45'>{option.note}</span>
                  </span>
                  <span className={cn('h-4 w-4 shrink-0 rounded-full border', active ? 'border-brand-400 bg-brand-500' : 'border-white/25')} />
                </button>
              )
            })}
          </div>

          <p className='mt-5 rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-[11px] leading-relaxed text-white/45'>
            当前数据源：{dataMode === 'backend' ? '本地后端 Agent（工具轨迹来自后端）' : dataMode === 'probing' ? '正在探测后端…' : '前端本地镜像（后端未启动）'}
            。开启后端后切换到后端 Agent 可以看到真实的后端工具调用轨迹。
          </p>
        </div>

        <Button
          variant='secondary'
          full
          className='mt-4'
          onClick={() => {
            resetAll()
            setOpen(false)
          }}
        >
          重置演示数据并回到首页
        </Button>
      </Sheet>
    </>
  )
}