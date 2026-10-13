import type { IconWeight, PhosphorIcon } from '@/src/components/shared/icons'
import { useTheme } from '@/src/theme/ThemeProvider'

interface IconProps {
  icon: PhosphorIcon
  size?: number
  color?: string
  weight?: IconWeight
}

export function Icon({ icon: IconComponent, size = 20, color, weight = 'regular' }: IconProps) {
  const { tokens } = useTheme()
  return <IconComponent size={size} color={color ?? tokens.text} weight={weight} />
}
