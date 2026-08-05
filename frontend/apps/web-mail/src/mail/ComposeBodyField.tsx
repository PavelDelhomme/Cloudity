import React, { useEffect, useRef } from 'react'

/** Éditeur riche sans remonter le DOM à chaque frappe (évite le curseur au début). */
export default function ComposeBodyField({
  slotId,
  body,
  onChange,
  className,
  id,
}: {
  slotId: string
  body: string
  onChange: (html: string) => void
  className?: string
  id?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastSlotId = useRef<string | null>(null)

  useEffect(() => {
    if (!ref.current) return
    if (lastSlotId.current !== slotId) {
      ref.current.innerHTML = body
      lastSlotId.current = slotId
    }
  }, [slotId, body])

  return (
    <div
      id={id}
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={(e) => onChange(e.currentTarget.innerHTML)}
      className={className}
    />
  )
}
