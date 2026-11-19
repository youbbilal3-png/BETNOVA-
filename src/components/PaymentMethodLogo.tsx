import type { SVGProps } from 'react'

type Props = { code: string; size?: number }

export default function PaymentMethodLogo({ code, size = 38 }: Props) {
  const common: SVGProps<SVGSVGElement> = { width: size, height: size, viewBox: '0 0 48 48', role: 'img', 'aria-label': code }
  if (code === 'binance') return <svg {...common}><rect x="1" y="1" width="46" height="46" rx="13" fill="#F0B90B"/><g fill="#fff" transform="translate(24 24) rotate(45)"><rect x="-5" y="-5" width="10" height="10"/><rect x="-15" y="-3.5" width="7" height="7"/><rect x="8" y="-3.5" width="7" height="7"/><rect x="-3.5" y="-15" width="7" height="7"/><rect x="-3.5" y="8" width="7" height="7"/><rect x="-3" y="-3" width="6" height="6" fill="#F0B90B"/></g></svg>
  if (code === 'baridimob') return <svg {...common}><rect x="1" y="1" width="46" height="46" rx="13" fill="#F5F9FF"/><path d="M12 10h17c6 0 10 4 10 9 0 4-2 6-5 8 3 1 5 4 5 7 0 3-3 5-7 5H12z" fill="#1473B8"/><path d="M18 15h10c3 0 5 2 5 4s-2 4-5 4H18zm0 14h11c3 0 5 1 5 3s-2 3-5 3H18z" fill="#fff"/><path d="M8 9l7 4v22l-7 4z" fill="#F5C400"/></svg>
  if (code === 'redotpay') return <svg {...common}><rect x="1" y="1" width="46" height="46" rx="13" fill="#E83C45"/><path d="M14 35V13h12c7 0 11 4 11 10 0 5-3 8-8 9l8 3h-9l-8-4v4zm6-10h6c3 0 5-1 5-3s-2-3-5-3h-6z" fill="#fff"/></svg>
  if (code === 'paysera') return <svg {...common}><rect x="1" y="1" width="46" height="46" rx="13" fill="#153C70"/><path d="M15 35V13h12c7 0 11 4 11 10s-4 10-11 10h-5v2zm7-9h5c3 0 5-1 5-3s-2-3-5-3h-5z" fill="#fff"/><circle cx="13" cy="35" r="3" fill="#46C4A0"/></svg>
  return <svg {...common}><rect x="1" y="1" width="46" height="46" rx="13" fill="#173D32"/><path d="M24 9l12 6v18l-12 6-12-6V15z" fill="none" stroke="#8EE2B5" strokeWidth="3"/><path d="M18 24h12" stroke="#8EE2B5" strokeWidth="3" strokeLinecap="round"/></svg>
}
