interface IconProps {
  className?: string
}

const base = 'h-5 w-5'

export function ArrowLeftIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M15 5l-7 7 7 7' />
    </svg>
  )
}

export function ArrowRightIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M9 5l7 7-7 7' />
    </svg>
  )
}

export function ChevronDownIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M6 9l6 6 6-6' />
    </svg>
  )
}

export function SparkleIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z' />
      <path d='M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z' />
    </svg>
  )
}

export function MusicIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M9 18V6l10-2v12' />
      <circle cx='6.5' cy='18' r='2.5' />
      <circle cx='16.5' cy='16' r='2.5' />
    </svg>
  )
}

export function UsersIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M16 19v-1.5a4 4 0 00-4-4H7a4 4 0 00-4 4V19' />
      <circle cx='9.5' cy='8' r='3.2' />
      <path d='M17 11.5a3 3 0 100-6' />
      <path d='M21 19v-1.2a3.6 3.6 0 00-2.6-3.4' />
    </svg>
  )
}

export function ShieldIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6l7-3z' />
      <path d='M9 12l2 2 4-4' />
    </svg>
  )
}

export function MapPinIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M12 21s6.5-6 6.5-11a6.5 6.5 0 10-13 0C5.5 15 12 21 12 21z' />
      <circle cx='12' cy='10' r='2.4' />
    </svg>
  )
}

export function ClockIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <circle cx='12' cy='12' r='8.4' />
      <path d='M12 7.8V12l3 1.9' />
    </svg>
  )
}

export function CheckIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.1' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M5 12.5l4.5 4.5L19 7' />
    </svg>
  )
}

export function CloseIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.9' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M6 6l12 12M18 6L6 18' />
    </svg>
  )
}

export function RefreshIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M20 11a8 8 0 10-2.6 5.9' />
      <path d='M20 5v6h-6' />
    </svg>
  )
}

export function SendIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M4 12l16-7-5.5 16-3.2-6.3L4 12z' />
    </svg>
  )
}

export function AlertIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M12 3.6l8.4 15H3.6l8.4-15z' />
      <path d='M12 9.5v4.2' />
      <circle cx='12' cy='16.4' r='0.9' fill='currentColor' stroke='none' />
    </svg>
  )
}

export function InfoIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <circle cx='12' cy='12' r='8.4' />
      <path d='M12 11v5.2' />
      <circle cx='12' cy='8.1' r='0.9' fill='currentColor' stroke='none' />
    </svg>
  )
}

export function PlusIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.9' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M12 5.5v13M5.5 12h13' />
    </svg>
  )
}

export function EditIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M4.5 19.5h4L20 8a2.1 2.1 0 00-3-3L5.5 16.5v3z' />
    </svg>
  )
}

export function ShareIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M12 15V4' />
      <path d='M8.5 7.5L12 4l3.5 3.5' />
      <path d='M5 13v5.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V13' />
    </svg>
  )
}

export function CalendarIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <rect x='3.8' y='5.2' width='16.4' height='15' rx='2.4' />
      <path d='M3.8 10h16.4M8.5 3.5v3.4M15.5 3.5v3.4' />
    </svg>
  )
}

export function HeartIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M12 19.5s-7-4.4-7-9.1A3.9 3.9 0 0112 7.6a3.9 3.9 0 017 2.8c0 4.7-7 9.1-7 9.1z' />
    </svg>
  )
}

export function TicketIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M4 8.5A2.5 2.5 0 006.5 6h11A2.5 2.5 0 0120 8.5v1a2.5 2.5 0 000 5v1A2.5 2.5 0 0117.5 18h-11A2.5 2.5 0 014 15.5v-1a2.5 2.5 0 000-5v-1z' />
      <path d='M12 9v6' strokeDasharray='2 2.4' />
    </svg>
  )
}

export function ChatIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M20 12.5c0 3.9-3.6 7-8 7-1 0-2-.2-2.9-.5L5 20.5l1.2-3.3A6.6 6.6 0 014 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7z' />
    </svg>
  )
}

export function HomeIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M4 10.4L12 4l8 6.4V19a1.4 1.4 0 01-1.4 1.4H5.4A1.4 1.4 0 014 19v-8.6z' />
      <path d='M9.6 20.4v-6.2h4.8v6.2' />
    </svg>
  )
}

export function PersonIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <circle cx='12' cy='8.4' r='3.6' />
      <path d='M4.8 20v-.9a5.4 5.4 0 015.4-5.4h3.6a5.4 5.4 0 015.4 5.4v.9' />
    </svg>
  )
}

export function MicIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <rect x='9.2' y='3.4' width='5.6' height='10.2' rx='2.8' />
      <path d='M5.8 11.4a6.2 6.2 0 0012.4 0M12 17.6V20.6' />
    </svg>
  )
}

