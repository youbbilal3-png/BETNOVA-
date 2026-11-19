import type { SVGProps } from 'react'

type Props = { code: string; size?: number }

export default function PaymentMethodLogo({ code, size = 38 }: Props) {
  const common: SVGProps<SVGSVGElement> = { width: size, height: size, viewBox: '0 0 48 48', role: 'img', 'aria-label': code, focusable: 'false' }
  if (code === 'baridimob') return <span className="payment-method-logo baridimob-logo" role="img" aria-label="BaridiMob"><img src="https://www.zarkachat.com/wp-content/uploads/2021/09/barede-mob-3773.png" alt="" /></span>
  if (code === 'binance') return <svg {...common}><rect width="48" height="48" rx="12" fill="#F0B90B"/><g fill="#fff" transform="translate(24 24) rotate(45)"><path d="M0-15 5-10 0-5-5-10zM10-5 15 0 10 5 5 0zM0 5 5 10 0 15-5 10zM-10-5-5 0-10 5-15 0zM0-5 5 0 0 5-5 0z"/></g></svg>
  if (code === 'redotpay') return <svg {...common}><rect width="48" height="48" rx="12" fill="#fff"/><path d="M11 37V11h14c8 0 13 4.5 13 11.5 0 6-3.7 9.8-10.1 11L38 37H27.5l-8-4.5V37zm8.5-13h5.2c3.3 0 5-1 5-3s-1.7-3-5-3h-5.2z" fill="#EB0028"/></svg>
  if (code === 'paysera') return <svg {...common}><rect width="48" height="48" rx="12" fill="#fff"/><path d="M11 13c0-3 2-5 5-5h15c4 0 7 3 7 7v2c0 3-2 5-5 6l-9 3c-2 .7-3 1.5-3 3v1h17v7H13v-8c0-6 3-9 9-11l8-2v-1H11z" fill="#183D70"/><path d="M13 37h15" stroke="#42B99A" strokeWidth="3" strokeLinecap="round"/></svg>
  return <svg {...common}><rect width="48" height="48" rx="12" fill="#173D32"/><path d="M24 8 39 16.5v15L24 40 9 31.5v-15z" fill="none" stroke="#8EE2B5" strokeWidth="3"/><path d="M17 24h14" stroke="#8EE2B5" strokeWidth="3" strokeLinecap="round"/></svg>
}
