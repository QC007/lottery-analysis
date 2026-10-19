import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const fn = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return mobile
}

/**
 * U-10/U-14 通用弹层（查询类详情上层展示）
 * 桌面（>640px）居中弹窗；手机（≤640px）底部抽屉（bottom sheet）。
 * U-14 动效升级：遮罩淡入淡出 + 面板 framer-motion 弹簧动画
 * （桌面 scale+fade 弹入，手机 spring 上滑抽屉），出场由 AnimatePresence 管理。
 * a11y 行为保持：Portal 到 body；ESC / 点遮罩 / 关闭按钮三种关闭途径；
 * open 期间锁定 body 滚动、焦点移入弹层并 Tab 循环圈定，关闭后焦点还原到触发元素。
 */
export default function Overlay({
  open,
  onClose,
  title,
  subtitle,
  size = 'lg',
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  /** 桌面弹窗最大宽度档位：md 520px / lg 680px（表格宽内容用 lg） */
  size?: 'md' | 'lg'
  children: ReactNode
}) {
  const titleId = useRef(`overlay-t-${Math.random().toString(36).slice(2, 8)}`)
  return createPortal(
    <AnimatePresence>
      {open && (
        <OverlayInner
          key="overlay"
          onClose={onClose}
          title={title}
          subtitle={subtitle}
          size={size}
          titleId={titleId.current}
        >
          {children}
        </OverlayInner>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function OverlayInner({
  onClose,
  title,
  subtitle,
  size,
  titleId,
  children,
}: {
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  size: 'md' | 'lg'
  titleId: string
  children: ReactNode
}) {
  const mobile = useIsMobile()
  const panelRef = useRef<HTMLDivElement>(null)

  // 滚动锁定 + 焦点移入；卸载（含出场动画结束）时还原 overflow 与焦点
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const prevFocus = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
    }
  }, [])

  // ESC 关闭 + Tab 焦点循环圈定（捕获阶段，防止焦点逃出弹层）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const els = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <motion.div
      className="overlay-mask"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      onClick={onClose}
    >
      <motion.div
        ref={panelRef}
        className={`overlay-panel overlay-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        initial={mobile ? { y: '100%' } : { opacity: 0, scale: 0.94, y: 14 }}
        animate={
          mobile
            ? { y: 0, transition: { type: 'spring', stiffness: 380, damping: 38 } }
            : { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 32 } }
        }
        exit={
          mobile
            ? { y: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }
            : { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.19, ease: 'easeIn' } }
        }
      >
        <div className="overlay-grip" aria-hidden="true" />
        <div className="overlay-head">
          <div className="overlay-titles">
            <h3 className="overlay-title" id={titleId}>
              {title}
            </h3>
            {subtitle && <p className="overlay-sub">{subtitle}</p>}
          </div>
          <button type="button" className="overlay-close" aria-label="关闭" onClick={onClose}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="overlay-body">{children}</div>
      </motion.div>
    </motion.div>
  )
}
