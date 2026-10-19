import { motion, type HTMLMotionProps } from 'framer-motion'

/**
 * U-14 卡片入场弹簧动效：仅在懒加载分区（走势/选号/历史/进阶）使用，
 * framer-motion 不会进入首包。delay 用于同页多卡的依次浮现。
 */
export default function MotionCard({
  delay = 0,
  ...rest
}: { delay?: number } & HTMLMotionProps<'section'>) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30, delay }}
      {...rest}
    />
  )
}
