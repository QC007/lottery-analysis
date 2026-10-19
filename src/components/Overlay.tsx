import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * U-10 通用弹层（查询类详情上层展示）
 * 桌面（>640px）居中弹窗；手机（≤640px）底部抽屉（bottom sheet）。
 * Portal 到 body；ESC / 点遮罩 / 关闭按钮三种关闭途径；
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
  // render=已挂载（含出场动画期）；closing=出场动画进行中
  const [render, setRender] = useState(open)
  const [closing, setClosing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useRef(`overlay-t-${Math.random().toString(36).slice(2, 8)}`)

  // open 变化 → 进出场调度（出场 190ms 与 CSS sheet-down/overlay-pop-out 时长一致）
  useEffect(() => {
    if (open) {
      setRender(true)
      setClosing(false)
      return
    }
    if (!render) return
    setClosing(true)
    const t = setTimeout(() => {
      setRender(false)
      setClosing(false)
    }, 190)
    return () => clearTimeout(t)
  }, [open, render])

  const locked = render && !closing

  // 滚动锁定 + 焦点移入（关闭时还原 overflow 与焦点）
  useEffect(() => {
    if (!locked) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const prevFocus = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
    }
  }, [locked])

  // ESC 关闭 + Tab 焦点循环圈定（捕获阶段，防止焦点逃出弹层）
  useEffect(() => {
    if (!locked) return
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
  }, [locked, onClose])

  if (!render) return null

  return createPortal(
    <div
      className={`overlay-mask${closing ? ' is-closing' : ''}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`overlay-panel overlay-${size}${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overlay-grip" aria-hidden="true" />
        <div className="overlay-head">
          <div className="overlay-titles">
            <h3 className="overlay-title" id={titleId.current}>
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
      </div>
    </div>,
    document.body,
  )
}
