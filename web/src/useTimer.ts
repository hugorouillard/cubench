import { useEffect, useRef, useState } from 'react'
import { inspectionPenalty } from './timer'
import type { Penalty } from './types'

export type TimerPhase =
  | 'idle'
  | 'holding'
  | 'ready'
  | 'inspection'
  | 'inspection-holding'
  | 'inspection-ready'
  | 'running'
  | 'stopped'

const HOLD_DELAY_MS = 350

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, select, textarea, button, [contenteditable="true"]'))
  )
}

export function useTimer(
  enabled: boolean,
  inspectionEnabled: boolean,
  onComplete: (durationMs: number, penalty: Penalty) => void,
) {
  const [phase, setPhase] = useState<TimerPhase>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const phaseRef = useRef<TimerPhase>('idle')
  const enabledRef = useRef(enabled)
  const inspectionEnabledRef = useRef(inspectionEnabled)
  const startedAtRef = useRef(0)
  const solvePenaltyRef = useRef<Penalty>('none')
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCompleteRef = useRef(onComplete)

  enabledRef.current = enabled
  inspectionEnabledRef.current = inspectionEnabled
  onCompleteRef.current = onComplete

  useEffect(() => {
    function transition(nextPhase: TimerPhase) {
      phaseRef.current = nextPhase
      setPhase(nextPhase)
    }

    function clearHoldTimeout() {
      if (holdTimeoutRef.current !== null) {
        clearTimeout(holdTimeoutRef.current)
        holdTimeoutRef.current = null
      }
    }

    function stopTimer(penalty: Penalty) {
      const durationMs = Math.max(
        0,
        Math.round(performance.now() - startedAtRef.current),
      )
      setElapsedMs(durationMs)
      transition('stopped')
      onCompleteRef.current(durationMs, penalty)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.code === 'Escape' &&
        !event.repeat &&
        phaseRef.current === 'running'
      ) {
        event.preventDefault()
        stopTimer('dnf')
        return
      }

      if (event.code !== 'Space' || event.repeat || isTypingTarget(event.target)) return
      event.preventDefault()

      if (phaseRef.current === 'running') {
        stopTimer(solvePenaltyRef.current)
        return
      }

      if (phaseRef.current === 'inspection') {
        transition('inspection-holding')
        clearHoldTimeout()
        holdTimeoutRef.current = setTimeout(() => {
          if (phaseRef.current === 'inspection-holding') {
            transition('inspection-ready')
          }
        }, HOLD_DELAY_MS)
        return
      }

      if (
        enabledRef.current &&
        (phaseRef.current === 'idle' || phaseRef.current === 'stopped')
      ) {
        if (inspectionEnabledRef.current) {
          startedAtRef.current = performance.now()
          setElapsedMs(0)
          transition('inspection')
          return
        }

        transition('holding')
        clearHoldTimeout()
        holdTimeoutRef.current = setTimeout(() => {
          if (phaseRef.current === 'holding') transition('ready')
        }, HOLD_DELAY_MS)
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return
      event.preventDefault()

      if (phaseRef.current === 'holding') {
        clearHoldTimeout()
        transition('idle')
      } else if (phaseRef.current === 'inspection-holding') {
        clearHoldTimeout()
        transition('inspection')
      } else if (phaseRef.current === 'ready') {
        clearHoldTimeout()
        solvePenaltyRef.current = 'none'
        startedAtRef.current = performance.now()
        setElapsedMs(0)
        transition('running')
      } else if (phaseRef.current === 'inspection-ready') {
        clearHoldTimeout()
        solvePenaltyRef.current = inspectionPenalty(
          performance.now() - startedAtRef.current,
        )
        startedAtRef.current = performance.now()
        setElapsedMs(0)
        transition('running')
      }
    }

    function handleBlur() {
      if (phaseRef.current === 'holding' || phaseRef.current === 'ready') {
        clearHoldTimeout()
        transition('idle')
      } else if (
        phaseRef.current === 'inspection-holding' ||
        phaseRef.current === 'inspection-ready'
      ) {
        clearHoldTimeout()
        transition('inspection')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      clearHoldTimeout()
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  useEffect(() => {
    if (
      phase !== 'inspection' &&
      phase !== 'inspection-holding' &&
      phase !== 'inspection-ready' &&
      phase !== 'running'
    ) {
      return
    }

    let animationFrame = 0
    function updateDisplay() {
      setElapsedMs(performance.now() - startedAtRef.current)
      animationFrame = requestAnimationFrame(updateDisplay)
    }
    animationFrame = requestAnimationFrame(updateDisplay)
    return () => cancelAnimationFrame(animationFrame)
  }, [phase])

  function reset() {
    if (phaseRef.current === 'running') return
    if (holdTimeoutRef.current !== null) {
      clearTimeout(holdTimeoutRef.current)
      holdTimeoutRef.current = null
    }
    phaseRef.current = 'idle'
    setPhase('idle')
    setElapsedMs(0)
  }

  return { phase, elapsedMs, reset }
}
