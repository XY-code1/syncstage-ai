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