export function BellIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M18 15.6V10a6 6 0 10-12 0v5.6L4.6 18h14.8L18 15.6z' />
      <path d='M10 20.4a2 2 0 004 0' />
    </svg>
  )
}

export function SettingsIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <circle cx='12' cy='12' r='2.8' />
      <path d='M19.4 14.4a1.6 1.6 0 00.3 1.8l.1.1a1.9 1.9 0 11-2.7 2.7l-.1-.1a1.6 1.6 0 00-2.7 1.1v.3a1.9 1.9 0 11-3.8 0v-.2a1.6 1.6 0 00-2.8-1.1l-.1.1a1.9 1.9 0 11-2.7-2.7l.1-.1a1.6 1.6 0 00-1.1-2.7h-.3a1.9 1.9 0 110-3.8h.2a1.6 1.6 0 001.1-2.8l-.1-.1A1.9 1.9 0 016 4.2l.1.1a1.6 1.6 0 001.8.3h.1a1.6 1.6 0 001-1.5v-.3a1.9 1.9 0 113.8 0v.2a1.6 1.6 0 002.7 1.1l.1-.1a1.9 1.9 0 112.7 2.7l-.1.1a1.6 1.6 0 00-.3 1.8v.1a1.6 1.6 0 001.5 1h.3a1.9 1.9 0 110 3.8h-.2a1.6 1.6 0 00-1.4 1z' />
    </svg>
  )
}

export function LockIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <rect x='4.6' y='10.4' width='14.8' height='9.6' rx='2.2' />
      <path d='M8.2 10.4V8a3.8 3.8 0 017.6 0v2.4' />
    </svg>
  )
}

export function ChevronRightIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M9.5 5.5l6.5 6.5-6.5 6.5' />
    </svg>
  )
}

export function SearchIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <circle cx='11' cy='11' r='6.4' />
      <path d='M15.8 15.8L20 20' />
    </svg>
  )
}

export function VolumeIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M5 9.5h3l4-3.2v11.4l-4-3.2H5z' />
      <path d='M15.4 9.4a3.6 3.6 0 010 5.2M17.8 7.2a7 7 0 010 9.6' />
    </svg>
  )
}
export function CameraIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M4 8.5h2.4l1.3-2h8.6l1.3 2H20a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1v-8a1 1 0 011-1z' />
      <circle cx='12' cy='13.5' r='3.2' />
    </svg>
  )
}

export function StopIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <rect x='6.5' y='6.5' width='11' height='11' rx='2.5' />
    </svg>
  )
}

export function GlobeIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <circle cx='12' cy='12' r='8.2' />
      <path d='M3.8 12h16.4M12 3.8c2.2 2.4 3.3 5.2 3.3 8.2s-1.1 5.8-3.3 8.2c-2.2-2.4-3.3-5.2-3.3-8.2S9.8 6.2 12 3.8z' />
    </svg>
  )
}

export function PhoneIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M7 3.8h3l1.2 3.4-1.8 1.4a11 11 0 005.9 5.9l1.4-1.8 3.4 1.2v3c0 .9-.8 1.6-1.7 1.5C10.9 17.7 6.3 13 5.5 5.5 5.4 4.6 6.1 3.8 7 3.8z' />
    </svg>
  )
}

export function CakeIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M4 20h16M5 20v-6.5a1.5 1.5 0 011.5-1.5h11A1.5 1.5 0 0119 13.5V20' />
      <path d='M12 12V8.5M12 8.5c-1 0-1.8-.8-1.8-1.8S12 4 12 4s1.8 1.7 1.8 2.7S13 8.5 12 8.5z' />
    </svg>
  )
}

export function LoaderIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' aria-hidden='true'>
      <path d='M12 3.5a8.5 8.5 0 108.5 8.5' />
    </svg>
  )
}

export function MoreIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
      <circle cx='5.5' cy='12' r='1.7' />
      <circle cx='12' cy='12' r='1.7' />
      <circle cx='18.5' cy='12' r='1.7' />
    </svg>
  )
}

export function FlagIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M6 21V4.5M6 5h11l-1.7 3.6L17 12H6' />
    </svg>
  )
}

/** 暂不同行 / 跳过：圆圈里一条横线 */
export function BanIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' aria-hidden='true'>
      <circle cx='12' cy='12' r='8.2' />
      <path d='M8.2 12h7.6' />
    </svg>
  )
}

/** 唱片：外圈纹路 + 中心孔，用于匹配雷达与结果页 */
export function DiscIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6' aria-hidden='true'>
      <circle cx='12' cy='12' r='8.6' />
      <circle cx='12' cy='12' r='5.4' opacity='0.6' />
      <circle cx='12' cy='12' r='1.7' fill='currentColor' stroke='none' />
    </svg>
  )
}

/** 声波：三根高低不同的竖条 */
export function WaveIcon({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' aria-hidden='true'>
      <path d='M5 10v4M9.7 6.5v11M14.3 9v6M19 7.5v9' />
    </svg>
  )
}