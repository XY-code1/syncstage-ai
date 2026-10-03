# 开源借鉴与许可说明（粒子舞台 / FrequencyParticleStage）

本文件只记录「同频现场」Agent 执行页粒子舞台（`frontend/src/components/visuals/`）实际参考的开源来源、
许可证，以及真正借鉴的内容。**没有复制任何来源不明的商业项目代码、图片、字体或视频素材。**

## 依赖（npm 直接依赖）

| 包 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| `three` | 0.186.1 | MIT | WebGL 渲染引擎（BufferGeometry / ShaderMaterial / Points） |
| `@react-three/fiber` | 9.8.1 | MIT | React 渲染器（`Canvas` / `useFrame` / `useThree`） |
| `@react-three/drei` | 10.7.9 | MIT | 使用 `Points` + `PointMaterial` 渲染远景微光粒子 |
| `@types/three` | 0.186.0 | MIT | three 的 TypeScript 类型（devDependency） |

## 参考来源与借鉴内容

1. **React Three Fiber 官方 Pointcloud 示例**
   - 地址：https://github.com/pmndrs/react-three-fiber/blob/master/example/src/demos/Pointcloud.tsx
   - 许可证：MIT
   - 借鉴内容：用**一个** `BufferGeometry` + `Points` 承载成千上万颗粒子、positions 只在 `useMemo` 里生成一次、
     绝不给每颗粒子建独立 React 组件；`useFrame` 里只改材质/uniform，不触发 React 重渲染。
     本项目在 `FrequencyParticleScene.tsx` 中沿用该结构，但着色器（声波、能量核心、连接粒子、黑胶、背景）
     全部为本项目自行编写。

2. **React Three Fiber 官方性能指南（Scaling performance）**
   - 地址：https://r3f.docs.pmnd.rs/advanced/scaling-performance
   - 许可证：MIT（文档随仓库）
   - 借鉴内容：`frameloop="demand"` 用于「暂停 / prefers-reduced-motion」等静止状态、
     用 `invalidate()` 精确控制重绘、按设备能力限制 DPR 与粒子数量、把逐帧计算从 React state 里移出去、
     按需关闭 antialias 等昂贵的渲染开关。

3. **drei · Points（Performances/Points）**
   - 地址：https://drei.docs.pmnd.rs/performances/points
   - 许可证：MIT
   - 借鉴内容：`Points`（接收 `Float32Array` positions 的缓冲区实现）+ `PointMaterial`（无需贴图即可画出
     抗锯齿圆形点）作为远景微光粒子的实现方式。

## 明确未使用的素材

- 未使用任何第三方商业项目的代码或美术资源。
- 未使用超大纹理、视频背景或未经授权的人物照片。头像要么来自用户自己上传的 data URL，
  要么由浏览器端用 canvas 现场生成的渐变 + 首字占位图（`makeInitialTexture`）。
- 现有产品图中出现的绿色 / 紫色声波、唱片、演唱会灯光属于**视觉方向参考**，实现代码为原创。