import { useEffect, useMemo, useRef } from 'react'
import type { MessageRow, RoomRow } from '../lib/chat-api'

/**
 * VoicesWall — the salon's emblem: the LIVE conversation as the artwork.
 * Real messages from the chain drift slowly upward as typographic slips,
 * brightening as they rise and dissolving near the top — words made of warm
 * air. Tombstoned messages drift as em-dash ghosts (the record remains).
 * No assets, no textures: the data is the art. Static frame under
 * prefers-reduced-motion; pauses offscreen and in hidden tabs.
 */

interface Slip {
  text: string
  name: string
  ghost: boolean
  x: number // 0..1
  y: number // 0..1, decreases (rises)
  speed: number
  size: number
  drift: number
  phase: number
}

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function VoicesWall({
  messages,
  rooms,
  className = '',
}: {
  messages: MessageRow[]
  rooms: RoomRow[]
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  const slips = useMemo<Slip[]>(() => {
    const rows = messages.slice(-28)
    const rand = mulberry(rows.length * 977 + Number(rooms.length) * 131 + 7)
    return rows.map((m, i) => ({
      text: m.deleted ? '— removed · the record remains —' : m.text.length > 64 ? m.text.slice(0, 61) + '…' : m.text,
      name: m.deleted ? '' : m.name,
      ghost: m.deleted,
      x: 0.08 + rand() * 0.84,
      y: 0.15 + (i / Math.max(rows.length, 1)) * 0.95,
      speed: 0.008 + rand() * 0.014, // fraction of height per second
      size: 12 + rand() * 6,
      drift: (rand() - 0.5) * 0.018,
      phase: rand() * Math.PI * 2,
    }))
  }, [messages, rooms.length])

  useEffect(() => {
    const el = host.current
    const cv = canvas.current
    if (!el || !cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dark = () => document.documentElement.classList.contains('dark')
    let raf = 0
    let running = true
    let visible = true
    let W = 0
    let H = 0
    let last = performance.now()

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(el)

    function resize() {
      if (!el || !cv || !ctx) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = el.clientWidth; H = el.clientHeight
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
      cv.style.width = `${W}px`; cv.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    // Local mutable copies so the loop animates without re-rendering React.
    const live = slips.map((s) => ({ ...s }))

    function draw(t: number, dt: number) {
      if (!ctx) return
      const isDark = dark()
      ctx.clearRect(0, 0, W, H)
      ctx.textAlign = 'left'
      for (const s of live) {
        if (!reduced) {
          s.y -= s.speed * dt
          if (s.y < -0.06) { s.y = 1.08; s.x = 0.08 + Math.random() * 0.84 }
        }
        const sway = Math.sin(t / 2400 + s.phase) * s.drift
        const x = (s.x + sway) * W
        const y = s.y * H
        // brightness: dim at the bottom, full in the middle band, dissolve on top
        const fadeTop = Math.min(Math.max((s.y - 0.02) / 0.13, 0), 1)
        const fadeBottom = Math.min(Math.max((1.02 - s.y) / 0.25, 0), 1)
        const a = Math.min(fadeTop, fadeBottom)
        if (a <= 0.01) continue
        const ink = isDark ? '236,230,246' : '34,27,46'
        const violet = isDark ? '169,143,255' : '109,74,255'
        ctx.font = `${s.ghost ? 'italic ' : ''}500 ${s.size}px "Plus Jakarta Sans Variable", sans-serif`
        ctx.fillStyle = s.ghost ? `rgba(${ink},${a * 0.28})` : `rgba(${ink},${a * 0.78})`
        ctx.fillText(s.text, x, y)
        if (s.name) {
          ctx.font = `700 ${Math.max(s.size - 3.5, 9)}px "Plus Jakarta Sans Variable", sans-serif`
          ctx.fillStyle = `rgba(${violet},${a * 0.85})`
          ctx.fillText(s.name, x, y - s.size - 2)
        }
      }
    }

    function loop(t: number) {
      if (!running) return
      const dt = Math.min((t - last) / 1000, 0.1)
      last = t
      if (visible && !document.hidden) draw(t, dt)
      raf = requestAnimationFrame(loop)
    }
    if (reduced) draw(0, 0)
    else raf = requestAnimationFrame(loop)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
    }
  }, [slips])

  return (
    <div ref={host} className={`pointer-events-none ${className}`} aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  )
}
