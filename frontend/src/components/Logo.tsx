import { Link } from 'react-router-dom'

/**
 * Official RaahiGeo logo, used consistently across the app.
 * Source files live in /public/brand/ -- do not recolor/reproportion, only resize.
 *
 * variant:
 *  - "icon"  -> hexagon + R mark only (square), for header/sidebar/favicon-style spots
 *  - "full"  -> icon + "RaahiGeo" wordmark + tagline, for Login/Signup centerpiece
 */
export default function Logo({
  variant = 'icon',
  size = 40,
  linkToHome = false,
  className = '',
}: {
  variant?: 'icon' | 'full'
  size?: number
  linkToHome?: boolean
  className?: string
}) {
  const src = variant === 'icon' ? '/brand/logo-icon.png' : '/brand/logo-full.png'

  const img = (
    <img
      src={src}
      alt="RaahiGeo"
      style={variant === 'icon' ? { height: size, width: size } : { width: size, height: 'auto' }}
      className={`shrink-0 object-contain ${
        variant === 'icon' ? 'rounded-md bg-white p-[3px]' : ''
      } ${className}`}
    />
  )

  if (linkToHome) {
    return (
      <Link to="/" aria-label="RaahiGeo Home" className="inline-flex items-center">
        {img}
      </Link>
    )
  }
  return img
}
