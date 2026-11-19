type Props = { code: string; size?: number }

const brandAssets: Record<string, { src: string; label: string; lockup?: boolean }> = {
  baridimob: { src: 'https://www.zarkachat.com/wp-content/uploads/2021/09/barede-mob-3773.png', label: 'BaridiMob app logo' },
  binance: { src: 'https://veltimpera.com/images/partner/binance.png', label: 'Binance logo', lockup: true },
  redotpay: { src: 'https://eu-images.contentstack.com/v3/assets/blt7dacf616844cf077/blt899c10ff5923c189/68d69eda4192d7be6f770dd1/RedotPay_1280.png', label: 'RedotPay logo', lockup: true },
  paysera: { src: 'https://d35z3p2poghz10.cloudfront.net/apps/thirdparty/paysera/logo.png', label: 'Paysera logo', lockup: true },
}

export default function PaymentMethodLogo({ code, size = 38 }: Props) {
  const asset = brandAssets[code]
  if (!asset) return <span className="payment-method-logo payment-method-fallback" aria-label={code}>{code.slice(0, 2).toUpperCase()}</span>
  return <img
    className={asset.lockup ? 'payment-method-logo payment-method-brand-lockup' : 'payment-method-logo payment-method-app-icon'}
    src={asset.src}
    alt={asset.label}
    width={asset.lockup ? size * 1.8 : size}
    height={size}
    loading="lazy"
    referrerPolicy="no-referrer"
  />
}
