/**
 * 粒子舞台的公开状态与性能档位。
 *
 * 单独成文件，避免「舞台组件」与「R3F 场景」互相 value-import 形成循环依赖：
 * 场景只从这里取类型，舞台组件再把它们转发给页面。
 */
export type ParticleStageStatus = 'idle' | 'analyzing' | 'searching' | 'matched' | 'paused'

/** 自动分级后的渲染档位：high / mid / low，只影响粒子数量、DPR 与动画密度。 */
export type ParticleStageTier = 'high' | 'mid' | 'low'
